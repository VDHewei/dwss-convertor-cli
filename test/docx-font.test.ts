import { describe, expect, test } from 'bun:test';

import { deobfuscateDocxFont, parseDocxStylesFonts, parseDocxThemeFonts, resolveDocxRunFonts } from '../src/services/docx-font.js';

describe('DOCX font helpers', () => {
  test('resolves direct and themed default fonts', () => {
    const styles = parseDocxStylesFonts('<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:asciiTheme="minorHAnsi" w:eastAsia="PMingLiU"/></w:rPr></w:rPrDefault></w:docDefaults>');
    const theme = parseDocxThemeFonts('<a:fontScheme name="Office"><a:minorFont><a:latin typeface="Aptos"/><a:ea typeface="Microsoft JhengHei"/><a:cs typeface="Arial"/></a:minorFont></a:fontScheme>');
    expect(resolveDocxRunFonts(styles, theme)).toEqual({
      ascii: 'Aptos',
      hAnsi: undefined,
      eastAsia: 'PMingLiU',
      cs: undefined,
    });
  });

  test('deobfuscates embedded font bytes symmetrically', () => {
    const source = Buffer.from(Array.from({ length: 40 }, (_, index) => index));
    const encoded = deobfuscateDocxFont(source, '00112233-4455-6677-8899-aabbccddeeff');
    expect(deobfuscateDocxFont(encoded, '00112233-4455-6677-8899-aabbccddeeff')).toEqual(source);
  });
});
