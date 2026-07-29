import { describe, expect, test } from 'bun:test';

import { fetchImageFile, normalizeFileServiceUrl, parseFileServiceUrl } from '../src/services/file-service.js';

describe('file-service image resolution', () => {
  test('reads FILE_SERVICE_URL from standard .env assignment forms', () => {
    expect(parseFileServiceUrl('FILE_SERVICE_URL=https://files.example.test/\n')).toBe('https://files.example.test');
    expect(parseFileServiceUrl('export FILE_SERVICE_URL = "https://files.example.test/"\n')).toBe('https://files.example.test');
    expect(parseFileServiceUrl('OTHER_VALUE=true\n')).toBeUndefined();
  });

  test('normalizes relative and internal service-compatible paths', () => {
    const serviceUrl = 'http://file-service.test/';
    expect(normalizeFileServiceUrl('/api/v1/files/image.png', serviceUrl)).toBe('http://file-service.test/api/v1/files/image.png');
    expect(normalizeFileServiceUrl('http://dwss-files:8000/api/v1/files/image.png', serviceUrl)).toBe('http://file-service.test/api/v1/files/image.png');
    expect(normalizeFileServiceUrl('https://cdn.example.test/image.png', serviceUrl)).toBe('https://cdn.example.test/image.png');
  });

  test('fetches a normalized image path without credentials', async () => {
    let requestedUrl = '';
    const image = await fetchImageFile('/api/v1/files/image.png', {
      fileServiceUrl: 'http://file-service.test',
      fetchImpl: async (url) => {
        requestedUrl = String(url);
        return new Response(Uint8Array.from([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        });
      },
    });
    expect(requestedUrl).toBe('http://file-service.test/api/v1/files/image.png');
    expect(image).toEqual({ data: 'AQID', extension: '.png' });
  });
});
