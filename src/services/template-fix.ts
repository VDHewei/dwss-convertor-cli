import { registeredFunctionNames } from './js-context.js';
import { extractTextParts, replaceDocxText } from './ooxml.js';
import { inspectTemplateJavaScript, validateDocxTemplate, validateTemplateText } from './template-validation.js';
import { CliError } from '../utils/errors.js';

export type Confirm = (question: string) => Promise<boolean>;

function repairOutsideStrings(source: string): string {
  let quote: "'" | '"' | '`' | undefined;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  let output = '';
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    const next = source[index + 1];
    if (lineComment) {
      output += char;
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      output += char;
      if (char === '*' && next === '/') {
        output += next;
        index++;
        blockComment = false;
      }
      continue;
    }
    if (quote) {
      output += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = undefined;
      continue;
    }
    if (char === '/' && next === '/') {
      output += '//';
      index++;
      lineComment = true;
      continue;
    }
    if (char === '/' && next === '*') {
      output += '/*';
      index++;
      blockComment = true;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      output += char;
      continue;
    }
    output += char === '，' ? ',' : char;
  }
  return output;
}

function normalizeSmartStringDelimiters(source: string): string {
  let quote: "'" | '"' | '`' | undefined;
  let lineComment = false;
  let blockComment = false;
  let output = '';
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    const next = source[index + 1];
    if (lineComment) {
      output += char;
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      output += char;
      if (char === '*' && next === '/') {
        output += next;
        index++;
        blockComment = false;
      }
      continue;
    }
    if (quote) {
      output += char;
      if (char === '\\') output += source[++index] ?? '';
      else if (char === quote) quote = undefined;
      continue;
    }
    if (char === '/' && next === '/') {
      output += '//';
      index++;
      lineComment = true;
      continue;
    }
    if (char === '/' && next === '*') {
      output += '/*';
      index++;
      blockComment = true;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      output += char;
      continue;
    }
    const smartPair = char === '‘' ? ['’', "'"] : char === '“' ? ['”', '"'] : undefined;
    if (smartPair) {
      const closingAt = source.indexOf(smartPair[0], index + 1);
      if (closingAt >= 0) {
        output += smartPair[1];
        output += source.slice(index + 1, closingAt);
        output += smartPair[1];
        index = closingAt;
        continue;
      }
    }
    output += char;
  }
  return output;
}

function hasOnlyNonStructuralIssues(code: string): boolean {
  return !validateTemplateText(`+++${code}+++`).issues.some((issue) => issue.kind === 'token' || issue.kind === 'syntax' || issue.kind === 'delimiter');
}

function deterministicRepair(code: string): string {
  let normalized = normalizeSmartStringDelimiters(repairOutsideStrings(code));
  for (;;) {
    const tokens = inspectTemplateJavaScript(normalized);
    if (tokens.unclosedQuote) return normalized;
    if (tokens.unexpected) {
      const position = tokens.expressionOffset + tokens.unexpected.position;
      const candidate = normalized.slice(0, position) + normalized.slice(position + 1);
      const after = inspectTemplateJavaScript(candidate);
      if (after.unclosedQuote || after.missing.length > 0) return normalized;
      if (after.unexpected) {
        const nextPosition = after.expressionOffset + after.unexpected.position;
        if (after.unexpected.token !== tokens.unexpected.token || nextPosition !== position) return normalized;
        normalized = candidate;
        continue;
      }
      return hasOnlyNonStructuralIssues(candidate) ? candidate : normalized;
    }
    if (tokens.missing.length !== 1) return normalized;
    const candidate = normalized + tokens.missing[0];
    return hasOnlyNonStructuralIssues(candidate) ? candidate : normalized;
  }
}

function levenshtein(left: string, right: string): number {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
    let previous = row[0];
    row[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
      const old = row[rightIndex];
      row[rightIndex] = Math.min(row[rightIndex] + 1, row[rightIndex - 1] + 1, previous + Number(left[leftIndex - 1] !== right[rightIndex - 1]));
      previous = old;
    }
  }
  return row[right.length];
}

function candidateFunctions(name: string): string[] {
  return [...registeredFunctionNames]
    .map((candidate) => ({ candidate, distance: levenshtein(name.toLowerCase(), candidate.toLowerCase()) }))
    .filter(({ distance, candidate }) => distance <= Math.max(2, Math.floor(candidate.length / 3)))
    .sort((left, right) => left.distance - right.distance || left.candidate.localeCompare(right.candidate))
    .map(({ candidate }) => candidate);
}

export interface FixResult {
  document: Uint8Array;
  deterministicChanges: number;
  confirmedFunctionChanges: number;
  changes: FixChange[];
}

export interface FixChange {
  kind: 'deterministic' | 'confirmed';
  before: string;
  after: string;
  count: number;
}

export interface FixProgress {
  start(message: string): void;
  update(message: string): void;
  stop(message: string): void;
}

/**
 * Unknown functions are deliberately never repaired automatically: a caller must
 * explicitly approve every replacement proposed from a fuzzy name match.
 */
export async function fixDocxTemplate(document: Uint8Array, confirm: Confirm, progress?: FixProgress): Promise<FixResult> {
  let current = document;
  let deterministicChanges = 0;
  const parts = await extractTextParts(current);
  const changes: FixChange[] = [];
  progress?.start(`Scanning ${parts.length} DOCX text part(s)…`);
  let progressStopped = false;
  try {
    for (const [partIndex, part] of parts.entries()) {
      progress?.update(`Processing ${part.path} (${partIndex + 1}/${parts.length})…`);
      const blocks = [...part.text.matchAll(/\+\+\+([\s\S]*?)\+\+\+/g)];
      for (const block of blocks) {
        const originalCode = block[1];
        const repairedCode = deterministicRepair(originalCode);
        if (repairedCode !== originalCode) {
          const replacement = await replaceDocxText(current, `+++${originalCode}+++`, `+++${repairedCode}+++`);
          current = replacement.document;
          deterministicChanges += replacement.count;
          if (replacement.count) {
            changes.push({
              kind: 'deterministic',
              before: `+++${originalCode}+++`,
              after: `+++${repairedCode}+++`,
              count: replacement.count,
            });
          }
        }
      }
    }

    const validation = await validateDocxTemplate(current);
    const unknown = validation.issues.filter((issue) => issue.kind === 'unknown-function' && issue.functionName);
    let confirmedFunctionChanges = 0;
    const handled = new Set<string>();
    for (const issue of unknown) {
      const name = issue.functionName!;
      const key = `${name}\u0000${issue.snippet}`;
      if (handled.has(key)) continue;
      handled.add(key);
      const candidates = candidateFunctions(name);
      if (candidates.length === 0) {
        throw new CliError(`Cannot repair unknown function "${name}": no registered function is a close match.`);
      }
      const candidate = candidates[0];
      const approved = await confirm(`Replace unknown function "${name}" with "${candidate}"? Candidates: ${candidates.join(', ')}`);
      if (!approved) throw new CliError(`Unknown function "${name}" was not changed.`);
      const expression = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s*\\()`, 'g');
      const replacement = await replaceDocxText(current, issue.snippet, issue.snippet.replace(expression, candidate));
      if (replacement.count === 0) throw new CliError(`Unable to apply the confirmed replacement for "${name}".`);
      current = replacement.document;
      confirmedFunctionChanges += replacement.count;
      changes.push({
        kind: 'confirmed',
        before: issue.snippet,
        after: issue.snippet.replace(expression, candidate),
        count: replacement.count,
      });
    }
    progress?.stop(`Processed ${parts.length} DOCX text part(s).`);
    progressStopped = true;
    return { document: current, deterministicChanges, confirmedFunctionChanges, changes };
  } finally {
    if (!progressStopped) progress?.stop('Fix stopped before completion.');
  }
}
