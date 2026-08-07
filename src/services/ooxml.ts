import JSZip from 'jszip';

import { CliError } from '../utils/errors';
import type { TextReplacement } from '../utils/replacements';

const TEXT_NODE = /(<w:t(?:\s[^>]*)?>)([\s\S]*?)(<\/w:t>)/g;

export interface TextPart {
  path: string;
  text: string;
}

interface TextNode {
  start: number;
  end: number;
  value: string;
}

export function decodeXmlText(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

export function encodeXmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function textNodes(xml: string): TextNode[] {
  const nodes: TextNode[] = [];
  for (const match of xml.matchAll(TEXT_NODE)) {
    const innerStart = match.index! + match[1].length;
    const value = decodeXmlText(match[2]);
    nodes.push({ start: innerStart, end: innerStart + match[2].length, value });
  }
  return nodes;
}

function wordXmlPaths(zip: JSZip): string[] {
  return Object.keys(zip.files).filter((path) => path.startsWith('word/') && path.endsWith('.xml'));
}

export async function extractTextParts(document: Uint8Array): Promise<TextPart[]> {
  const zip = await JSZip.loadAsync(document);
  const parts: TextPart[] = [];
  for (const path of wordXmlPaths(zip)) {
    const file = zip.file(path);
    if (!file) continue;
    const xml = await file.async('string');
    const text = textNodes(xml).map((node) => node.value).join('');
    if (text) parts.push({ path, text });
  }
  return parts;
}

function replaceInXml(xml: string, find: string, replacement: string): { xml: string; count: number } {
  return replaceManyInXml(xml, [{ find, replacement, line: 0 }])[0] ?? { xml, count: 0 };
}

interface XmlReplacementResult {
  xml: string;
  count: number;
}

function replaceManyInXml(xml: string, replacements: readonly TextReplacement[]): XmlReplacementResult[] {
  const nodes = textNodes(xml);
  const joined = nodes.map((node) => node.value).join('');
  const results = replacements.map(() => ({ xml, count: 0 }));
  const matches: Array<{ start: number; end: number; replacementIndex: number }> = [];
  for (const [replacementIndex, replacement] of replacements.entries()) {
    let at = 0;
    while (at <= joined.length - replacement.find.length) {
      const index = joined.indexOf(replacement.find, at);
      if (index < 0) break;
      matches.push({ start: index, end: index + replacement.find.length, replacementIndex });
      at = index + replacement.find.length;
      results[replacementIndex].count++;
    }
  }
  if (!matches.length) return results;
  matches.sort((left, right) => right.start - left.start || right.end - left.end);

  const offsets: number[] = [];
  let cursor = 0;
  for (const node of nodes) {
    offsets.push(cursor);
    cursor += node.value.length;
  }

  const values = nodes.map((node) => node.value);
  for (const match of matches) {
    let first = -1;
    let last = -1;
    for (let index = 0; index < nodes.length; index++) {
      const nodeStart = offsets[index];
      const nodeEnd = nodeStart + nodes[index].value.length;
      if (nodeEnd > match.start && nodeStart < match.end) {
        if (first < 0) first = index;
        last = index;
      }
    }
    if (first < 0 || last < 0) throw new CliError('Unable to map a text replacement to DOCX text nodes.');

    const firstStart = offsets[first];
    const lastStart = offsets[last];
    const firstPrefix = values[first].slice(0, match.start - firstStart);
    const lastSuffix = values[last].slice(match.end - lastStart);
    values[first] = `${firstPrefix}${replacements[match.replacementIndex].replacement}${lastSuffix}`;
    for (let index = first + 1; index <= last; index++) values[index] = '';
  }

  let nodeIndex = 0;
  const updated = xml.replace(TEXT_NODE, (_, opening: string, _content: string, closing: string) => {
    const value = encodeXmlText(values[nodeIndex++]);
    return `${opening}${value}${closing}`;
  });
  return results.map((result) => ({ ...result, xml: updated }));
}

/**
 * Edits only w:t contents. Every other XML character, including run properties,
 * remains untouched so Word formatting and structure are retained.
 */
export async function replaceDocxText(document: Uint8Array, find: string, replacement: string): Promise<{ document: Uint8Array; count: number }> {
  if (!find) throw new CliError('The text to find must not be empty.');
  const zip = await JSZip.loadAsync(document);
  let count = 0;
  for (const path of wordXmlPaths(zip)) {
    const file = zip.file(path);
    if (!file) continue;
    const current = await file.async('string');
    const result = replaceInXml(current, find, replacement);
    if (result.count > 0) zip.file(path, result.xml);
    count += result.count;
  }
  return { document: await zip.generateAsync({ type: 'uint8array' }), count };
}

export async function replaceDocxTextBatch(document: Uint8Array, replacements: readonly TextReplacement[]): Promise<{ document: Uint8Array; counts: number[] }> {
  if (!replacements.length) throw new CliError('At least one text replacement is required.');
  const zip = await JSZip.loadAsync(document);
  const counts = replacements.map(() => 0);
  for (const path of wordXmlPaths(zip)) {
    const file = zip.file(path);
    if (!file) continue;
    const current = await file.async('string');
    const results = replaceManyInXml(current, replacements);
    for (const [index, result] of results.entries()) counts[index] += result.count;
    if (results.some((result) => result.count > 0)) zip.file(path, results[0].xml);
  }
  return { document: await zip.generateAsync({ type: 'uint8array' }), counts };
}

export async function extractDocxVisibleLines(document: Uint8Array): Promise<string[]> {
  const zip = await JSZip.loadAsync(document);
  const lines: string[] = [];
  for (const path of wordXmlPaths(zip)) {
    const file = zip.file(path);
    if (!file) continue;
    const xml = await file.async('string');
    const paragraphs = [...xml.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)];
    const sources = paragraphs.length ? paragraphs.map((paragraph) => paragraph[1]) : [xml];
    for (const source of sources) {
      const line = textNodes(source).map((node) => node.value).join('');
      if (line) lines.push(line);
    }
  }
  return lines;
}
