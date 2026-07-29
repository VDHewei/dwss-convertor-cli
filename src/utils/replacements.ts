import { CliError } from './errors.js';

export interface TextReplacement {
  find: string;
  replacement: string;
  line: number;
}

function parseQuotedValue(line: string, index: number, lineNumber: number): { value: string; next: number } {
  if (line[index] !== '"') throw new CliError(`Replacement file line ${lineNumber} must start with a double-quoted source text.`);
  let value = '';
  for (let cursor = index + 1; cursor < line.length; cursor++) {
    const character = line[cursor];
    if (character === '"') return { value, next: cursor + 1 };
    if (character !== '\\') {
      value += character;
      continue;
    }
    const escaped = line[++cursor];
    const values: Record<string, string> = { '"': '"', '\\': '\\', n: '\n', r: '\r', t: '\t' };
    if (escaped === undefined || !(escaped in values)) {
      throw new CliError(`Replacement file line ${lineNumber} contains an unsupported escape sequence.`);
    }
    value += values[escaped];
  }
  throw new CliError(`Replacement file line ${lineNumber} has an unterminated quoted value.`);
}

export function parseReplacementFile(text: string): TextReplacement[] {
  const mappings: TextReplacement[] = [];
  for (const [index, sourceLine] of text.split(/\r?\n/).entries()) {
    const lineNumber = index + 1;
    const line = sourceLine.trim();
    if (!line) continue;
    const source = parseQuotedValue(line, 0, lineNumber);
    let cursor = source.next;
    while (/\s/.test(line[cursor] ?? '')) cursor++;
    if (line[cursor] !== ':') throw new CliError(`Replacement file line ${lineNumber} must separate values with a colon.`);
    cursor++;
    while (/\s/.test(line[cursor] ?? '')) cursor++;
    const replacement = parseQuotedValue(line, cursor, lineNumber);
    if (line.slice(replacement.next).trim()) throw new CliError(`Replacement file line ${lineNumber} has unexpected trailing text.`);
    if (!source.value) throw new CliError(`Replacement file line ${lineNumber} has an empty source text.`);
    mappings.push({ find: source.value, replacement: replacement.value, line: lineNumber });
  }
  if (!mappings.length) throw new CliError('Replacement file contains no mappings.');

  for (let left = 0; left < mappings.length; left++) {
    for (let right = left + 1; right < mappings.length; right++) {
      if (mappings[left].find === mappings[right].find) {
        throw new CliError(`Replacement file has duplicate source text on lines ${mappings[left].line} and ${mappings[right].line}.`);
      }
      if (mappings[left].find.includes(mappings[right].find) || mappings[right].find.includes(mappings[left].find)) {
        throw new CliError(`Replacement file has ambiguous overlapping source texts on lines ${mappings[left].line} and ${mappings[right].line}.`);
      }
    }
  }
  return mappings;
}
