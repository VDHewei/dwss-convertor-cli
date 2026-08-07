import { readFile } from 'node:fs/promises';

import { CliError } from '../utils/errors';

export interface DataSourceOptions {
  dataFile?: string;
  dataUrl?: string;
  method?: string;
  body?: string;
  query?: string;
  header?: string;
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
}

function parseJson(input: string, source: string): unknown {
  try {
    return JSON.parse(input);
  } catch (error) {
    const detail = error instanceof SyntaxError ? error.message : 'invalid JSON';
    throw new CliError(`${source} did not contain valid JSON: ${detail}`);
  }
}

function parseJsonObject(input: string, source: string): Record<string, unknown> {
  const value = parseJson(input, source);
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new CliError(`${source} must be a JSON object.`);
  }
  return value as Record<string, unknown>;
}

function queryValue(value: unknown, source: string): string {
  if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) return value == null ? '' : String(value);
  throw new CliError(`${source} values must be strings, numbers, booleans, null, or arrays of those values.`);
}

function withQuery(urlValue: string, query?: string): string {
  if (!query) return urlValue;
  let url: URL;
  try {
    url = new URL(urlValue);
  } catch {
    throw new CliError(`Data URL "${urlValue}" is invalid.`);
  }
  for (const [key, rawValue] of Object.entries(parseJsonObject(query, '--query'))) {
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    url.searchParams.delete(key);
    for (const value of values) url.searchParams.append(key, queryValue(value, '--query'));
  }
  return url.toString();
}

function requestHeaders(header?: string, includeJsonContentType = false): Headers | undefined {
  const values = header ? parseJsonObject(header, '--header') : {};
  const headers = new Headers();
  for (const [key, value] of Object.entries(values)) {
    if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) headers.set(key, value == null ? '' : String(value));
    else throw new CliError('--header values must be strings, numbers, booleans, or null.');
  }
  if (includeJsonContentType && !headers.has('content-type')) headers.set('content-type', 'application/json');
  return [...headers.keys()].length ? headers : undefined;
}

export async function loadRenderData(options: DataSourceOptions): Promise<any> {
  if (Boolean(options.dataFile) === Boolean(options.dataUrl)) {
    throw new CliError('Specify exactly one of --data-file or --data-url.');
  }
  if (options.dataFile) {
    if (options.method || options.body || options.query || options.header) {
      throw new CliError('--method, --body, --query, and --header are only valid with --data-url.');
    }
    return parseJson(await readFile(options.dataFile, 'utf8'), `Data file "${options.dataFile}"`);
  }

  const method = options.method?.toUpperCase() ?? 'GET';
  if (method !== 'GET' && method !== 'POST') throw new CliError('--method must be GET or POST.');
  if (method === 'GET' && options.body) throw new CliError('GET data requests must not include --body.');
  if (method === 'POST' && !options.body) throw new CliError('POST data requests require an explicit JSON --body.');
  const body = options.body ? parseJson(options.body, '--body') : undefined;
  const fetchImpl = options.fetchImpl ?? ((url: string, init?: RequestInit) => fetch(url, init));
  const response = await fetchImpl(withQuery(options.dataUrl!, options.query), {
    method,
    headers: requestHeaders(options.header, method === 'POST'),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new CliError(`Data request failed with HTTP ${response.status} ${response.statusText}.`);
  return parseJson(await response.text(), `Data URL "${options.dataUrl}"`);
}
