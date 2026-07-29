import { describe, expect, test } from 'bun:test';

import { CliError } from '../src/utils/errors.js';
import { replaceDocxTextBatch } from '../src/services/ooxml.js';
import { parseReplacementFile } from '../src/utils/replacements.js';
import { documentXml, makeDocx, stylesXml } from './helpers.js';

describe('batch replacement mappings', () => {
  test('parses quoted mappings with escaped quotes and backslashes', () => {
    const mappings = parseReplacementFile('"old \\"quote\\" \\\\" : "new\\\\value"\n"second" : "replacement"');
    expect(mappings.map(({ find, replacement }) => ({ find, replacement }))).toEqual([
      { find: 'old "quote" \\', replacement: 'new\\value' },
      { find: 'second', replacement: 'replacement' },
    ]);
  });

  test('rejects malformed, duplicate, and ambiguous source mappings', () => {
    expect(() => parseReplacementFile('"old" "new"')).toThrow(CliError);
    expect(() => parseReplacementFile('"old" : "one"\n"old" : "two"')).toThrow('duplicate');
    expect(() => parseReplacementFile('"old" : "one"\n"older" : "two"')).toThrow('ambiguous');
  });

  test('replaces mappings atomically while retaining DOCX styles', async () => {
    const source = await makeDocx('<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Alpha</w:t></w:r><w:r><w:t> Beta</w:t></w:r></w:p>');
    const result = await replaceDocxTextBatch(source, [
      { find: 'Alpha', replacement: 'One', line: 1 },
      { find: 'Beta', replacement: 'Two', line: 2 },
    ]);
    expect(result.counts).toEqual([1, 1]);
    expect(await documentXml(result.document)).toContain('<w:rPr><w:b/></w:rPr><w:t>One</w:t>');
    expect(await documentXml(result.document)).toContain('<w:t> Two</w:t>');
    expect(await stylesXml(result.document)).toBe(await stylesXml(source));
  });
});
