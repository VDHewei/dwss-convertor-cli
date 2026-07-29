import { describe, expect, test } from 'bun:test';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { CliError } from '../src/utils/errors.js';
import { runCommand, type CommandIo } from '../src/cmd/command.js';
import { makeDocx } from './helpers.js';

const runtime = join(process.cwd(), 'test', '.runtime-ux');

function memoryIo(): { io: CommandIo; out: string[]; errors: string[]; progress: string[] } {
  const out: string[] = [];
  const errors: string[] = [];
  const progress: string[] = [];
  return {
    out,
    errors,
    progress,
    io: {
      out: (message) => out.push(message),
      error: (message) => errors.push(message),
      confirm: async () => true,
      progress: {
        start: (message) => progress.push(`start:${message}`),
        update: (message) => progress.push(`update:${message}`),
        stop: (message) => progress.push(`stop:${message}`),
      },
    },
  };
}

describe('CLI replacement, find, and fix UX', () => {
  test('reports individual replacement hit counts', async () => {
    await mkdir(runtime, { recursive: true });
    const input = join(runtime, 'single.docx');
    const output = join(runtime, 'single-output.docx');
    await writeFile(input, await makeDocx('<w:p><w:r><w:t>Alpha Alpha</w:t></w:r></w:p>'));
    const state = memoryIo();
    expect(await runCommand(['replace', input, 'Alpha', 'One', '--output', output], state.io)).toBe(0);
    expect(state.out.join('\n')).toContain('"Alpha" → "One": 2 hits.');
    expect(state.out.join('\n')).toContain('Total replacement hits: 2.');
    await rm(runtime, { recursive: true, force: true });
  });

  test('reports batch hit counts and does not write output when a mapping has no match', async () => {
    await mkdir(runtime, { recursive: true });
    const input = join(runtime, 'source.docx');
    const mappings = join(runtime, 'mappings.txt');
    const output = join(runtime, 'output.docx');
    await writeFile(input, await makeDocx('<w:p><w:r><w:t>Alpha Beta</w:t></w:r></w:p>'));
    await writeFile(mappings, '"Alpha" : "One"\n"Missing" : "None"', 'utf8');
    const state = memoryIo();
    await expect(runCommand(['replace', input, '--replacements-file', mappings, '--output', output], state.io)).rejects.toBeInstanceOf(CliError);
    expect(state.out.join('\n')).toContain('"Alpha" → "One": 1 hit.');
    expect(state.out.join('\n')).toContain('"Missing" → "None": 0 hits.');
    await expect(readFile(output)).rejects.toThrow();
    await rm(runtime, { recursive: true, force: true });
  });

  test('find preserves query order, uses literal case-sensitive matching, and writes JSON', async () => {
    await mkdir(runtime, { recursive: true });
    const input = join(runtime, 'find.docx');
    const output = join(runtime, 'matches.json');
    await writeFile(input, await makeDocx('<w:p><w:r><w:t>Alpha beta</w:t></w:r></w:p><w:p><w:r><w:t>beta only</w:t></w:r></w:p>'));
    const state = memoryIo();
    expect(await runCommand(['find', input, 'beta', 'Beta', '--json', output], state.io)).toBe(0);
    expect(JSON.parse(await readFile(output, 'utf8'))).toEqual([
      { find: 'beta', matches: ['Alpha beta', 'beta only'] },
      { find: 'Beta', matches: [] },
    ]);
    expect(state.out.join('\n')).toContain('No matching lines.');
    await rm(runtime, { recursive: true, force: true });
  });

  test('find --json without path prints prettified JSON to terminal', async () => {
    await mkdir(runtime, { recursive: true });
    const input = join(runtime, 'find-stdout.docx');
    await writeFile(input, await makeDocx('<w:p><w:r><w:t>Alpha beta</w:t></w:r></w:p><w:p><w:r><w:t>beta only</w:t></w:r></w:p>'));
    const state = memoryIo();
    expect(await runCommand(['find', input, 'beta', '--json'], state.io)).toBe(0);
    expect(state.out).toHaveLength(1);
    expect(state.out[0]).toContain('\n  {');
    expect(JSON.parse(state.out[0])).toEqual([
      { find: 'beta', matches: ['Alpha beta', 'beta only'] },
    ]);
    await rm(runtime, { recursive: true, force: true });
  });

  test('fix reports progress, diffs, individual counts, and totals', async () => {
    await mkdir(runtime, { recursive: true });
    const input = join(runtime, 'fix.docx');
    const output = join(runtime, 'fixed.docx');
    await writeFile(input, await makeDocx('<w:p><w:r><w:t>+++INS ensureArray(value)， "，"+++</w:t></w:r></w:p>'));
    const state = memoryIo();
    expect(await runCommand(['fix', input, '--output', output], state.io)).toBe(0);
    expect(state.progress.some((message) => message.startsWith('start:Scanning'))).toBe(true);
    expect(state.progress.some((message) => message.startsWith('stop:Processed'))).toBe(true);
    expect(state.out.join('\n')).toContain('Deterministic replacement (1 hit):');
    expect(state.out.join('\n')).toContain('- +++INS ensureArray(value)， "，"+++');
    expect(state.out.join('\n')).toContain('+ +++INS ensureArray(value), "，"+++');
    expect(state.out.join('\n')).toContain('1 total replacement hit(s).');
    await rm(runtime, { recursive: true, force: true });
  });
});
