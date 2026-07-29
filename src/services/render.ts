import { createReport } from 'docx-templates';

import { CliError } from '../utils/errors.js';
import { additionalJsContext, createRenderBuilder } from './js-context.js';

export function normalizeRenderData(data: unknown): unknown {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  const source = data as Record<string, unknown>;
  const formData = source.formData;
  const normalized = formData && typeof formData === 'object' && !Array.isArray(formData)
    ? { ...source, ...formData }
    : { ...source };
  if (!normalized.builder) normalized.builder = createRenderBuilder(normalized.template, normalized.answers);
  return normalized;
}

export async function renderDocx(document: Uint8Array, data: unknown): Promise<Uint8Array> {
  if (data === null || typeof data !== 'object') throw new CliError('Render data must be a JSON object or array.');
  try {
    const rendered = await createReport({
      template: Buffer.from(document),
      data: normalizeRenderData(data),
      additionalJsContext,
      cmdDelimiter: ['+++', '+++'],
      failFast: true,
    });
    return new Uint8Array(rendered);
  } catch (error) {
    if (error instanceof Error) throw new CliError(`DOCX rendering failed: ${error.message}`);
    throw new CliError('DOCX rendering failed with a non-error value.');
  }
}
