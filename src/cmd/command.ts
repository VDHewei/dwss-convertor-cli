import * as clack from '@clack/prompts';
import chalk from 'chalk';
import { readFile, writeFile } from 'node:fs/promises';
import { stdin, stdout } from 'node:process';

import { loadRenderData } from '../services/data-source.js';
import { CliError } from '../utils/errors.js';
import { extractDocxVisibleLines, replaceDocxText, replaceDocxTextBatch } from '../services/ooxml.js';
import { parseReplacementFile, type TextReplacement } from '../utils/replacements.js';
import { renderDocx } from '../services/render.js';
import { fixDocxTemplate, type FixProgress, type FixResult } from '../services/template-fix.js';
import { validateDocxTemplate } from '../services/template-validation.js';

export interface CommandIo {
  out(message: string): void;
  error(message: string): void;
  confirm?(question: string): Promise<boolean>;
  progress?: FixProgress;
}

function defaultCommandIo(): CommandIo {
  const interactive = Boolean(stdin.isTTY && stdout.isTTY);
  let spinner: ReturnType<typeof clack.spinner> | undefined;
  const write = (message: string) => stdout.write(`${message}\n`);
  return {
    out(message) {
      if (interactive) clack.log.info(chalk.cyan(message));
      else write(message);
    },
    error(message) {
      if (interactive) clack.log.error(chalk.red(message));
      else process.stderr.write(`${chalk.red(message)}\n`);
    },
    async confirm(question) {
      if (!interactive) throw new CliError(`Interactive confirmation is required. ${question}`);
      const response = await clack.confirm({ message: chalk.yellow(question), initialValue: false });
      if (clack.isCancel(response)) throw new CliError('Confirmation cancelled.');
      return response;
    },
    progress: {
      start(message) {
        if (interactive) {
          spinner = clack.spinner();
          spinner.start(chalk.cyan(message));
        } else write(chalk.dim(message));
      },
      update(message) {
        if (interactive) spinner?.message(chalk.cyan(message));
        else write(chalk.dim(message));
      },
      stop(message) {
        if (interactive) spinner?.stop(chalk.green(message));
        else write(chalk.dim(message));
      },
    },
  };
}

interface Parsed {
  positionals: string[];
  options: Record<string, string | true>;
}

interface FindResult {
  find: string;
  matches: string[];
}

function parse(args: string[]): Parsed {
  const positionals: string[] = [];
  const options: Record<string, string | true> = {};
  for (let index = 0; index < args.length; index++) {
    const value = args[index];
    if (!value.startsWith('--')) {
      positionals.push(value);
      continue;
    }
    const equals = value.indexOf('=');
    if (equals >= 0) {
      options[value.slice(2, equals)] = value.slice(equals + 1);
      continue;
    }
    const next = args[index + 1];
    if (!next || next.startsWith('--')) options[value.slice(2)] = true;
    else {
      options[value.slice(2)] = next;
      index++;
    }
  }
  return { positionals, options };
}

function option(options: Parsed['options'], name: string): string | undefined {
  const value = options[name];
  if (value === true) throw new CliError(`--${name} requires a value.`);
  return value;
}

function requiredOption(options: Parsed['options'], name: string): string {
  return option(options, name) ?? (() => { throw new CliError(`--${name} is required.`); })();
}

function usage(): string {
  return [
    'Usage:',
    '  dwss-convertor-cli replace <input.docx> <find> <replacement> --output <output.docx>',
    '  dwss-convertor-cli replace <input.docx> --replacements-file <mappings.txt> --output <output.docx>',
    '  dwss-convertor-cli find <input.docx> <find...> [--find-file <queries.txt>] [--json <output.json>]',
    '  dwss-convertor-cli check <input.docx> [--data-file <data.json>]',
    '  dwss-convertor-cli fix <input.docx> --output <output.docx> [--data-file <data.json>]',
    '  dwss-convertor-cli render <input.docx> --output <output.docx> (--data-file <data.json> | --data-url <url> [--method GET | --method POST --body <json>])',
  ].join('\n');
}

function displayFixChanges(io: CommandIo, result: FixResult): void {
  for (const change of result.changes) {
    io.out(chalk.bold(`${change.kind === 'deterministic' ? 'Deterministic' : 'Confirmed'} replacement (${change.count} hit${change.count === 1 ? '' : 's'}):`));
    io.out(chalk.red(`- ${change.before}`));
    io.out(chalk.green(`+ ${change.after}`));
  }
}

function mappingLabel(mapping: TextReplacement): string {
  return `${JSON.stringify(mapping.find)} → ${JSON.stringify(mapping.replacement)}`;
}

async function replaceWithMappings(input: Uint8Array, mappings: TextReplacement[], io: CommandIo): Promise<Uint8Array> {
  const result = await replaceDocxTextBatch(input, mappings);
  const noHits = mappings.filter((_, index) => result.counts[index] === 0);
  for (const [index, mapping] of mappings.entries()) {
    io.out(`${mappingLabel(mapping)}: ${result.counts[index]} hit${result.counts[index] === 1 ? '' : 's'}.`);
  }
  if (noHits.length) {
    throw new CliError(`No matches for ${noHits.map(mappingLabel).join(', ')}. No output file was written.`);
  }
  io.out(chalk.bold(`Total replacement hits: ${result.counts.reduce((total, count) => total + count, 0)}.`));
  return result.document;
}

async function loadFindQueries(parsed: Parsed): Promise<string[]> {
  const queries = [...parsed.positionals.slice(1)];
  const findFile = option(parsed.options, 'find-file');
  if (findFile) {
    const fromFile = (await readFile(findFile, 'utf8')).split(/\r?\n/).filter((line) => line !== '');
    queries.push(...fromFile);
  }
  if (!queries.length) throw new CliError('find requires at least one non-empty search string.');
  if (queries.some((query) => query === '')) throw new CliError('find does not accept an empty search string.');
  return queries;
}

export async function runCommand(args: string[], io: CommandIo = defaultCommandIo()): Promise<number> {
  const [command, ...rest] = args;
  if (!command || command === '--help' || command === 'help') {
    io.out(usage());
    return 0;
  }
  const parsed = parse(rest);
  if (command === 'replace') {
    const replacementsFile = option(parsed.options, 'replacements-file');
    const input = parsed.positionals[0];
    if (!input) throw new CliError('replace requires <input.docx>.');
    if (replacementsFile) {
      if (parsed.positionals.length !== 1) throw new CliError('Batch replace accepts only <input.docx>; mappings must come from --replacements-file.');
      const mappings = parseReplacementFile(await readFile(replacementsFile, 'utf8'));
      const document = await replaceWithMappings(await readFile(input), mappings, io);
      await writeFile(requiredOption(parsed.options, 'output'), document);
      return 0;
    }
    if (parsed.positionals.length !== 3) throw new CliError('replace requires <input.docx> <find> <replacement>.');
    const [, find, replacement] = parsed.positionals;
    const result = await replaceDocxText(await readFile(input), find, replacement);
    if (result.count === 0) throw new CliError(`No ${JSON.stringify(find)} text was found in ${input}. No output file was written.`);
    await writeFile(requiredOption(parsed.options, 'output'), result.document);
    io.out(`${JSON.stringify(find)} → ${JSON.stringify(replacement)}: ${result.count} hit${result.count === 1 ? '' : 's'}.`);
    io.out(chalk.bold(`Total replacement hits: ${result.count}.`));
    return 0;
  }
  if (command === 'find') {
    if (!parsed.positionals[0]) throw new CliError('find requires <input.docx>.');
    const queries = await loadFindQueries(parsed);
    const lines = await extractDocxVisibleLines(await readFile(parsed.positionals[0]));
    const results: FindResult[] = queries.map((find) => ({ find, matches: lines.filter((line) => line.includes(find)) }));
    for (const result of results) {
      io.out(chalk.bold(`${JSON.stringify(result.find)}: ${result.matches.length} matching line${result.matches.length === 1 ? '' : 's'}.`));
      if (!result.matches.length) io.out('  No matching lines.');
      for (const line of result.matches) io.out(`  ${line}`);
    }
    const jsonOutput = option(parsed.options, 'json');
    if (jsonOutput) await writeFile(jsonOutput, JSON.stringify(results), 'utf8');
    return 0;
  }
  if (command === 'check') {
    if (parsed.positionals.length !== 1) throw new CliError('check requires <input.docx>.');
    const dataFile = option(parsed.options, 'data-file');
    if (dataFile) await loadRenderData({ dataFile });
    const validation = await validateDocxTemplate(await readFile(parsed.positionals[0]));
    if (validation.valid) {
      io.out('Template check passed.');
      return 0;
    }
    for (const issue of validation.issues) io.error(`${issue.part}:${issue.offset} ${issue.kind}: ${issue.message}${issue.repair ? ` Suggested repair: ${issue.repair}` : ''}`);
    return 1;
  }
  if (command === 'fix') {
    if (parsed.positionals.length !== 1) throw new CliError('fix requires <input.docx>.');
    const dataFile = option(parsed.options, 'data-file');
    if (dataFile) await loadRenderData({ dataFile });
    const result = await fixDocxTemplate(await readFile(parsed.positionals[0]), io.confirm ?? defaultCommandIo().confirm!, io.progress);
    displayFixChanges(io, result);
    const validation = await validateDocxTemplate(result.document);
    if (!validation.valid) {
      for (const issue of validation.issues) io.error(`${issue.part}:${issue.offset} ${issue.kind}: ${issue.message}`);
      return 1;
    }
    await writeFile(requiredOption(parsed.options, 'output'), result.document);
    const total = result.deterministicChanges + result.confirmedFunctionChanges;
    io.out(chalk.bold(`Applied ${result.deterministicChanges} deterministic and ${result.confirmedFunctionChanges} confirmed function repair(s); ${total} total replacement hit(s).`));
    return 0;
  }
  if (command === 'render') {
    if (parsed.positionals.length !== 1) throw new CliError('render requires <input.docx>.');
    const template = await readFile(parsed.positionals[0]);
    const validation = await validateDocxTemplate(template);
    if (!validation.valid) {
      const details = validation.issues.map((issue) => `${issue.part}:${issue.offset} ${issue.kind}: ${issue.message}`).join('\n');
      throw new CliError(`Template validation failed:\n${details}`);
    }
    const data = await loadRenderData({
      dataFile: option(parsed.options, 'data-file'),
      dataUrl: option(parsed.options, 'data-url'),
      method: option(parsed.options, 'method'),
      body: option(parsed.options, 'body'),
    });
    const rendered = await renderDocx(template, data);
    await writeFile(requiredOption(parsed.options, 'output'), rendered);
    io.out(`Rendered ${requiredOption(parsed.options, 'output')}.`);
    return 0;
  }
  throw new CliError(`Unknown command "${command}".\n${usage()}`);
}
