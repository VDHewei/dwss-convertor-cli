import { CliError } from '../utils/errors.js';
import { fetchImageFile } from './file-service.js';

type DataRecord = Record<string, unknown>;

function isRecord(value: unknown): value is DataRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pathSegments(path: string): string[] {
  return path.match(/[^.[\]]+/g) ?? [];
}

function valueAt(value: unknown, path: string, fallback: unknown = ''): unknown {
  let current: unknown = value;
  for (const segment of pathSegments(path)) {
    if (Array.isArray(current) && /^\d+$/.test(segment)) current = current[Number(segment)];
    else if (isRecord(current) && segment in current) current = current[segment];
    else return fallback;
  }
  return current === undefined ? fallback : current;
}

function stringValue(value: unknown): string {
  return value == null ? '' : String(value);
}

function normalised(value: unknown): string {
  return stringValue(value).trim().toLowerCase();
}

function flattenCells(template: unknown): DataRecord[] {
  const sections = valueAt(template, 'sections', []);
  if (!Array.isArray(sections)) return [];
  return sections.flatMap((section) => {
    const questions = valueAt(section, 'questions', []);
    return Array.isArray(questions)
      ? questions.flatMap((question) => {
        const cells = valueAt(question, 'cells', []);
        return Array.isArray(cells) ? cells.map((cell) => ({ ...isRecord(cell) ? cell : {}, questionId: valueAt(cell, 'questionId', valueAt(question, 'id', undefined)), question }))
          : [];
      })
      : [];
  });
}

function findCell(template: unknown, cellCode: unknown): DataRecord | undefined {
  const expected = normalised(cellCode);
  if (!expected) return undefined;
  return flattenCells(template).find((cell) =>
    normalised(cell.cellCode) === expected || normalised(cell.exportCellCode) === expected,
  );
}

function answerForCell(template: unknown, answers: unknown, cellCode: unknown, questionCode?: unknown, sectionOrdering?: unknown): { cell?: DataRecord; answer?: DataRecord } {
  const expectedQuestion = normalised(questionCode);
  const expectedOrdering = sectionOrdering == null ? '' : normalised(sectionOrdering);
  const cell = flattenCells(template).find((candidate) => {
    if (normalised(candidate.cellCode) !== normalised(cellCode) && normalised(candidate.exportCellCode) !== normalised(cellCode)) return false;
    const question = candidate.question;
    if (expectedQuestion && normalised(valueAt(question, 'questionCode', valueAt(question, 'exportQuestionCode', ''))) !== expectedQuestion &&
      normalised(valueAt(question, 'exportQuestionCode', '')) !== expectedQuestion) return false;
    return !expectedOrdering || normalised(valueAt(question, 'sectionOrdering', '')) === expectedOrdering;
  }) ?? findCell(template, cellCode);
  const answer = Array.isArray(answers)
    ? answers.find((item) => isRecord(item) && normalised(item.questionId) === normalised(cell?.questionId))
    : undefined;
  return { cell, answer: isRecord(answer) ? answer : undefined };
}

function rowValue(cell: DataRecord, rowCell: DataRecord, optionKey = 'name'): unknown {
  const attachments = rowCell.attachments;
  if (Array.isArray(attachments) && attachments.length > 0) return attachments;
  const answerId = rowCell.answerId;
  const options = valueAt(cell, 'answerGroup.generalOptions', []);
  if (answerId != null && Array.isArray(options)) {
    const selected = options.find((option) => isRecord(option) && normalised(option.id) === normalised(answerId));
    if (isRecord(selected)) return valueAt(selected, optionKey, valueAt(selected, 'name', ''));
  }
  if ('answerVal' in rowCell) {
    const value = rowCell.answerVal;
    return typeof value === 'boolean' ? (value ? 'Y' : 'N') : value ?? '';
  }
  return '';
}

async function imagePayload(source: unknown, options: { scale?: number | { width?: number; height?: number; ratio?: number } } = {}): Promise<{ data: string; extension: string; width: number; height: number }> {
  let raw = typeof source === 'string'
    ? source
    : stringValue(valueAt(source, 'base64', valueAt(source, 'data', '')));
  const remoteUrl = !raw && typeof valueAt(source, 'fileUrl', '') === 'string'
    ? stringValue(valueAt(source, 'fileUrl', ''))
    : /^https?:\/\//i.test(raw) ? raw : '';
  const downloaded = remoteUrl ? await fetchImageFile(remoteUrl) : undefined;
  if (downloaded) raw = downloaded.data;
  const match = /^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/s.exec(raw);
  // A missing optional signature/image is rendered transparently, while a
  // non-inline attachment remains an explicit error instead of a silent fetch.
  const data = (match?.[2] ?? raw) || 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/2wAAAABJRU5ErkJggg==';
  const extension = downloaded?.extension ?? `.${match?.[1] === 'jpg' ? 'jpeg' : match?.[1] ?? 'png'}`;
  const scale = options.scale;
  const widthPx = typeof scale === 'number' ? scale : scale?.width ?? 100;
  const heightPx = typeof scale === 'number' ? scale : scale?.height ?? widthPx;
  return { data, extension, width: widthPx / 37.795275591, height: heightPx / 37.795275591 };
}

function renderFormAction(
  histories: unknown,
  users: unknown,
  formStatuses: unknown,
  statusCodes: unknown,
): DataRecord {
  const codes = Array.isArray(statusCodes) ? statusCodes.map(normalised) : [];
  const identifiers = Array.isArray(formStatuses)
    ? formStatuses
      .filter(isRecord)
      .filter((status) => codes.includes(normalised(status.statusCode)) || codes.includes(normalised(status.exportStatusCode)))
      .map((status) => normalised(status.identifier))
    : [];
  const history = Array.isArray(histories)
    ? [...histories].reverse().find((item) => isRecord(item) && identifiers.includes(normalised(item.formStatusIdentifier)))
    : undefined;
  if (!isRecord(history)) return {
    actionByName: '', actionByDesignation: '', actionByLabel: '', actionByPhone: '',
    actionDateTime: '', actionDate: '', actionTime: '', actionSignatureBase64: '',
  };
  const user = Array.isArray(users)
    ? users.find((item) => isRecord(item) && normalised(item.value) === normalised(history.actionBy))
    : undefined;
  const actionAt = stringValue(history.actionAt);
  return {
    actionByName: stringValue(valueAt(user, 'userName', '')),
    actionByDesignation: stringValue(valueAt(user, 'position', '')),
    actionByLabel: stringValue(valueAt(user, 'label', '')),
    actionByPhone: [valueAt(user, 'phone.dialingCode', ''), valueAt(user, 'phone.phoneNo', '')].filter(Boolean).join(' '),
    actionDateTime: actionAt,
    actionDate: actionAt.slice(0, 10),
    actionTime: actionAt.includes('T') ? actionAt.slice(11, 19) : '',
    actionSignatureBase64: stringValue(history.actionSignatureBase64),
  };
}

const toArray = <T>(value: T | T[] | null | undefined): T[] => (value == null || value === '' ? [] : Array.isArray(value) ? value : [value]);

/**
 * Pure, data-driven compatibility functions for docx-templates. They operate on
 * caller-provided template/form JSON only; service-specific business mappings are
 * intentionally not included in this standalone CLI.
 */
export const additionalJsContext = {
  chunk<T>(items: T[], size: number): T[][] {
    return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
  },
  ensureArray: toArray,
  firstChar(value: string | null | undefined): string {
    return value?.charAt(0) ?? '';
  },
  get(value: unknown, path: string, fallback: unknown = ''): unknown {
    return valueAt(value, path, fallback);
  },
  intersection<T>(left: T[], right: T[]): T[] {
    const rightSet = new Set(right);
    return left.filter((item) => rightSet.has(item));
  },
  isArray: Array.isArray,
  newLInes(value: string | null | undefined): string {
    return value?.replace(/\r?\n/g, '\n') ?? '';
  },
  numberToLetter(value: number): string {
    if (!Number.isInteger(value) || value < 1) return '';
    let remaining = value;
    let output = '';
    while (remaining > 0) {
      remaining -= 1;
      output = String.fromCharCode(65 + (remaining % 26)) + output;
      remaining = Math.floor(remaining / 26);
    }
    return output;
  },
  renderAnswerCellValue(template: unknown, answers: unknown, cellCode: string, joiner = '', index = 0, questionCode?: string, sectionOrdering?: number, optionKey = 'name'): unknown {
    const { cell, answer } = answerForCell(template, answers, cellCode, questionCode, sectionOrdering);
    const rows = valueAt(answer, 'rows', []);
    const row = Array.isArray(rows) ? rows[index] : undefined;
    const cells = valueAt(row, 'cells', []);
    const values = Array.isArray(cells) && cell
      ? cells.filter((rowCell) => isRecord(rowCell) && normalised(rowCell.cellId) === normalised(cell.id)).map((rowCell) => rowValue(cell, rowCell as DataRecord, optionKey))
      : [];
    if (values.length === 0) return /_(upload|photo|image|attachment|file|video)/i.test(cellCode) ? [] : '';
    return typeof values[0] === 'string' ? values.map(stringValue).join(joiner) : values.flat();
  },
  renderAnswerRows(template: unknown, answers: unknown, cellCode: string, questionCode?: string, sectionOrdering?: number): unknown[] {
    const { answer } = answerForCell(template, answers, cellCode, questionCode, sectionOrdering);
    const rows = valueAt(answer, 'rows', []);
    return Array.isArray(rows) ? rows.filter((row) => !isRecord(row) || row.status !== false) : [];
  },
  async renderAttachmentImage(source: unknown, options: { scale?: number | { width?: number; height?: number; ratio?: number } } = {}) {
    return imagePayload(source, options);
  },
  renderFormAction,
  renderFormNo(formNo: unknown, withoutVersion = false): string {
    const value = stringValue(formNo);
    return value ? (withoutVersion ? value.split('/').slice(0, 3).join('/') : value) : '/';
  },
  async renderImage(source: unknown, options: { scale?: number | { width?: number; height?: number; ratio?: number } } = {}) {
    return imagePayload(source, options);
  },
  renderObjectField(field: unknown, key: string, fallback = ''): unknown {
    return valueAt(field, key, fallback);
  },
  renderQuestion(template: unknown, answers: unknown, _formStatusIdentifier: unknown, cellCode: string, questionCode?: string, sectionOrdering?: number): DataRecord {
    const { cell, answer } = answerForCell(template, answers, cellCode, questionCode, sectionOrdering);
    const question = cell?.question;
    return {
      code: stringValue(valueAt(answer, 'customQuestionCode', valueAt(question, 'questionCode', ''))),
      description: stringValue(valueAt(answer, 'customQuestionDesc', valueAt(cell, 'cellDesc', ''))),
      name: stringValue(valueAt(question, 'questionDesc', valueAt(question, 'questionName', ''))),
    };
  },
  renderDatetime(value: string | number | Date | null | undefined): string {
    if (value == null || value === '') return '';
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? '' : date.toISOString().slice(0, 10);
  },
  renderFormatTime(value: string | number | Date | null | undefined, _format: string): string {
    return additionalJsContext.renderDatetime(value);
  },
  renderTime(value: string | number | Date | null | undefined, _type: string): string {
    return additionalJsContext.renderDatetime(value);
  },
  uniq<T>(items: T[]): T[] {
    return [...new Set(items)];
  },
};

/**
 * Minimal builder compatibility for templates that only summarize directly
 * supplied answer values. It deliberately has no status/category mapping.
 */
export function createRenderBuilder(template: unknown, answers: unknown) {
  const values = flattenCells(template).flatMap((cell) => {
    const result = additionalJsContext.renderAnswerCellValue(template, answers, stringValue(cell.cellCode));
    return Array.isArray(result) ? result : [result];
  });
  return {
    getCheckListSectionsWithCache: () => values,
    summarySectionItems: (items: unknown, expected: unknown): number =>
      (Array.isArray(items) ? items.flat(Infinity) : []).filter((item) => normalised(item) === normalised(expected)).length,
  };
}

export const registeredFunctionNames = new Set(Object.keys(additionalJsContext));
