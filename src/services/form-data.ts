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

export interface FollowupSection {
  readonly sectionNo: string;
  readonly questions: FollowupQuestion[];
}

export interface FollowupQuestion {
  readonly sectionNo: string;
  readonly description: string;
  readonly value: string;
  readonly rows: FollowupRow[];
}

export interface FollowupRow {
  readonly actionBy: string;
  readonly completionForAgreedDueDate: string;
  readonly completionDate: string;
  readonly rectificationStatus: string;
  readonly location: string;
  readonly finding: string;
  readonly action: string;
  readonly observationPhotos: DataRecord[];
  readonly followupPhotos: DataRecord[];
}

export interface RemarkSection {
  readonly sectionNo: string;
  readonly questions: RemarkQuestion[];
}

export interface RemarkQuestion {
  readonly sectionNo: string;
  readonly description: string;
  readonly value: string;
  readonly rows: RemarkRow[];
}

export interface RemarkRow {
  readonly location: string;
  readonly description: string;
  readonly photos: DataRecord[];
}

type PhotoRecordRole = 'observation' | 'followup' | 'remarks' | 'other';

interface PhotoRecordRow {
  readonly sectionIndex: number;
  readonly questionId: string;
  readonly questionIndex: number;
  readonly questionNo: string;
  readonly questionText: string;
  readonly role: PhotoRecordRole;
  readonly answerRowIndex: number;
  readonly location: string;
  readonly finding: string;
  readonly description: string;
  readonly dueDate: string;
  readonly completionDate: string;
  readonly action: string;
  readonly actionBy: string;
  readonly rectificationStatus: string;
  readonly attachments: DataRecord[];
}

interface CheckListRecord {
  readonly sectionIndex: number;
  readonly questionIndex: number;
  readonly questionId: string;
  readonly reachableQuestionIds: ReadonlySet<string>;
  readonly groupSectionNo: string;
  readonly sectionNo: string;
  readonly description: string;
  readonly value: string;
  readonly dueDates: string[];
  readonly completionDates: string[];
  readonly rectificationStatuses: string[];
}

interface PhotoRecordData {
  readonly checkLists: CheckListRecord[];
  readonly rows: PhotoRecordRow[];
}

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg']);
const questionNumberPattern = /^\s*([A-Za-z]+\d+(?:[.\-]\d+)*|\d+(?:[.\-]\d+)*)\s*(?:[.)\-:])?\s*/;

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

function splitQuestionDescription(description: string): { sectionNo: string; questionText: string } {
  const match = description.match(questionNumberPattern);
  if (!match) return { sectionNo: '', questionText: description.trim() };
  return { sectionNo: match[1], questionText: description.slice(match[0].length).trim() };
}

function displayQuestionCode(customQuestionCode: unknown, derivedQuestionCode: string): string {
  const code = text(customQuestionCode).trim();
  return code && !code.includes('__') ? code : derivedQuestionCode;
}

function questionRoleForDescription(description: string): PhotoRecordRole {
  const normalized = description.toLowerCase();
  if (/(^|\s)observation\s*$/.test(normalized)) return 'observation';
  if (/(^|\s)follow[\s-]?up\s*$/.test(normalized)) return 'followup';
  if (/(^|\s)remarks?\s*$/.test(normalized)) return 'remarks';
  return 'other';
}

function groupSectionNoForQuestion(questionNo: string, fallback: number): string {
  return questionNo.match(/^[A-Za-z]+/)?.[0] ?? String(fallback + 1);
}

function answerType(cell: DataRecord): string {
  return text(cell.answerType).toLowerCase();
}

function isPhotoAttachment(attachment: DataRecord): boolean {
  if (attachment.status === false) return false;
  return IMAGE_EXTENSIONS.has(text(attachment.ext).replace(/^\./, '').toLowerCase());
}

function fieldForCell(cell: DataRecord): keyof Pick<
PhotoRecordRow,
  'location' | 'finding' | 'description' | 'dueDate' | 'completionDate' | 'action' | 'actionBy' | 'rectificationStatus'
> | undefined {
  const description = text(cell.cellDesc).toLowerCase();
  if (/area\s*\/?\s*location/.test(description)) return 'location';
  if (/agreed.*due.*date/.test(description)) return 'dueDate';
  if (/date.*complet/.test(description)) return 'completionDate';
  if (/action\s*by/.test(description)) return 'actionBy';
  if (/follow.*action|preposed.*rectification/.test(description)) return 'action';
  if (/rectification\s*status/.test(description)) return 'rectificationStatus';
  if (/finding/.test(description)) return 'finding';
  if (/description/.test(description)) return 'description';
  return undefined;
}

function cellOptionName(cell: DataRecord, answerId: unknown): string {
  const options = records(isRecord(cell.answerGroup) ? cell.answerGroup.generalOptions : undefined);
  return text(options.find((option) => id(option.id) === id(answerId))?.name);
}

function answerCellValue(cell: DataRecord, answerCell: DataRecord): string {
  if (answerType(cell) === 'datetime') return text(answerCell.answerVal);
  if (answerCell.answerVal != null && answerCell.answerVal !== '') return text(answerCell.answerVal);
  if (answerCell.answerId != null) return cellOptionName(cell, answerCell.answerId);
  return '';
}

function stringValues(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  if (typeof value === 'string') return [value];
  return [];
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
  private photoRecordData?: PhotoRecordData;

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
    const requestedAnswerTypes = new Set(answerTypes.map((value) => value.toLowerCase()));
    const answersByQuestionId = new Map<string, DataRecord>();
    for (const answer of records(this.data.answers)) {
      const questionId = id(answer.questionId);
      if (questionId) answersByQuestionId.set(questionId, answer);
    }
    const template = isRecord(this.data.template) ? this.data.template : {};
    return records(template.sections).flatMap((section, sectionIndex) => records(section.questions)
      .flatMap((question, questionIndex) => {
        const questionAnswerTypes = [...new Set(records(question.cells).map((cell) => answerType(cell)))];
        if (requestedAnswerTypes.size > 0 && !questionAnswerTypes.some((cellType) => requestedAnswerTypes.has(cellType))) return [];
        const answer = answersByQuestionId.get(id(question.id));
        const description = text(answer?.customQuestionDesc || question.questionDesc || question.questionName).trim();
        const derived = splitQuestionDescription(description);
        return [{
          sectionIndex,
          sectionNo: displayQuestionCode(answer?.customQuestionCode, derived.sectionNo),
          sectionOrdering: section.ordering,
          questionId: question.id,
          questionIndex,
          questionCode: question.questionCode,
          questionText: derived.questionText,
          answerTypes: questionAnswerTypes,
        }];
      }));
  }

  getPhotoRecords(): DataRecord[] {
    return [...this.getCellValueMap().entries()].flatMap(([cellId, answer]) => records(answer.attachments)
      .filter((attachment) => attachment.status !== false && /^(png|jpe?g)$/i.test(text(attachment.ext).replace(/^\./, '')))
      .map((attachment, attachmentIndex) => ({ cellId, answerCell: answer, attachment, attachmentIndex })));
  }

  getFollowupSections(): FollowupSection[] {
    const { checkLists, rows } = this.getPhotoRecordData();
    const observations = rows.filter((row) => row.role === 'observation');
    const followups = rows.filter((row) => row.role === 'followup');
    const sections = new Map<string, FollowupSection>();

    for (const checkList of checkLists) {
      const observationRows = observations.filter((row) => checkList.reachableQuestionIds.has(row.questionId));
      if (!observationRows.length) continue;

      let section = sections.get(checkList.groupSectionNo);
      if (!section) {
        section = { sectionNo: checkList.groupSectionNo, questions: [] };
        sections.set(checkList.groupSectionNo, section);
      }

      section.questions.push({
        sectionNo: checkList.sectionNo,
        description: checkList.description,
        value: checkList.value,
        rows: observationRows.map((observation) => {
          const candidates = followups.filter((followup) => checkList.reachableQuestionIds.has(followup.questionId));
          const followup = candidates.find((candidate) => candidate.answerRowIndex === observation.answerRowIndex)
            ?? (candidates.length === 1 ? candidates[0] : undefined);
          return {
            actionBy: followup?.actionBy ?? '',
            completionForAgreedDueDate: checkList.dueDates[observation.answerRowIndex] ?? observation.dueDate,
            completionDate: checkList.completionDates[observation.answerRowIndex] ?? followup?.completionDate ?? '',
            rectificationStatus: checkList.rectificationStatuses[observation.answerRowIndex] ?? followup?.rectificationStatus ?? '',
            location: observation.location,
            finding: observation.finding,
            action: followup?.action ?? '',
            observationPhotos: observation.attachments,
            followupPhotos: followup?.attachments ?? [],
          };
        }),
      });
    }

    return [...sections.values()];
  }

  getRemarkSections(): RemarkSection[] {
    const { checkLists, rows } = this.getPhotoRecordData();
    const remarks = rows.filter((row) => row.role === 'remarks');
    const sections = new Map<string, RemarkSection>();

    for (const checkList of checkLists) {
      const remarkRows = remarks.filter((row) => checkList.reachableQuestionIds.has(row.questionId));
      if (!remarkRows.length) continue;

      let section = sections.get(checkList.groupSectionNo);
      if (!section) {
        section = { sectionNo: checkList.groupSectionNo, questions: [] };
        sections.set(checkList.groupSectionNo, section);
      }

      section.questions.push({
        sectionNo: checkList.sectionNo,
        description: checkList.description,
        value: checkList.value,
        rows: remarkRows.map((remark) => ({
          location: remark.location,
          description: remark.description,
          photos: remark.attachments,
        })),
      });
    }

    return [...sections.values()];
  }

  private getPhotoRecordData(): PhotoRecordData {
    if (this.photoRecordData) return this.photoRecordData;

    const template = isRecord(this.data.template) ? this.data.template : {};
    const sections = records(template.sections);
    const answersByQuestionId = new Map<string, DataRecord>();
    for (const answer of records(this.data.answers)) {
      const questionId = id(answer.questionId);
      if (questionId) answersByQuestionId.set(questionId, answer);
    }

    const checkLists: CheckListRecord[] = [];
    const rows: PhotoRecordRow[] = [];
    const checkListSections = this.getCheckListSections();
    const checkListSectionByTemplateIndex = new Map<number, DataRecord>();
    let checkListSectionIndex = 0;
    for (const [sectionIndex, section] of sections.entries()) {
      const sectionQuestions = records(section.questions);
      if (sectionQuestions.some((question) => records(question.cells).some((cell) => answerType(cell) === 'togglebutton'))) {
        const checkListSection = checkListSections[checkListSectionIndex];
        if (checkListSection) checkListSectionByTemplateIndex.set(sectionIndex, checkListSection);
        checkListSectionIndex += 1;
      }
    }

    const workflowGroups = this.getCheckListWorkflowGroups();
    for (const [sectionIndex, section] of sections.entries()) {
      for (const [questionIndex, question] of records(section.questions).entries()) {
        const questionId = id(question.id);
        const answer = answersByQuestionId.get(questionId);
        const questionDescription = text(answer?.customQuestionDesc || question.questionDesc || question.questionName).trim();
        const questionDetails = splitQuestionDescription(questionDescription);
        const answerRows = records(answer?.rows);
        const questionCells = records(question.cells);
        const checkListCells = questionCells.filter((cell) => answerType(cell) === 'togglebutton');

        if (checkListCells.length > 0 && questionDetails.sectionNo) {
          const groupSectionNo = groupSectionNoForQuestion(questionDetails.sectionNo, sectionIndex);
          const sectionItems = records(checkListSectionByTemplateIndex.get(sectionIndex)?.items);
          const checkListItem = sectionItems.find((item) =>
            text(item.questionDesc) === text(question.questionDesc) ||
            text(item.questionName) === text(question.questionName) ||
            text(item.questionDesc) === text(question.questionName) ||
            text(item.questionName) === text(question.questionDesc));
          if (!checkListItem) continue;

          checkLists.push({
            sectionIndex,
            questionIndex,
            questionId,
            reachableQuestionIds: workflowGroups.get(questionId) ?? new Set(),
            groupSectionNo,
            sectionNo: questionDetails.sectionNo,
            description: text(checkListItem.toggleCellDesc || checkListItem.questionDesc),
            value: text(checkListItem.toggleName),
            dueDates: stringValues(checkListItem.dueDate),
            completionDates: stringValues(checkListItem.completionDate),
            rectificationStatuses: stringValues(checkListItem.rectificationStatus),
          });
        }

        const role = questionRoleForDescription(questionDetails.questionText);
        if (!answer || role === 'other') continue;

        for (const [answerRowIndex, answerRow] of answerRows.entries()) {
          const values = {
            location: '',
            finding: '',
            description: '',
            dueDate: '',
            completionDate: '',
            action: '',
            actionBy: '',
            rectificationStatus: '',
          };
          const attachments: DataRecord[] = [];
          const answerCells = records(answerRow.cells);

          for (const cell of questionCells) {
            const answerCell = answerCells.find((item) => id(item.cellId) === id(cell.id));
            if (!answerCell) continue;

            if (answerType(cell) === 'file') {
              attachments.push(...records(answerCell.attachments).filter(isPhotoAttachment).map((attachment) => ({ ...attachment })));
            }

            const field = fieldForCell(cell);
            if (field) values[field] = answerCellValue(cell, answerCell);
          }

          rows.push({
            sectionIndex,
            questionId,
            questionIndex,
            questionNo: questionDetails.sectionNo,
            questionText: questionDetails.questionText,
            role,
            answerRowIndex,
            ...values,
            attachments: attachmentList(attachments),
          });
        }
      }
    }

    this.photoRecordData = { checkLists, rows };
    return this.photoRecordData;
  }

  private getCheckListWorkflowGroups(): Map<string, Set<string>> {
    const template = isRecord(this.data.template) ? this.data.template : {};
    const questionById = new Map<string, DataRecord>();
    const triggeredByCell = new Map<string, Set<string>>();

    for (const section of records(template.sections)) {
      for (const question of records(section.questions)) {
        const questionId = id(question.id);
        if (!questionId) continue;
        questionById.set(questionId, question);
        for (const trigger of records(question.triggeredByCells)) {
          const cellId = id(trigger.cellId);
          if (!cellId) continue;
          const questions = triggeredByCell.get(cellId) ?? new Set<string>();
          questions.add(questionId);
          triggeredByCell.set(cellId, questions);
        }
      }
    }

    const groups = new Map<string, Set<string>>();
    for (const [questionId, question] of questionById.entries()) {
      const toggleCells = records(question.cells).filter((cell) => answerType(cell) === 'togglebutton');
      if (!toggleCells.length) continue;

      const reached = new Set<string>();
      const pending = [...toggleCells];
      while (pending.length) {
        const cell = pending.pop()!;
        const nextQuestionIds = new Set(triggeredByCell.get(id(cell.id)) ?? []);
        for (const flow of records(cell.flows)) {
          const nextQuestionId = id(flow.nextQuestionId);
          if (nextQuestionId) nextQuestionIds.add(nextQuestionId);
        }
        for (const nextQuestionId of nextQuestionIds) {
          if (reached.has(nextQuestionId)) continue;
          reached.add(nextQuestionId);
          const nextQuestion = questionById.get(nextQuestionId);
          if (nextQuestion) pending.push(...records(nextQuestion.cells));
        }
      }
      groups.set(questionId, reached);
    }
    return groups;
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
  getFollowupSections(): FollowupSection[];
  getRemarkSections(): RemarkSection[];
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
