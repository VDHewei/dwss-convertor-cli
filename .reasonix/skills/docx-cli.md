---
name: docx-cli
description: 使用 docx-convertor-cli 命令行工具对 docx 模板中的 docx-模板语法（dwss 项目）进行聊天/检查/修复/渲染{chat/check/fix/render}
dependencies:
  markdown:
    - path: function_usage.md
      purpose: DWSS DOCX 模板函数与数据辅助工具说明
---
# DOCX 模板 命令行

## Render URL 请求参数

使用 `--data-url` 渲染时，可通过 JSON 对象传入可选的 `--query` 与 `--header`：

```text
dwss-convertor-cli render <input.docx> --output <output.docx> (--data-file <data.json> | --data-url <url> [--query <json>] [--header <json>] [--method GET | --method POST --body <json>])

dwss-convertor-cli render template.docx --output rendered.docx \
  --data-url "https://api.example.test/forms" \
  --query '{"projectId":42,"tag":["urgent","docx"]}' \
  --header '{"authorization":"Bearer token","x-request-id":"request-1"}'
```

- `--query <json>` 将标量或标量数组合并到 URL 查询串；同名参数会替换 URL 中已有值。
- `--header <json>` 添加请求 Header；值可为字符串、数字、布尔值或 `null`。
- POST 仍须同时提供 `--method POST --body <json>`。调用方显式提供的 `content-type` 会被保留；否则 POST 默认使用 `application/json`。
- `--method`、`--body`、`--query`、`--header` 仅可配合 `--data-url`，不能与 `--data-file` 一同使用。

## `chat` 子命令：函数与工具问答

**强制路由：**调用 `/docx-cli chat <问题>` 时，只能使用本 `docx-cli` Skill。**不得**调用 Graphify 或任何其他 Skill，也不得查询代码图谱。

通过 `chat` 查询 `function_usage.md` 记录的 Js-Context、`FormDataBuilder`、数据代理、togglebutton 清单、特殊文本和 DOCX 字体工具：

```text
/docx-cli chat renderDatetime
/docx-cli chat "如何用 builder 读取 checklist？"
/docx-cli chat "deobfuscateDocxFont 的输入和返回值是什么？"
```

Chat命令处理规则：

1. **首个动作：**回答前必须完整读取 `skills/docx-cli/function_usage.md`；它是每次 `chat` 回答的首要依据。
2. 对 CLI 已提供函数，说明名称、用途、参数、返回值、模板示例和数据前置条件。
3. 对服务端专用函数，明确其不能用于 CLI 的原因，并提供文档中的 CLI 替代方案，例如 `builder.getCheckListSections()`。
4. 遇到“当前有哪些函数”“所有函数”或同义的列表请求时，必须列出 `function_usage.md` 中的全部函数，并按 Js-Context、`FormDataBuilder`、清单/特殊文本工具、DOCX 字体工具分组；服务端专用函数须单独标记。
5. 问题含糊时，只询问一个必要的澄清问题；不得虚构未记录的函数、参数或业务映射。
6. `chat` 是 Skill 的对话入口，不是 `dwss-convertor-cli` 可执行程序的运行时命令；不得修改模板、发起网络请求或写入文件。

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
