import { describe, expect, test } from 'bun:test';

import { additionalJsContext, createRenderBuilder, registeredFunctionNames } from '../src/services/js-context.js';
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

  test('converts inline image data into a docx-templates image payload', async () => {
    const image = await additionalJsContext.renderImage('data:image/png;base64,aGVsbG8=', { scale: { width: 120 } });
    expect(image).toMatchObject({ data: 'aGVsbG8=', extension: '.png' });
    expect(image.width).toBeCloseTo(120 / 37.795275591);
  });
});
