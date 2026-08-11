import { describe, expect, test } from 'bun:test';

import { FormDataBuilderImpl } from '../src/services/form-data';

function photo(fileName: string) {
  return {
    status: true,
    ext: 'png',
    fileUrl: `https://files.example.test/${fileName}`,
    fileName,
  };
}

describe('FormDataBuilder WEB-9072 compatibility', () => {
  test('aggregates followup sections by checklist workflow and answer row index', () => {
    const formData = {
      template: {
        sections: [{
          ordering: 1,
          questions: [
            {
              id: 'q10',
              questionDesc: 'B2 MSDS are available',
              questionName: 'B2 MSDS are available',
              cells: [{
                id: 'c101',
                answerType: 'togglebutton',
                cellDesc: 'MSDS are Available',
                answerGroup: { generalOptions: [{ id: 'opt-1', name: 'Complied' }] },
                flows: [{ nextQuestionId: 'q20' }],
              }],
            },
            {
              id: 'q20',
              questionDesc: 'B2 Observation',
              cells: [
                { id: 'c201', answerType: 'autocomplete', cellDesc: 'Area/Location', answerGroup: { generalOptions: [{ id: 'opt-2', name: 'Tunnel' }] } },
                { id: 'c202', answerType: 'textarea', cellDesc: 'Finding' },
                { id: 'c203', answerType: 'datetime', cellDesc: 'Agreed Due Date for Completion' },
                { id: 'c204', answerType: 'file', cellDesc: 'Photo Upload', flows: [{ nextQuestionId: 'q30' }] },
              ],
            },
            {
              id: 'q30',
              questionDesc: 'B2 Followup',
              cells: [
                { id: 'c301', answerType: 'datetime', cellDesc: 'Date of Completed' },
                { id: 'c302', answerType: 'textarea', cellDesc: 'Preposed Rectification Measures' },
                { id: 'c303', answerType: 'text', cellDesc: 'Action by' },
                { id: 'c304', answerType: 'file', cellDesc: 'Photo Upload' },
                { id: 'c305', answerType: 'text', cellDesc: 'Rectification Status' },
              ],
            },
          ],
        }],
      },
      answers: [
        {
          questionId: 'q10',
          rows: [{ cells: [{ cellId: 'c101', answerId: 'opt-1' }] }],
        },
        {
          questionId: 'q20',
          rows: [
            {
              cells: [
                { cellId: 'c201', answerId: 'opt-2' },
                { cellId: 'c202', answerVal: 'First finding' },
                { cellId: 'c203', answerVal: '2026-08-01' },
                { cellId: 'c204', attachments: [photo('before-1.png')] },
              ],
            },
            {
              cells: [
                { cellId: 'c201', answerId: 'opt-2' },
                { cellId: 'c202', answerVal: 'Second finding' },
                { cellId: 'c203', answerVal: '2026-08-02' },
                { cellId: 'c204', attachments: [] },
              ],
            },
          ],
        },
        {
          questionId: 'q30',
          rows: [
            {
              cells: [
                { cellId: 'c301', answerVal: '2026-08-03' },
                { cellId: 'c302', answerVal: 'First action' },
                { cellId: 'c303', answerVal: 'Supervisor' },
                { cellId: 'c304', attachments: [photo('after-1.png')] },
                { cellId: 'c305', answerVal: 'Complete' },
              ],
            },
            {
              cells: [
                { cellId: 'c301', answerVal: '2026-08-04' },
                { cellId: 'c302', answerVal: 'Second action' },
                { cellId: 'c303', answerVal: 'Technician' },
                { cellId: 'c304', attachments: [] },
                { cellId: 'c305', answerVal: 'Pending' },
              ],
            },
          ],
        },
      ],
    };

    const builder = new FormDataBuilderImpl(formData);
    const sections = builder.getFollowupSections();

    expect(sections).toHaveLength(1);
    expect(sections[0].sectionNo).toBe('B');
    expect(sections[0].questions).toHaveLength(1);
    expect(sections[0].questions[0]).toMatchObject({
      sectionNo: 'B2',
      value: 'Complied',
    });
    expect(sections[0].questions[0].rows[0]).toMatchObject({
      location: 'Tunnel',
      finding: 'First finding',
      completionForAgreedDueDate: '2026-08-01',
      completionDate: '2026-08-03',
      action: 'First action',
      actionBy: 'Supervisor',
      rectificationStatus: 'Complete',
    });
    expect(sections[0].questions[0].rows[1]).toMatchObject({
      finding: 'Second finding',
      completionForAgreedDueDate: '2026-08-02',
      completionDate: '2026-08-04',
      rectificationStatus: 'Pending',
      action: 'Second action',
    });
  });

  test('aggregates remark sections independently from followup', () => {
    const formData = {
      template: {
        sections: [{
          ordering: 1,
          questions: [
            {
              id: 'q10',
              questionDesc: 'C1 Remarks title',
              questionName: 'C1 Remarks title',
              cells: [{
                id: 'c101',
                answerType: 'togglebutton',
                cellDesc: 'Remarks title',
                answerGroup: { generalOptions: [{ id: 'opt-1', name: 'Noted' }] },
                flows: [{ nextQuestionId: 'q20' }],
              }],
            },
            {
              id: 'q20',
              questionDesc: 'C1 Remarks',
              questionName: 'C1 Remarks',
              cells: [
                { id: 'c201', answerType: 'autocomplete', cellDesc: 'Area/Location', answerGroup: { generalOptions: [{ id: 'opt-2', name: 'Open road' }] } },
                { id: 'c202', answerType: 'textarea', cellDesc: 'Description' },
                { id: 'c203', answerType: 'file', cellDesc: 'Photo Upload' },
              ],
            },
          ],
        }],
      },
      answers: [
        {
          questionId: 'q10',
          rows: [{ cells: [{ cellId: 'c101', answerId: 'opt-1' }] }],
        },
        {
          questionId: 'q20',
          rows: [
            {
              cells: [
                { cellId: 'c201', answerId: 'opt-2' },
                { cellId: 'c202', answerVal: 'First remark' },
                { cellId: 'c203', attachments: [photo('remark-1.png')] },
              ],
            },
            {
              cells: [
                { cellId: 'c201', answerId: 'opt-2' },
                { cellId: 'c202', answerVal: 'Second remark' },
                { cellId: 'c203', attachments: [] },
              ],
            },
          ],
        },
      ],
    };

    const builder = new FormDataBuilderImpl(formData);
    const sections = builder.getRemarkSections();

    expect(sections).toEqual([{
      sectionNo: 'C',
      questions: [{
        sectionNo: 'C1',
        description: 'Remarks title',
        value: 'Noted',
        rows: [
          {
            location: 'Open road',
            description: 'First remark',
            photos: [expect.objectContaining({ fileName: 'remark-1.png' })],
          },
          {
            location: 'Open road',
            description: 'Second remark',
            photos: [],
          },
        ],
      }],
    }]);
    expect(builder.getFollowupSections()).toEqual([]);
  });
});
