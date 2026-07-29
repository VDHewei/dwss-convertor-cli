import { describe, expect, test } from 'bun:test';

import { fixDocxTemplate } from '../src/services/template-fix.js';
import { validateDocxTemplate } from '../src/services/template-validation.js';
import { documentXml, makeDocx } from './helpers.js';

describe('deterministic JavaScript template repairs', () => {
  test('normalizes paired smart string delimiters but leaves ordinary text alone', async () => {
    const input = await makeDocx('<w:p><w:r><w:t>+++renderQuestion(template, answers, status, ‘CELL_1’).description+++</w:t></w:r></w:p>');
    const result = await fixDocxTemplate(input, async () => false);
    expect(result.deterministicChanges).toBe(1);
    expect(await documentXml(result.document)).toContain('renderQuestion(template, answers, status, &apos;CELL_1&apos;).description');
    expect((await validateDocxTemplate(result.document)).valid).toBe(true);
  });

  test('adds one unambiguous missing closing token', async () => {
    const input = await makeDocx('<w:p><w:r><w:t>+++FOR image IN (ensureArray(images) || []+++</w:t></w:r></w:p>');
    const result = await fixDocxTemplate(input, async () => false);
    expect(result.deterministicChanges).toBe(1);
    expect(await documentXml(result.document)).toContain('+++FOR image IN (ensureArray(images) || [])+++');
    expect((await validateDocxTemplate(result.document)).valid).toBe(true);
  });

  test('removes one unambiguous unexpected closing token', async () => {
    const input = await makeDocx('<w:p><w:r><w:t>+++INS ensureArray(items))+++</w:t></w:r></w:p>');
    const result = await fixDocxTemplate(input, async () => false);
    expect(result.deterministicChanges).toBe(1);
    expect(await documentXml(result.document)).toContain('+++INS ensureArray(items)+++');
    expect((await validateDocxTemplate(result.document)).valid).toBe(true);
  });

  test('removes adjacent unexpected closing tokens one at a time', async () => {
    const input = await makeDocx('<w:p><w:r><w:t>+++INS ensureArray(items)))+++</w:t></w:r></w:p>');
    const result = await fixDocxTemplate(input, async () => false);
    expect(result.deterministicChanges).toBe(1);
    expect(await documentXml(result.document)).toContain('+++INS ensureArray(items)+++');
    expect((await validateDocxTemplate(result.document)).valid).toBe(true);
  });

  test('does not repair multiple missing tokens', async () => {
    const input = await makeDocx('<w:p><w:r><w:t>+++INS ensureArray(items[+++</w:t></w:r></w:p>');
    const result = await fixDocxTemplate(input, async () => false);
    expect(result.deterministicChanges).toBe(0);
  });
});
