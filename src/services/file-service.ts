import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { CliError } from '../utils/errors';

const INTERNAL_FILE_SERVICE = 'http://dwss-files:8000';
const RELATIVE_FILE_PATH = /^\/api\/v1\/files\//;

function withoutTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export function parseFileServiceUrl(envFile: string): string | undefined {
  const line = envFile
    .split(/\r?\n/)
    .find((candidate) => /^\s*(?:export\s+)?FILE_SERVICE_URL\s*=/.test(candidate));
  if (!line) return undefined;
  const value = line
    .replace(/^\s*(?:export\s+)?FILE_SERVICE_URL\s*=\s*/, '')
    .trim()
    .replace(/^(['"])(.*)\1$/, '$2');
  return value ? withoutTrailingSlash(value) : undefined;
}

export async function loadFileServiceUrl(): Promise<string | undefined> {
  if (process.env.FILE_SERVICE_URL?.trim()) return withoutTrailingSlash(process.env.FILE_SERVICE_URL.trim());
  const envFiles = [
    resolve(import.meta.dirname, '..', '..', '.env'),
    resolve(import.meta.dirname, '..', '..', '..', 'dwss-convertor-service', '.env'),
  ];
  for (const envFile of envFiles) {
    try {
      const value = parseFileServiceUrl(await readFile(envFile, 'utf8'));
      if (value) return value;
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') continue;
      throw error;
    }
  }
  return undefined;
}

export function normalizeFileServiceUrl(fileUrl: string, fileServiceUrl?: string): string {
  const configured = fileServiceUrl ? withoutTrailingSlash(fileServiceUrl) : undefined;
  if (RELATIVE_FILE_PATH.test(fileUrl)) {
    if (!configured) throw new CliError('FILE_SERVICE_URL is required to resolve a relative file-service path.');
    return `${configured}${fileUrl}`;
  }
  if (fileUrl === INTERNAL_FILE_SERVICE || fileUrl.startsWith(`${INTERNAL_FILE_SERVICE}/`)) {
    return configured ? `${configured}${fileUrl.slice(INTERNAL_FILE_SERVICE.length)}` : fileUrl;
  }
  return fileUrl;
}

function imageExtension(contentType: string | null): string {
  const subtype = contentType?.split(';', 1)[0].trim().toLowerCase().match(/^image\/([a-z0-9+.-]+)$/)?.[1];
  if (!subtype) return '.png';
  return `.${subtype === 'jpg' ? 'jpeg' : subtype}`;
}

export interface FetchFileOptions {
  fileServiceUrl?: string;
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
}

export interface FetchedImage {
  data: string;
  extension: string;
}

export async function fetchImageFile(fileUrl: string, options: FetchFileOptions = {}): Promise<FetchedImage> {
  const configured = options.fileServiceUrl ?? await loadFileServiceUrl();
  const requestUrl = normalizeFileServiceUrl(fileUrl, configured);
  let response: Response;
  try {
    const fetchImpl = options.fetchImpl ?? ((url: string, init?: RequestInit) => fetch(url, init));
    response = await fetchImpl(requestUrl, { signal: AbortSignal.timeout(30_000) });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'network failure';
    throw new CliError(`Image download failed: ${detail}`);
  }
  if (!response.ok) throw new CliError(`Image download failed with HTTP ${response.status} ${response.statusText}.`);
  return {
    data: Buffer.from(await response.arrayBuffer()).toString('base64'),
    extension: imageExtension(response.headers.get('content-type')),
  };
}
