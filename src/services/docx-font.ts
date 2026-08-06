import JSZip from 'jszip';

export type DocxEmbeddedFontStyle = 'regular' | 'bold' | 'italic' | 'boldItalic';

export interface DocxRunFonts {
  ascii?: string;
  hAnsi?: string;
  eastAsia?: string;
  cs?: string;
  asciiTheme?: string;
  hAnsiTheme?: string;
  eastAsiaTheme?: string;
  csTheme?: string;
}

export interface DocxThemeFontFace {
  latin?: string;
  eastAsia?: string;
  complexScript?: string;
  scriptOverrides: Record<string, string>;
}

export interface DocxThemeFonts {
  schemeName?: string;
  major?: DocxThemeFontFace;
  minor?: DocxThemeFontFace;
}

export interface DocxResolvedFonts {
  ascii?: string;
  hAnsi?: string;
  eastAsia?: string;
  cs?: string;
}

export interface DocxEmbeddedFont {
  name: string;
  style: DocxEmbeddedFontStyle;
  relationshipId: string;
  target: string;
  path: string;
  fontKey?: string;
  isObfuscated: boolean;
  rawBuffer: Buffer;
  buffer: Buffer;
}

export interface DocxFontConfig {
  docDefaults?: DocxRunFonts;
  themeFonts?: DocxThemeFonts;
  resolvedDefaults: DocxResolvedFonts;
  embeddedFonts: DocxEmbeddedFont[];
}

function attributes(tag: string): Record<string, string> {
  return Object.fromEntries([...tag.matchAll(/(?:[\w-]+:)?([\w-]+)=["']([^"']*)["']/g)].map((match) => [match[1], match[2]]));
}

function firstTag(xml: string, name: string): { tag: string; inner: string } | undefined {
  const match = new RegExp(`<\\w*:?${name}\\b[^>]*>([\\s\\S]*?)<\\/\\w*:?${name}>`, 'i').exec(xml);
  return match ? { tag: match[0], inner: match[1] } : undefined;
}

function selfClosingTag(xml: string, name: string): string | undefined {
  return new RegExp(`<\\w*:?${name}\\b[^>]*/>`, 'i').exec(xml)?.[0];
}

function readFonts(tag: string | undefined): DocxRunFonts | undefined {
  if (!tag) return undefined;
  const values = attributes(tag);
  const result: DocxRunFonts = {
    ascii: values.ascii,
    hAnsi: values.hAnsi,
    eastAsia: values.eastAsia,
    cs: values.cs,
    asciiTheme: values.asciiTheme,
    hAnsiTheme: values.hAnsiTheme,
    eastAsiaTheme: values.eastAsiaTheme,
    csTheme: values.csTheme ?? values.cstheme,
  };
  return Object.values(result).some(Boolean) ? result : undefined;
}

export function parseDocxStylesFonts(stylesXml: string): DocxRunFonts | undefined {
  const defaults = firstTag(stylesXml, 'docDefaults')?.inner;
  const runDefaults = defaults && firstTag(defaults, 'rPrDefault')?.inner;
  const properties = runDefaults && firstTag(runDefaults, 'rPr')?.inner;
  return readFonts(properties && selfClosingTag(properties, 'rFonts'));
}

function parseThemeFace(xml: string | undefined): DocxThemeFontFace | undefined {
  if (!xml) return undefined;
  const font = (name: string) => attributes(selfClosingTag(xml, name) ?? '').typeface || undefined;
  const overrides = Object.fromEntries([...xml.matchAll(/<\w*:font\b[^>]*/gi)].map((match) => {
    const value = attributes(match[0]);
    return [value.script, value.typeface];
  }).filter(([script, typeface]) => script && typeface));
  return { latin: font('latin'), eastAsia: font('ea'), complexScript: font('cs'), scriptOverrides: overrides };
}

export function parseDocxThemeFonts(themeXml: string): DocxThemeFonts | undefined {
  const scheme = firstTag(themeXml, 'fontScheme');
  if (!scheme) return undefined;
  return {
    schemeName: attributes(scheme.tag).name,
    major: parseThemeFace(firstTag(scheme.inner, 'majorFont')?.inner),
    minor: parseThemeFace(firstTag(scheme.inner, 'minorFont')?.inner),
  };
}

function themeFont(reference: string | undefined, theme?: DocxThemeFonts): string | undefined {
  if (!reference) return undefined;
  const face = reference.toLowerCase().startsWith('major') ? theme?.major : reference.toLowerCase().startsWith('minor') ? theme?.minor : undefined;
  if (!face) return undefined;
  if (reference.toLowerCase().includes('eastasia')) return face.eastAsia;
  if (reference.toLowerCase().includes('bidi') || reference.toLowerCase().includes('cs')) return face.complexScript;
  return face.latin;
}

export function resolveDocxRunFonts(runFonts?: DocxRunFonts, themeFonts?: DocxThemeFonts): DocxResolvedFonts {
  return {
    ascii: runFonts?.ascii ?? themeFont(runFonts?.asciiTheme, themeFonts),
    hAnsi: runFonts?.hAnsi ?? themeFont(runFonts?.hAnsiTheme, themeFonts),
    eastAsia: runFonts?.eastAsia ?? themeFont(runFonts?.eastAsiaTheme, themeFonts),
    cs: runFonts?.cs ?? themeFont(runFonts?.csTheme, themeFonts),
  };
}

export function resolveDocxScriptFont(themeFonts: DocxThemeFonts | undefined, themeReference: string | undefined, script: string): string | undefined {
  const face = themeReference?.toLowerCase().startsWith('major') ? themeFonts?.major : themeReference?.toLowerCase().startsWith('minor') ? themeFonts?.minor : undefined;
  return face?.scriptOverrides[script];
}

export function deobfuscateDocxFont(rawBuffer: Buffer, fontKey: string): Buffer {
  const normalized = fontKey.replace(/[{}-]/g, '');
  if (!/^[0-9a-f]{32}$/i.test(normalized)) throw new Error('DOCX font key must be a GUID.');
  const key = Buffer.from(normalized, 'hex').reverse();
  const result = Buffer.from(rawBuffer);
  for (let index = 0; index < Math.min(32, result.length); index++) result[index] ^= key[index % key.length];
  return result;
}

function embeddedStyles(inner: string): Array<{ style: DocxEmbeddedFontStyle; relationshipId?: string; fontKey?: string }> {
  const names: Array<[string, DocxEmbeddedFontStyle]> = [['embedRegular', 'regular'], ['embedBold', 'bold'], ['embedItalic', 'italic'], ['embedBoldItalic', 'boldItalic']];
  return names.flatMap(([name, style]) => {
    const tag = selfClosingTag(inner, name);
    if (!tag) return [];
    const value = attributes(tag);
    return [{ style, relationshipId: value.id, fontKey: value.fontKey }];
  });
}

export async function extractDocxEmbeddedFonts(zip: JSZip): Promise<DocxEmbeddedFont[]> {
  const [fontTable, relationships] = await Promise.all([
    zip.file('word/fontTable.xml')?.async('text'),
    zip.file('word/_rels/fontTable.xml.rels')?.async('text'),
  ]);
  if (!fontTable || !relationships) return [];
  const targets = new Map([...relationships.matchAll(/<Relationship\b[^>]*/gi)].map((match) => {
    const value = attributes(match[0]);
    return [value.Id, value];
  }));
  const fonts: DocxEmbeddedFont[] = [];
  for (const match of fontTable.matchAll(/<\w*:font\b([^>]*)>([\s\S]*?)<\/\w*:font>/gi)) {
    const name = attributes(match[1]).name;
    if (!name) continue;
    for (const reference of embeddedStyles(match[2])) {
      const relationship = reference.relationshipId ? targets.get(reference.relationshipId) : undefined;
      if (!relationship?.Target || relationship.TargetMode === 'External') continue;
      const path = `word/${relationship.Target}`.replace(/\/[^/]+\/\.\.\//g, '/');
      const rawBuffer = Buffer.from(await zip.file(path)?.async('nodebuffer') ?? []);
      if (!rawBuffer.length) continue;
      const isObfuscated = Boolean(reference.fontKey);
      fonts.push({ name, style: reference.style, relationshipId: reference.relationshipId!, target: relationship.Target, path, fontKey: reference.fontKey, isObfuscated, rawBuffer, buffer: isObfuscated ? deobfuscateDocxFont(rawBuffer, reference.fontKey!) : rawBuffer });
    }
  }
  return fonts;
}

export async function extractDocxFontConfig(templateDocx: Buffer | Uint8Array): Promise<DocxFontConfig> {
  const zip = await JSZip.loadAsync(templateDocx);
  const [styles, theme, embeddedFonts] = await Promise.all([
    zip.file('word/styles.xml')?.async('text'),
    zip.file('word/theme/theme1.xml')?.async('text'),
    extractDocxEmbeddedFonts(zip),
  ]);
  const docDefaults = styles ? parseDocxStylesFonts(styles) : undefined;
  const themeFonts = theme ? parseDocxThemeFonts(theme) : undefined;
  return { docDefaults, themeFonts, resolvedDefaults: resolveDocxRunFonts(docDefaults, themeFonts), embeddedFonts };
}

export function chooseEnglishDefaultFont(config?: Pick<DocxFontConfig, 'resolvedDefaults' | 'embeddedFonts'>): string | Buffer | undefined {
  const name = config?.resolvedDefaults.hAnsi ?? config?.resolvedDefaults.ascii;
  if (!name) return undefined;
  return config?.embeddedFonts.find((font) => font.style === 'regular' && font.name.toLowerCase() === name.toLowerCase())?.buffer ?? name;
}
