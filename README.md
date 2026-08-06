# dwss-convertor-cli

Standalone Bun CLI for safe DOCX text replacement, `docx-templates` checks/fixes, and DOCX rendering.

```powershell
bun install
bun run src/cli.ts check template.docx
bun run src/cli.ts replace template.docx "old" "new" --output updated.docx
bun run src/cli.ts replace template.docx --replacements-file mappings.txt --output updated.docx
bun run src/cli.ts find template.docx "inspection" "signature" --json matches.json
bun run src/cli.ts fix template.docx --output fixed.docx
bun run src/cli.ts render template.docx --data-file data.json --output rendered.docx
bun run src/cli.ts render template.docx --data-url https://example.test/data --method POST --body '{"id":1}' --output rendered.docx
```

`check` exits nonzero on syntax, token, command, or unregistered-function errors. `fix` shows DOCX scan progress, an itemized before/after diff, and replacement counts. It performs only deterministic repairs and requires an interactive confirmation for a fuzzy function rename.

## Standalone binary builds

```powershell
bun run build:windows
bun run build:linux:x64
bun run build:linux:arm64
bun run build:macos:x64
bun run build:macos:arm64
bun run build:all
```

Binary outputs are written to `dist/`.

## Text replacement and search

Single replacement retains `replace <docx> <find> <replacement> --output ...`. Batch replacement uses `--replacements-file`; each non-empty line is one mapping:

```text
"old text" : "new text"
"a \"quoted\" value" : "a \\ path"
```

Supported escapes are `\"`, `\\`, `\n`, `\r`, and `\t`. Duplicate or overlapping source text is rejected. All batch mappings are matched against the original visible DOCX text. Every mapping must have at least one hit or the command fails and writes no output file.

`find` performs literal, case-sensitive matching against visible Word paragraphs. It accepts one or more positional queries and optional `--find-file <queries.txt>` (one query per non-empty line, appended after positional queries). `--json <output.json>` writes UTF-8 JSON to file; `--json` without a path prints prettified JSON to terminal:

```json
[{"find":"inspection","matches":["matching visible paragraph"]}]
```

Queries retain their supplied order. A query with no match succeeds with an empty `matches` array and a `No matching lines.` terminal message.

For relative file-service image paths, set `FILE_SERVICE_URL` in `dwss-convertor-cli/.env`. The process environment takes precedence; the CLI falls back to the sibling `dwss-convertor-service/.env` for existing workspace compatibility.

## User skill file mapping

| Source file | Target agent           | Copy destination |
|---|------------------------|---|
| `skills/docx-cli/SKILL.md` | GitHub Copilot Agent   | `.github/prompts/docx-cli.prompt.md` |
| `skills/docx-cli/SKILL.md` | Anthropic Claude Agent | `.claude/commands/docx-cli.md` |
| `skills/docx-cli/SKILL.md` | DeepSeek Agent         | `.reasonix/skills/docx-cli.md` |
| `skills/docx-cli/SKILL.md` | GitHub Copilot Agent Copilot v1.0.78  | `.github/prompts/docx-cli.md` |
