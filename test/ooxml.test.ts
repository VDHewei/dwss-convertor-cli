import { describe, expect, test } from 'bun:test';

import { replaceDocxText } from '../src/services/ooxml';
import { documentXml, makeDocx, stylesXml } from './helpers';

describe('DOCX text replacement', () => {
  test('changes only w:t content when a match crosses formatted runs', async () => {
    const source = await makeDocx('<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Hel</w:t></w:r><w:r><w:rPr><w:color w:val="FF0000"/></w:rPr><w:t>lo</w:t></w:r></w:p>');
    const sourceStyles = await stylesXml(source);

    const result = await replaceDocxText(source, 'Hello', 'Hi');
    const xml = await documentXml(result.document);

    expect(result.count).toBe(1);
    expect(xml).toContain('<w:rPr><w:b/></w:rPr><w:t>Hi</w:t>');
    expect(xml).toContain('<w:rPr><w:color w:val="FF0000"/></w:rPr><w:t></w:t>');
    expect(await stylesXml(result.document)).toBe(sourceStyles);
  });
});
