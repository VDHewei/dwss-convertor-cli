import { readFile } from 'node:fs/promises';

import { CliError } from '../utils/errors.js';

export interface DataSourceOptions {
  dataFile?: string;
  dataUrl?: string;
  method?: string;
  body?: string;
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

export async function loadRenderData(options: DataSourceOptions): Promise<unknown> {
  if (Boolean(options.dataFile) === Boolean(options.dataUrl)) {
    throw new CliError('Specify exactly one of --data-file or --data-url.');
  }
  if (options.dataFile) {
    if (options.method || options.body) throw new CliError('--method and --body are only valid with --data-url.');
    return parseJson(await readFile(options.dataFile, 'utf8'), `Data file "${options.dataFile}"`);
  }

  const method = options.method?.toUpperCase() ?? 'GET';
  if (method !== 'GET' && method !== 'POST') throw new CliError('--method must be GET or POST.');
  if (method === 'GET' && options.body) throw new CliError('GET data requests must not include --body.');
  if (method === 'POST' && !options.body) throw new CliError('POST data requests require an explicit JSON --body.');
  const body = options.body ? parseJson(options.body, '--body') : undefined;
  const fetchImpl = options.fetchImpl ?? ((url: string, init?: RequestInit) => fetch(url, init));
  const response = await fetchImpl(options.dataUrl!, {
    method,
    headers: method === 'POST' ? { 'content-type': 'application/json' } : undefined,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new CliError(`Data request failed with HTTP ${response.status} ${response.statusText}.`);
  return parseJson(await response.text(), `Data URL "${options.dataUrl}"`);
}
