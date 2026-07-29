import { describe, expect, test } from 'bun:test';

import { CliError } from '../src/utils/errors.js';
import { loadRenderData } from '../src/services/data-source.js';

describe('HTTP render data sources', () => {
  test('uses GET by default and accepts JSON response', async () => {
    let init: RequestInit | undefined;
    const data = await loadRenderData({
      dataUrl: 'https://example.test/data',
      fetchImpl: async (_url, request) => {
        init = request;
        return new Response('{"name":"DWSS"}', { status: 200 });
      },
    });
    expect(init?.method).toBe('GET');
    expect(data).toEqual({ name: 'DWSS' });
  });

  test('requires an explicit JSON body for POST and reports HTTP failures', async () => {
    await expect(loadRenderData({ dataUrl: 'https://example.test/data', method: 'POST' })).rejects.toBeInstanceOf(CliError);
    await expect(loadRenderData({
      dataUrl: 'https://example.test/data',
      fetchImpl: async () => new Response('not found', { status: 404, statusText: 'Not Found' }),
    })).rejects.toThrow('HTTP 404');
  });
});
