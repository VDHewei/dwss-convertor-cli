# dwss-convertor-cli

独立的 Bun CLI 工具，用于安全的 DOCX 文本替换，`docx-templates` 检查/修复，以及 DOCX 渲染。

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

`check` 在出现语法、标记、命令或未注册函数错误时会以非零值退出。`fix` 会显示 DOCX 扫描进度、逐项的前后差异以及替换计数。它仅执行确定性修复，并且对于模糊的函数重命名需要交互式确认。

## 独立二进制构建

```powershell
bun run build:windows
bun run build:linux:x64
bun run build:linux:arm64
bun run build:macos:x64
bun run build:macos:arm64
bun run build:all
```

二进制输出写入到 `dist/` 目录中。

## 文本替换与搜索

单次替换保留 `replace <docx> <find> <replacement> --output ...`。批量替换使用 `--replacements-file`；每条非空行是一个映射：

```text
"old text" : "new text"
"a \"quoted\" value" : "a \\ path"
```

支持的转义字符包括 `\"`、`\\`、`\n`、`\r` 和 `\t`。重复或重叠的源文本会被拒绝。所有批量映射都会与原始可见的 DOCX 文本进行匹配。每个映射至少要匹配一次，否则命令会失败且不生成输出文件。

`find` 对可见的 Word 段落执行字面、区分大小写的匹配。它接受一个或多个位置查询，并且可选的 `--find-file <queries.txt>`（每条非空行是一个查询，查询在位置查询之后追加）。`--json <output.json>` 会将 UTF-8 JSON 写入文件；当 `--json` 不带路径时，会在终端输出美化后的 JSON：

```json
[{"find":"inspection","matches":["matching visible paragraph"]}]
```

查询将保留其提供的顺序。没有匹配结果的查询会成功返回一个空的 `matches` 数组和一个 `No matching lines.` 的终端信息。

对于相对文件服务图像路径，需在 `dwss-convertor-cli/.env` 中设置 `FILE_SERVICE_URL`。进程环境具有优先权；CLI 会回退到同级目录中的 `dwss-convertor-service/.env` 以确保与现有工作区的兼容性。

## 用户技能文件映射

| 源文件 | 目标 Agent               | 复制目录                         |
|---|------------------------|------------------------------|
| `skills/docx-cli/SKILL.md` | GitHub Copilot Agent | `.github/prompts/docx-cli.prompt.md` |
| `skills/docx-cli/SKILL.md` | Anthropic Claude Agent | `.claude/commands/docx-cli.md` |
| `skills/docx-cli/SKILL.md` | DeepSeek Agent         | `.reasonix/skills/docx-cli.md` |