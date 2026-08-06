type DataRecord = Record<string, unknown>;
type Identifier = string | number;

export interface TargetColumnOption {
  key: string;
  label: string;
  answerTypes: readonly string[];
  type?: 'string' | 'list';
  legacyItemKey?: string;
}

export interface AnalyzeOptions {
  targetColumns: readonly TargetColumnOption[];
  matchThreshold: number;
  filterEmptyDesc?: boolean;
  cacheKey?: string;
  setFilterEmptyDesc(value: boolean): AnalyzeOptions;
}

export const MATCH_THRESHOLD = 0.3;
export const defaultColumns: TargetColumnOption[] = [
  { key: 'due_date', label: 'Agreed Due Date for Completion', answerTypes: ['datetime'], type: 'list', legacyItemKey: 'dueDate' },
  { key: 'completion_date', label: 'Date Completed', answerTypes: ['datetime'], type: 'list', legacyItemKey: 'completionDate' },
  { key: 'rectification_status', label: 'Rectification Status', answerTypes: ['text'], type: 'list', legacyItemKey: 'rectificationStatus' },
];

function isRecord(value: unknown): value is DataRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function records(value: unknown): DataRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function id(value: unknown): string {
  return value == null ? '' : String(value);
}

function text(value: unknown): string {
  return value == null ? '' : String(value);
}

function listValue(values: string[]): string[] {
  Object.defineProperty(values, 'toString', { value: () => values.join('\n') });
  return values;
}

function attachmentList(values: DataRecord[]): DataRecord[] {
  for (const value of values) {
    Object.defineProperty(value, 'toString', {
      value: () => `${text(value.fileName)}:${text(value.fileUrl)}`,
      configurable: true,
    });
  }
  Object.defineProperty(values, 'toString', {
    value: () => values.map(String).filter((value) => value !== ':').join('\n'),
  });
  return values;
}

function tokens(value: unknown): Set<string> {
  return new Set(text(value).toLowerCase().split(/[-_\s]+/).filter(Boolean));
}

function similarity(left: Set<string>, right: Set<string>): number {
  let shared = 0;
  for (const value of left) if (right.has(value)) shared++;
  const total = left.size + right.size - shared;
  return total ? shared / total : 0;
}

function createAnalyzeOptions(input: Partial<AnalyzeOptions> = {}): AnalyzeOptions {
  const options: AnalyzeOptions = {
    targetColumns: input.targetColumns ?? defaultColumns,
    matchThreshold: input.matchThreshold ?? MATCH_THRESHOLD,
    filterEmptyDesc: input.filterEmptyDesc ?? false,
    cacheKey: input.cacheKey,
    setFilterEmptyDesc(value) {
      options.filterEmptyDesc = value;
      return options;
    },
  };
  return options;
}

export const DEFAULT_ANALYZE_OPTIONS = createAnalyzeOptions();
export const normalizeAnalyzeOptions = (options?: Partial<AnalyzeOptions> | null): AnalyzeOptions => createAnalyzeOptions(options ?? {});
export const createOptions = (targetColumns: TargetColumnOption[], matchThreshold = MATCH_THRESHOLD, cacheKey?: string): AnalyzeOptions =>
  createAnalyzeOptions({ targetColumns, matchThreshold, cacheKey });
export const appendOptions = (items: TargetColumnOption[], matchThreshold = MATCH_THRESHOLD, cacheKey?: string): AnalyzeOptions =>
  createAnalyzeOptions({ targetColumns: [...defaultColumns, ...items], matchThreshold, cacheKey });

interface AnswerEntry {
  value: string;
  answerId: unknown;
  attachments: DataRecord[];
  customQuestionDesc: string;
}

function answerIndex(answers: DataRecord[]): Map<string, AnswerEntry[]> {
  const index = new Map<string, AnswerEntry[]>();
  for (const answer of answers) {
    for (const row of records(answer.rows)) {
      for (const cell of records(row.cells)) {
        const cellId = id(cell.cellId);
        if (!cellId) continue;
        const entry = {
          value: text(cell.answerVal),
          answerId: cell.answerId,
          attachments: attachmentList(records(cell.attachments).map((attachment) => ({ ...attachment }))),
          customQuestionDesc: text(answer.customQuestionDesc),
        };
        const existing = index.get(cellId) ?? [];
        if (!index.has(cellId) || entry.value || entry.answerId != null || entry.attachments.length) existing.push(entry);
        index.set(cellId, existing);
      }
    }
  }
  return index;
}

function optionMaps(template: DataRecord): Map<string, Map<string, string>> {
  const result = new Map<string, Map<string, string>>();
  for (const section of records(template.sections)) {
    for (const question of records(section.questions)) {
      for (const cell of records(question.cells)) {
        const options = records(isRecord(cell.answerGroup) ? cell.answerGroup.generalOptions : undefined);
        if (options.length) result.set(id(cell.id), new Map(options.map((option) => [id(option.id), text(option.name)])));
      }
    }
  }
  return result;
}

function resolvedValues(cellId: string, answers: Map<string, AnswerEntry[]>, options: Map<string, Map<string, string>>): string[] {
  return (answers.get(cellId) ?? []).map((entry) => entry.value || options.get(cellId)?.get(id(entry.answerId)) || '').filter(Boolean);
}

function reachableCells(toggleCell: DataRecord, questions: Map<string, DataRecord>, triggered: Map<string, Set<string>>): DataRecord[] {
  const visited = new Set<string>();
  const pending = [toggleCell];
  const cells: DataRecord[] = [];
  while (pending.length) {
    const current = pending.pop()!;
    const next = new Set(triggered.get(id(current.id)) ?? []);
    for (const flow of records(current.flows)) if (id(flow.nextQuestionId)) next.add(id(flow.nextQuestionId));
    for (const questionId of next) {
      if (visited.has(questionId)) continue;
      visited.add(questionId);
      const question = questions.get(questionId);
      if (!question) continue;
      const questionCells = records(question.cells);
      cells.push(...questionCells);
      pending.push(...questionCells);
    }
  }
  return cells;
}

function targetCells(cells: DataRecord[], options: AnalyzeOptions): Map<string, DataRecord[]> {
  const candidates: Array<{ score: number; key: string; cell: DataRecord; column: TargetColumnOption }> = [];
  for (const column of options.targetColumns) {
    const label = tokens(column.label);
    for (const cell of cells) {
      if (!column.answerTypes.includes(text(cell.answerType))) continue;
      const score = Math.max(similarity(tokens(cell.cellDesc), label), similarity(tokens(cell.cellCode), label));
      if (score >= options.matchThreshold) candidates.push({ score, key: column.key, cell, column });
    }
  }
  candidates.sort((left, right) => right.score - left.score);
  const usedCells = new Set<string>();
  const result = new Map<string, DataRecord[]>();
  for (const candidate of candidates) {
    if (usedCells.has(id(candidate.cell.id)) || (candidate.column.type !== 'list' && result.has(candidate.key))) continue;
    const found = result.get(candidate.key) ?? [];
    found.push(candidate.cell);
    result.set(candidate.key, found);
    usedCells.add(id(candidate.cell.id));
  }
  return result;
}

export function analyze(data: DataRecord, input: AnalyzeOptions = DEFAULT_ANALYZE_OPTIONS): DataRecord[] {
  const options = normalizeAnalyzeOptions(input);
  const template = isRecord(data.template) ? data.template : {};
  const answers = answerIndex(records(data.answers));
  const mappings = optionMaps(template);
  const questions = new Map<string, DataRecord>();
  const triggered = new Map<string, Set<string>>();
  const sections = records(template.sections);
  for (const section of sections) {
    for (const question of records(section.questions)) {
      questions.set(id(question.id), question);
      for (const item of records(question.triggeredByCells)) {
        const cellId = id(item.cellId);
        if (!cellId) continue;
        const targets = triggered.get(cellId) ?? new Set<string>();
        targets.add(id(question.id));
        triggered.set(cellId, targets);
      }
    }
  }

  return sections.flatMap((section) => {
    const items = records(section.questions).flatMap((question) => {
      const toggle = records(question.cells).find((cell) => text(cell.answerType) === 'togglebutton');
      if (!toggle) return [];
      const item: DataRecord = {
        questionDesc: text(question.questionDesc),
        questionName: text(question.questionName),
        toggleCellDesc: text(toggle.cellDesc),
        toggleName: resolvedValues(id(toggle.id), answers, mappings)[0] ?? '',
        dueDate: listValue([]),
        completionDate: listValue([]),
        rectificationStatus: listValue([]),
      };
      for (const column of options.targetColumns) {
        const cells = targetCells(reachableCells(toggle, questions, triggered), options).get(column.key) ?? [];
        const values = cells.flatMap<string | DataRecord>((cell) => text(cell.answerType) === 'file'
          ? (answers.get(id(cell.id)) ?? []).flatMap((entry) => entry.attachments)
          : resolvedValues(id(cell.id), answers, mappings));
        let result: unknown;
        if (column.type !== 'list') {
          result = String(values[0] ?? '');
        } else if (column.answerTypes.includes('file')) {
          result = attachmentList(values.filter(isRecord));
        } else {
          result = listValue(values.filter((value): value is string => typeof value === 'string'));
        }
        item[column.key] = result;
        if (column.legacyItemKey) item[column.legacyItemKey] = result;
      }
      return options.filterEmptyDesc && !item.questionDesc ? [] : [item];
    });
    if (!items.length) return [];
    return [{
      sectionId: section.id,
      sectionName: text(section.name),
      sectionNo: text(records(section.questions)[0]?.questionDesc).slice(0, 1),
      items,
      summaryItems(value: unknown, key = 'toggleName') {
        return items.filter((item) => String(item[key]) === String(value)).length;
      },
    }];
  });
}

export class FormDataBuilderImpl {
  private readonly cache = new Map<string, DataRecord[]>();

  constructor(private readonly data: DataRecord) {}

  getCheckListSections(options?: AnalyzeOptions): DataRecord[] {
    return analyze(this.data, options);
  }

  getCheckListSectionsWithCache(options: AnalyzeOptions = DEFAULT_ANALYZE_OPTIONS): DataRecord[] {
    const cacheKey = options.cacheKey ?? JSON.stringify(options.targetColumns);
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;
    const sections = this.getCheckListSections(options);
    this.cache.set(cacheKey, sections);
    return sections;
  }

  summarySectionItems(sections: DataRecord[], value: unknown, key = 'toggleName'): number {
    return sections.reduce((total, section) => total + (typeof section.summaryItems === 'function'
      ? (section.summaryItems as (value: unknown, key: string) => number)(value, key) : 0), 0);
  }

  summarySectionItemsWithOptions(value: unknown, key = 'toggleName', options?: AnalyzeOptions): number {
    return this.summarySectionItems(this.getCheckListSectionsWithCache(options), value, key);
  }

  getCellValueMap(): Map<string, DataRecord> {
    const values = new Map<string, DataRecord>();
    for (const answer of records(this.data.answers)) for (const row of records(answer.rows)) for (const cell of records(row.cells)) values.set(id(cell.cellId), cell);
    return values;
  }

  getCellInfoMap(): Map<string, DataRecord> {
    const values = new Map<string, DataRecord>();
    const template = isRecord(this.data.template) ? this.data.template : {};
    for (const section of records(template.sections)) for (const question of records(section.questions)) for (const cell of records(question.cells)) values.set(id(cell.id), cell);
    return values;
  }

  getQuestionMetadata(answerTypes: readonly string[] = []): DataRecord[] {
    const template = isRecord(this.data.template) ? this.data.template : {};
    return records(template.sections).flatMap((section, sectionIndex) => records(section.questions)
      .filter((question) => !answerTypes.length || records(question.cells).some((cell) => answerTypes.includes(text(cell.answerType))))
      .map((question, questionIndex) => ({
        sectionIndex,
        sectionNo: text(question.questionCode),
        sectionOrdering: section.ordering,
        questionId: question.id,
        questionIndex,
        questionCode: question.questionCode,
        questionText: text(question.questionDesc || question.questionName),
        answerTypes: [...new Set(records(question.cells).map((cell) => text(cell.answerType)))],
      })));
  }

  getPhotoRecords(): DataRecord[] {
    return [...this.getCellValueMap().entries()].flatMap(([cellId, answer]) => records(answer.attachments)
      .filter((attachment) => attachment.status !== false && /^(png|jpe?g)$/i.test(text(attachment.ext).replace(/^\./, '')))
      .map((attachment, attachmentIndex) => ({ cellId, answerCell: answer, attachment, attachmentIndex })));
  }
}

export interface FormDataBuilder {
  getCheckListSections(options?: AnalyzeOptions): DataRecord[];
  getCheckListSectionsWithCache(options?: AnalyzeOptions): DataRecord[];
  summarySectionItems(sections: DataRecord[], value: unknown, key?: string): number;
  summarySectionItemsWithOptions(value: unknown, key?: string, options?: AnalyzeOptions): number;
  getCellValueMap(): Map<string, DataRecord>;
  getCellInfoMap(): Map<string, DataRecord>;
  getQuestionMetadata(answerTypes?: readonly string[]): DataRecord[];
  getPhotoRecords(): DataRecord[];
}

export function loaderBuilder<T extends DataRecord>(form: T): T & { builder: FormDataBuilder; helper: FormDataBuilder; filter: FormDataBuilder } {
  const builder = new FormDataBuilderImpl(form);
  return new Proxy(form, {
    get(target, key, receiver) {
      if (key === 'builder' || key === 'helper' || key === 'filter') return builder;
      return Reflect.get(target, key, receiver);
    },
  }) as T & { builder: FormDataBuilder; helper: FormDataBuilder; filter: FormDataBuilder };
}

export interface TextParseResult {
  text: string;
  breaker?: number;
}

export function textParse(value: string | null | undefined, breaker = '<w:br>'): TextParseResult {
  if (!value) return { text: '' };
  const first = value.indexOf(breaker);
  if (first < 0) return { text: value };
  return { text: value.slice(0, first), breaker: value.slice(first + breaker.length).split(breaker).length };
}

export function chooseBreak(value?: number, fallback?: number): number | undefined {
  return value == null || value <= 0 ? fallback : value;
}
