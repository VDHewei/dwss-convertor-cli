import { describe, expect, test } from 'bun:test';

import { CliError } from '../src/utils/errors';
import { loadRenderData } from '../src/services/data-source';

async function rejectedValue(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error;
  }
}

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

  test('adds JSON query parameters and request headers to URL data sources', async () => {
    let requestUrl = '';
    let headers: Headers | undefined;
    await loadRenderData({
      dataUrl: 'https://example.test/data?existing=yes',
      query: '{"projectId":42,"tag":["urgent","docx"]}',
      header: '{"authorization":"Bearer token","x-request-id":123}',
      fetchImpl: async (url, init) => {
        requestUrl = url;
        headers = new Headers(init?.headers);
        return new Response('{}', { status: 200 });
      },
    });
    const url = new URL(requestUrl);
    expect(url.searchParams.get('existing')).toBe('yes');
    expect(url.searchParams.get('projectId')).toBe('42');
    expect(url.searchParams.getAll('tag')).toEqual(['urgent', 'docx']);
    expect(headers?.get('authorization')).toBe('Bearer token');
    expect(headers?.get('x-request-id')).toBe('123');
  });

  test('requires an explicit JSON body for POST and reports HTTP failures', async () => {
    const missingBodyError = await rejectedValue(loadRenderData({
      dataUrl: 'https://example.test/data',
      method: 'POST',
    }));
    expect(missingBodyError).toBeInstanceOf(CliError);

    const httpError = await rejectedValue(loadRenderData({
      dataUrl: 'https://example.test/data',
      fetchImpl: async () => new Response('not found', { status: 404, statusText: 'Not Found' }),
    }));
    expect(httpError).toBeInstanceOf(CliError);
    expect((httpError as Error).message).toContain('HTTP 404');
  });
});
