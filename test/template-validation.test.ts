import { describe, expect, test } from 'bun:test';

import { validateDocxTemplate, validateTemplateText } from '../src/services/template-validation.js';
import { makeDocx } from './helpers.js';

describe('template validation', () => {
  test('accepts registered functions and delimiters inside quoted strings', () => {
    const result = validateTemplateText('+++INS ensureArray(value).join(")")+++');
    expect(result.valid).toBe(true);
  });

  test('accepts legacy equals-prefixed template statements', () => {
    const result = validateTemplateText("+++=builder.summarySectionItems('Pass');+++");
    expect(result.valid).toBe(true);
  });

  test('recognizes FOR IN and compact IMAGE commands without fake unknown functions', () => {
    const result = validateTemplateText('+++FOR image IN ensureArray(images)++++++IMAGErenderImage(image, {scale: {width: 100}})++++++END-FOR image+++');
    expect(result.valid).toBe(true);
  });

  test('reports missing tokens and unknown functions', () => {
    const result = validateTemplateText('+++INS missingFn(value+++');
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.kind)).toEqual(['token', 'unknown-function']);
    expect(result.issues[0].repair).toBe(')');
  });

  test('validates template expressions split across text runs', async () => {
    const document = await makeDocx('<w:p><w:r><w:t>+++INS ensure</w:t></w:r><w:r><w:t>Array(value)+++</w:t></w:r></w:p>');
    expect((await validateDocxTemplate(document)).valid).toBe(true);
  });
});
