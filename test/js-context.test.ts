import { describe, expect, test } from 'bun:test';

import { additionalJsContext, createRenderBuilder, registeredFunctionNames } from '../src/services/js-context.js';
import { appendOptions, loaderBuilder, textParse } from '../src/services/form-data.js';
import { normalizeRenderData } from '../src/services/render.js';

const template = {
  sections: [{
    ordering: 1,
    questions: [{
      id: 'question-1',
      questionCode: 'QUESTION',
      questionDesc: 'Question description',
      questionName: 'Question name',
      cells: [{
        id: 'cell-1',
        questionId: 'question-1',
        cellCode: 'CELL_1',
        cellDesc: 'Cell description',
        answerGroup: { generalOptions: [{ id: 'option-1', name: 'Selected option' }] },
      }],
    }],
  }],
};

const answers = [{
  questionId: 'question-1',
  customQuestionCode: 'CUSTOM',
  customQuestionDesc: 'Custom description',
  rows: [{ status: true, cells: [{ cellId: 'cell-1', answerId: 'option-1' }] }],
}];

describe('data-driven additionalJsContext compatibility', () => {
  test('resolves template cells, answer rows, and question metadata without form mappings', () => {
    expect(additionalJsContext.renderAnswerCellValue(template, answers, 'CELL_1')).toBe('Selected option');
    expect(additionalJsContext.renderAnswerRows(template, answers, 'CELL_1')).toHaveLength(1);
    expect(additionalJsContext.renderQuestion(template, answers, 'unused', 'CELL_1')).toEqual({
      code: 'CUSTOM',
      description: 'Custom description',
      name: 'Question description',
    });
  });

  test('supports lodash-style object paths and generic form action selection', () => {
    expect(additionalJsContext.renderObjectField({ items: [{ name: 'DWSS' }] }, 'items[0].name', '/')).toBe('DWSS');
    expect(additionalJsContext.renderFormNo('A/B/C/V1', true)).toBe('A/B/C');
    expect(additionalJsContext.renderFormAction(
      [{ formStatusIdentifier: 'approved', actionBy: 'user-1', actionAt: '2026-07-28T09:10:11Z', actionSignatureBase64: 'abc' }],
      [{ value: 'user-1', userName: 'Reviewer', position: 'Engineer', label: 'R', phone: { dialingCode: '+852', phoneNo: '1234' } }],
      [{ identifier: 'approved', statusCode: 'APPROVED' }],
      ['APPROVED'],
    )).toMatchObject({ actionByName: 'Reviewer', actionDate: '2026-07-28', actionSignatureBase64: 'abc' });
  });

  test('registers required service-compatible functions and unwraps supplied formData', () => {
    for (const name of ['renderAnswerCellValue', 'renderAnswerRows', 'renderAttachmentImage', 'renderImage', 'renderObjectField', 'renderFormNo', 'renderQuestion', 'renderFormAction']) {
      expect(registeredFunctionNames.has(name)).toBe(true);
    }
    expect(normalizeRenderData({ exportTemplate: {}, formData: { formNo: 'CIC/1' } })).toMatchObject({ formNo: 'CIC/1' });
  });

  test('builds summary values from direct answer values without category mappings', () => {
    const builder = createRenderBuilder(template, answers);
    expect(builder.summarySectionItems(builder.getCheckListSectionsWithCache(), 'Selected option')).toBe(1);
  });

  test('formats dates in Hong Kong time and renders every checklist date', () => {
    expect(additionalJsContext.renderDatetime('2026-06-30T00:40:00.000Z')).toBe('30 June 2026, 08:40');
    expect(additionalJsContext.renderHongKongDateTime('2026-06-30T00:40:00.000Z', 'd MMMM yyyy, HH:mm')).toBe('30 June 2026, 08:40');
    expect(additionalJsContext.renderDatetime('not-a-date')).toBe('');
    expect(additionalJsContext.renderDatetimes([
      '2026-06-29T04:25:00+08:00',
      '2026-06-28T05:15:00+08:00',
    ])).toBe('29 June 2026, 04:25\n28 June 2026, 05:15');
  });

  test('converts inline image data into a docx-templates image payload', async () => {
    const image = await additionalJsContext.renderImage('data:image/png;base64,aGVsbG8=', { scale: { width: 120 } });
    expect(image).toMatchObject({ data: 'aGVsbG8=', extension: '.png' });
    expect(image.width).toBeCloseTo(120 / 37.795275591);
  });

  test('wraps form data with checklist and helper aliases', () => {
    const data = loaderBuilder({ template, answers });
    expect(data.builder).toBe(data.helper);
    expect(data.builder).toBe(data.filter);
    expect(data.builder.getCheckListSections()).toHaveLength(0);
    expect(appendOptions([{ key: 'remarks', label: 'Remarks', answerTypes: ['text'] }]).targetColumns).toHaveLength(4);
    expect(textParse('first<w:br>second<w:br>third')).toEqual({ text: 'first', breaker: 2 });
  });
});
