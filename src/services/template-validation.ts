import { registeredFunctionNames } from './js-context';
import { extractTextParts } from './ooxml';

export type IssueKind = 'delimiter' | 'token' | 'syntax' | 'unknown-function' | 'command';

export interface TemplateIssue {
  kind: IssueKind;
  message: string;
  part: string;
  offset: number;
  snippet: string;
  repair?: string;
  functionName?: string;
}

export interface TemplateValidation {
  issues: TemplateIssue[];
  commands: string[];
  valid: boolean;
}

interface Block {
  code: string;
  offset: number;
  raw: string;
}

const COMMANDS = new Set(['ALIAS', 'EXEC', 'FOR', 'END-FOR', 'HTML', 'IF', 'END-IF', 'IMAGE', 'INS', 'LINK', 'QUERY']);
const BUILTIN_CALLS = new Set(['Array', 'Boolean', 'Date', 'Number', 'Object', 'String', 'decodeURI', 'decodeURIComponent', 'encodeURI', 'encodeURIComponent', 'isFinite', 'isNaN', 'parseFloat', 'parseInt', 'RegExp']);
const RESERVED_CALLS = new Set(['catch', 'for', 'function', 'if', 'in', 'new', 'switch', 'typeof', 'while']);
const PAIRS: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
const CLOSING_TOKENS: Record<string, string> = { '(': ')', '[': ']', '{': '}' };

function blocks(text: string, part: string, issues: TemplateIssue[]): Block[] {
  const output: Block[] = [];
  let from = 0;
  while (from < text.length) {
    const start = text.indexOf('+++', from);
    if (start < 0) break;
    const end = text.indexOf('+++', start + 3);
    if (end < 0) {
      issues.push({ kind: 'delimiter', message: 'Unclosed +++ template delimiter.', part, offset: start, snippet: text.slice(start, start + 80), repair: 'Add a closing +++ delimiter.' });
      break;
    }
    const code = text.slice(start + 3, end).trim();
    if (code) output.push({ code, offset: start, raw: text.slice(start, end + 3) });
    from = end + 3;
  }
  return output;
}

export interface TokenResult {
  missing: string[];
  unexpected?: { token: string; position: number };
  unclosedQuote?: string;
}

function scanTokens(source: string): TokenResult {
  const stack: Array<{ token: string; position: number }> = [];
  let quote: "'" | '"' | '`' | undefined;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = 0; index < source.length; index++) {
    const token = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (token === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (token === '*' && next === '/') {
        blockComment = false;
        index++;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (token === '\\') escaped = true;
      else if (token === quote) quote = undefined;
      continue;
    }
    if (token === '/' && next === '/') {
      lineComment = true;
      index++;
      continue;
    }
    if (token === '/' && next === '*') {
      blockComment = true;
      index++;
      continue;
    }
    if (token === "'" || token === '"' || token === '`') {
      quote = token;
      continue;
    }
    if (token === '(' || token === '[' || token === '{') {
      stack.push({ token, position: index });
      continue;
    }
    if (token in PAIRS) {
      if (stack.at(-1)?.token !== PAIRS[token]) return { missing: [], unexpected: { token, position: index } };
      stack.pop();
    }
  }
  return { missing: stack.reverse().map(({ token }) => CLOSING_TOKENS[token]), unclosedQuote: quote };
}

function expressionFor(code: string): { expression: string; mode: 'expression' | 'statement'; offset: number } {
  const leadingWhitespace = code.length - code.trimStart().length;
  if (code.trimStart().startsWith('=')) {
    const expression = code.trimStart().slice(1).trim();
    return { expression, mode: 'statement', offset: code.indexOf(expression, leadingWhitespace + 1) };
  }
  // docx-templates accepts IMAGE directly followed by an expression. Keep the
  // keyword out of function analysis so IMAGErenderImage(...) is not a fake call.
  if (code.startsWith('IMAGE') && (/\s/.test(code[5] ?? '') || /[a-z_$]/.test(code[5] ?? ''))) {
    const expression = code.slice(5).trim();
    return { expression, mode: 'expression', offset: code.indexOf(expression, 5) };
  }
  const command = /^([A-Z-]+)\b\s*(.*)$/s.exec(code);
  if (!command) return { expression: code, mode: 'expression', offset: 0 };
  const [, name, rest] = command;
  if (!COMMANDS.has(name)) return { expression: code, mode: 'expression', offset: 0 };
  if (name === 'END-FOR' || name === 'END-IF') return { expression: '', mode: 'expression', offset: code.length };
  if (name === 'EXEC') return { expression: rest, mode: 'statement', offset: code.lastIndexOf(rest) };
  if (name === 'FOR') {
    const inMatch = /^\S+\s+IN\s+(.+)$/s.exec(rest);
    const expression = inMatch?.[1] ?? rest;
    return { expression, mode: 'expression', offset: code.lastIndexOf(expression) };
  }
  return { expression: rest, mode: 'expression', offset: code.lastIndexOf(rest) };
}

export function inspectTemplateJavaScript(code: string): TokenResult & { expressionOffset: number } {
  const { expression, offset } = expressionFor(code);
  return { ...scanTokens(expression), expressionOffset: offset };
}

function callsIn(source: string): string[] {
  const calls: string[] = [];
  let quote: "'" | '"' | '`' | undefined;
  let lineComment = false;
  let blockComment = false;
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        index++;
      }
      continue;
    }
    if (quote) {
      if (char === '\\') index++;
      else if (char === quote) quote = undefined;
      continue;
    }
    if (char === '/' && next === '/') {
      lineComment = true;
      index++;
      continue;
    }
    if (char === '/' && next === '*') {
      blockComment = true;
      index++;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }
    if (!/[A-Za-z_$]/.test(char)) continue;
    const match = /^[A-Za-z_$][\w$]*/.exec(source.slice(index));
    if (!match) continue;
    const name = match[0];
    const after = index + name.length;
    const nextNonWhitespace = source.slice(after).search(/\S/);
    const callAt = nextNonWhitespace < 0 ? -1 : after + nextNonWhitespace;
    const previous = source.slice(0, index).match(/\S(?=\s*$)/)?.[0];
    if (callAt >= 0 && source[callAt] === '(' && previous !== '.' && !RESERVED_CALLS.has(name.toLowerCase()) && !BUILTIN_CALLS.has(name)) calls.push(name);
    index += name.length - 1;
  }
  return calls;
}

export function validateTemplateText(text: string, part = 'text'): TemplateValidation {
  const issues: TemplateIssue[] = [];
  const commandNames: string[] = [];
  for (const block of blocks(text, part, issues)) {
    const declared = /^(IMAGE)(?=\s|[a-z_$])|^([A-Z-]+)\b/.exec(block.code)?.slice(1).find(Boolean);
    if (declared) {
      commandNames.push(declared);
      if (!COMMANDS.has(declared)) {
        issues.push({ kind: 'command', message: `Unknown docx-templates command "${declared}".`, part, offset: block.offset, snippet: block.raw });
      }
    }
    const { expression, mode } = expressionFor(block.code);
    if (!expression) continue;
    const tokenResult = scanTokens(expression);
    if (tokenResult.unexpected) {
      issues.push({ kind: 'token', message: `Unexpected "${tokenResult.unexpected.token}" token.`, part, offset: block.offset + 3 + tokenResult.unexpected.position, snippet: block.raw });
    } else if (tokenResult.unclosedQuote) {
      issues.push({ kind: 'token', message: `Unclosed ${tokenResult.unclosedQuote} string delimiter.`, part, offset: block.offset, snippet: block.raw });
    } else if (tokenResult.missing.length) {
      issues.push({ kind: 'token', message: `Missing closing token(s): ${tokenResult.missing.join(' ')}.`, part, offset: block.offset, snippet: block.raw, repair: tokenResult.missing.join('') });
    } else {
      try {
        if (mode === 'statement') new Function(expression);
        else new Function(`return (${expression});`);
      } catch (error) {
        const detail = error instanceof SyntaxError ? error.message : 'Invalid JavaScript.';
        issues.push({ kind: 'syntax', message: `JavaScript syntax error: ${detail}`, part, offset: block.offset, snippet: block.raw });
      }
    }
    for (const name of callsIn(expression)) {
      if (!registeredFunctionNames.has(name)) {
        issues.push({ kind: 'unknown-function', message: `Function "${name}" is not registered in the CLI additionalJsContext.`, part, offset: block.offset, snippet: block.raw, functionName: name });
      }
    }
  }
  return { issues, commands: commandNames, valid: issues.length === 0 };
}

export async function validateDocxTemplate(document: Uint8Array): Promise<TemplateValidation> {
  const results = await extractTextParts(document);
  const all = results.map(({ text, path }) => validateTemplateText(text, path));
  return {
    issues: all.flatMap((result) => result.issues),
    commands: all.flatMap((result) => result.commands),
    valid: all.every((result) => result.valid),
  };
}
