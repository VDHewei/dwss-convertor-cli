import { describe, expect, test } from 'bun:test';

import { CliError } from '../src/utils/errors.js';
import { fixDocxTemplate } from '../src/services/template-fix.js';
import { documentXml, makeDocx } from './helpers.js';

describe('template fix', () => {
  test('repairs deterministic full-width commas without touching quoted text', async () => {
    const input = await makeDocx('<w:p><w:r><w:t>+++INS ensureArray(value)， "，"+++</w:t></w:r></w:p>');
    const result = await fixDocxTemplate(input, async () => false);
    expect(result.deterministicChanges).toBe(1);
    expect(await documentXml(result.document)).toContain('+++INS ensureArray(value), &quot;，&quot;+++');
  });

  test('requires confirmation before renaming an unknown function', async () => {
    const input = await makeDocx('<w:p><w:r><w:t>+++INS ensureAray(value)+++</w:t></w:r></w:p>');
    await expect(fixDocxTemplate(input, async () => false)).rejects.toBeInstanceOf(CliError);

    const confirmed = await fixDocxTemplate(input, async (question) => question.includes('ensureArray'));
    expect(confirmed.confirmedFunctionChanges).toBe(1);
    expect(await documentXml(confirmed.document)).toContain('ensureArray(value)');
  });
});
