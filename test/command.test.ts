import { describe, expect, test } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { highlightLiteralMatches, runCommand } from '../src/cmd/command';
import { makeDocx } from './helpers';

const runtime = join(process.cwd(), 'test', '.runtime');

describe('command logic', () => {
  test('highlights matched literal segments for find output', () => {
    const rendered = highlightLiteralMatches('alpha beta beta', 'beta', (value) => `<red>${value}</red>`);
    expect(rendered).toBe('alpha <red>beta</red> <red>beta</red>');
  });

  test('help aliases output usage', async () => {
    const outputs: string[] = [];
    const io = { out: (message: string) => outputs.push(message), error: () => undefined };
    expect(await runCommand(['help'], io)).toBe(0);
    expect(await runCommand(['h'], io)).toBe(0);
    expect(await runCommand(['-h'], io)).toBe(0);
    expect(outputs.every((message) => message.startsWith('dwss-convertor-cli is a tool for safe DOCX template check, fix, replace, find, and render workflows.'))).toBe(true);
    expect(outputs.some((message) => message.includes('\nUsage:\n'))).toBe(true);
  });

  test('check returns nonzero and reports validation errors', async () => {
    await mkdir(runtime, { recursive: true });
    const input = join(runtime, 'invalid.docx');
    await writeFile(input, await makeDocx('<w:p><w:r><w:t>+++INS unknown(value)+++</w:t></w:r></w:p>'));
    const errors: string[] = [];
    const exitCode = await runCommand(['check', input], { out: () => undefined, error: (message) => errors.push(message) });
    expect(exitCode).toBe(1);
    expect(errors.join('\n')).toContain('unknown-function');
    await rm(runtime, { recursive: true, force: true });
  });
});
