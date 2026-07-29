import { describe, expect, test } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { runCommand } from '../src/cmd/command.js';
import { makeDocx } from './helpers.js';

const runtime = join(process.cwd(), 'test', '.runtime');

describe('command logic', () => {
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
