---
name: docx-cli
description: Use the docx-convertor-cli command line to chat/check/fix/render (dwss project) docx-template syntax in docx templates
dependencies:
  markdown:
    - path: ../skills/docx-cli/function_usage.md
      purpose: DWSS DOCX Template Functions and Data Assistance Tools Description
---
# DOCX template CLI skill

## Render URL request parameters

When rendering from `--data-url`, pass optional JSON objects with `--query` and `--header`:

```text
dwss-convertor-cli render <input.docx> --output <output.docx> (--data-file <data.json> | --data-url <url> [--query <json>] [--header <json>] [--method GET | --method POST --body <json>])

dwss-convertor-cli render template.docx --output rendered.docx \
  --data-url "https://api.example.test/forms" \
  --query '{"projectId":42,"tag":["urgent","docx"]}' \
  --header '{"authorization":"Bearer token","x-request-id":"request-1"}'
```

- `--query <json>` merges scalar or scalar-array values into the URL query string; supplied keys replace existing values with the same key.
- `--header <json>` adds request headers. Header values may be strings, numbers, booleans, or `null`.
- `--method POST --body <json>` remains required for POST. A caller-provided `content-type` header is preserved; otherwise POST uses `application/json`.
- `--method`, `--body`, `--query`, and `--header` require `--data-url` and cannot be used with `--data-file`.

## `chat` subcommand: function and helper Q&A

**Mandatory routing:** When `/docx-cli chat <question>` is invoked, use this `docx-cli` Skill only. Do **not** invoke Graphify or any other Skill, and do not query a code graph.

Use `chat` to query the Js-Context, `FormDataBuilder`, data proxy, togglebutton checklist, special-text, and DOCX font utilities documented in `function_usage.md`:

```text
/docx-cli chat renderDatetime
/docx-cli chat "How do I read a checklist with builder?"
/docx-cli chat "What are the input and return value of deobfuscateDocxFont?"
```

Chat Command Processing Rules:

1. **First action:** read `skills/docx-cli/function_usage.md` in full before answering. It is the primary source for every `chat` response.
2. For a CLI-supported function, explain its name, purpose, parameters, return value, template example, and data prerequisites.
3. For a service-only function, explicitly state why it is unavailable in the CLI and give the documented CLI alternative, such as `builder.getCheckListSections()`.
4. For “current functions”, “all functions”, “有哪些函数”, or equivalent listing requests, list every function documented in `function_usage.md`, grouped as Js-Context, `FormDataBuilder`, checklist/special-text utilities, and DOCX font tools. Mark service-only functions separately.
5. If the question is ambiguous, ask only one necessary clarification. Do not invent undocumented functions, parameters, or business mappings.
6. `chat` is a Skill conversation entry point, not a runtime command of the `dwss-convertor-cli` executable. It must not edit templates, issue network requests, or write files.

For independent maintenance of DOCX templates:

1. Run `check` before executing `fix` or `render`.
2. Only use `replace` to make changes to visible text; it preserves run formatting by editing `w:t` values. For multiple changes, use `--replacements-file` and provide a `"old" : "new"` mapping; each mapping must match, otherwise no output will be generated.
3. Use `find` for literal, case-sensitive searches of visible paragraphs. Use `--json` when other tools require ordered matching results.
4. When executing `fix`, review each unknown function prompt; rejecting these prompts will result in no output file. Progress, differences, and hit counts will identify each safe fix.
5. Provide rendering data using `--data-file` or `--data-url`. URLs default to using the GET method; if using the POST method, add `--method POST --body '<json>'`.
6. Complete command line conversion instructions
- fix: `docx-cli fix <input.docx> --output [output.docx]` TO `dwss-convertor-cli fix <input.docx> --output [output.docx]`
- replace: `docx-cli replace <input.docx> <find> <replacement> --output <output.docx>` TO `dwss-convertor-cli replace <input.docx> <find> <replacement> --output <output.docx>`
- check: `docx-cli check <input.docx> [--data-file <data.json>]` TO `dwss-convertor-cli check <input.docx> 
  [--data-file <data.json>]`
- render: `docx-cli render <input.docx> --output <output.docx> (--data-file <data.json> | --data-url <url> [--method 
  GET | --method POST --body <json>])` TO `dwss-convertor-cli render <input.docx> --output <output.docx> (--data-file <data.json> | --data-url 
  <url> [--method GET | --method POST --body <json>])`
