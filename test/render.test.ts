import { describe, expect, test } from 'bun:test';
import JSZip from 'jszip';

import { renderDocx } from '../src/services/render';
import { documentXml, makeDocx } from './helpers';

describe('DOCX rendering', () => {
  test('renders registered template data into a DOCX', async () => {
    const template = await makeDocx('<w:p><w:r><w:t>+++INS name+++</w:t></w:r></w:p>');
    const rendered = await renderDocx(template, { name: 'DWSS' });
    expect(await documentXml(rendered)).toContain('DWSS');
  });

  test('replaces {{draft}} with the draft image before rendering', async () => {
    const template = await makeDocx('<w:p><w:r><w:t>{{draft}}</w:t></w:r></w:p>');
    const rendered = await renderDocx(template, { formExtraInfo: { endOfFlow: false } });
    const zip = await JSZip.loadAsync(rendered);

    expect(await documentXml(rendered)).not.toContain('{{draft}}');
    expect(Object.keys(zip.files).some((path) => path.startsWith('word/media/'))).toBe(true);
  });

  test('removes {{draft}} without a watermark when the flow has ended', async () => {
    const template = await makeDocx('<w:p><w:r><w:t>{{draft}}</w:t></w:r></w:p>');
    const rendered = await renderDocx(template, { formExtraInfo: { endOfFlow: true } });
    const zip = await JSZip.loadAsync(rendered);

    expect(await documentXml(rendered)).not.toContain('{{draft}}');
    expect(Object.keys(zip.files).some((path) => path.startsWith('word/media/'))).toBe(false);
  });
});
