#!/usr/bin/env bun
import { runCommand } from './cmd/command';
import { CliError } from './utils/errors';

try {
  process.exitCode = await runCommand(process.argv.slice(2));
} catch (error) {
  if (error instanceof CliError) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = error.exitCode;
  } else if (error instanceof Error) {
    process.stderr.write(`Unexpected error: ${error.message}\n`);
    process.exitCode = 1;
  } else {
    process.stderr.write('Unexpected non-error failure.\n');
    process.exitCode = 1;
  }
}
