---
name: docx-cli
description: Use the docx-convertor-cli command line to check/fix/render (dwss project) docx-template syntax in docx templates
---
# DOCX 模板 命令行

用于独立维护DOCX模板:

1. 在执行 `fix` 或 `render` 前，请先运行 `check`。
2. 仅使用 `replace` 来进行可见文本的更改；它通过编辑 `w:t` 值来保留运行格式。对于多次更改，请使用 `--replacements-file` 并提供 `"old" : "new"` 映射；每个映射必须匹配，否则不会生成输出。
3. 使用 `find` 进行字面量、大小写敏感的可见段落搜索。当其他工具需要有序的匹配结果时，请使用 `--json`。
4. 在执行 `fix` 时，审查每一个未知函数提示；拒绝这些提示将导致没有输出文件。进度、差异和命中次数会标识每个安全的修复。
5. 使用 `--data-file` 或 `--data-url` 提供渲染数据。URL 默认使用 GET 方法；若使用 POST 方法，请添加 `--method POST --body '<json>'`。
6. 完整命令行转换说明
- fix: `docx-cli fix <input.docx> --output [output.docx]` TO  `dwss-convertor-cli fix <input.docx> --output [output.docx]`
- replace: `docx-cli replace <input.docx> <find> <replacement> --output <output.docx>` TO  `dwss-convertor-cli replace <input.docx> <find> <replacement> --output <output.docx>`
- check:`docx-cli check <input.docx> [--data-file <data.json>]` TO `dwss-convertor-cli check <input.docx> 
  [--data-file <data.json>]`
- render:`docx-cli render <input.docx> --output <output.docx> (--data-file <data.json> | --data-url <url> [--method 
  GET | --method POST --body <json>])` TO `dwss-convertor-cli render <input.docx> --output <output.docx> (--data-file <data.json> | --data-url 
  <url> [--method GET | --method POST --body <json>])`
