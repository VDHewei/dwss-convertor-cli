import { describe, expect, test } from 'bun:test';

import { renderDocx } from '../src/services/render.js';
import { documentXml, makeDocx } from './helpers.js';

describe('DOCX rendering', () => {
  test('renders registered template data into a DOCX', async () => {
    const template = await makeDocx('<w:p><w:r><w:t>+++INS name+++</w:t></w:r></w:p>');
    const rendered = await renderDocx(template, { name: 'DWSS' });
    expect(await documentXml(rendered)).toContain('DWSS');
  });
});
