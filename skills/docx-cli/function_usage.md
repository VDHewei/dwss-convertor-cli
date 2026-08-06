# DWSS DOCX 模板函数与数据辅助工具说明

## 1. 数据加载和代理层

`render` 从 `--data-file` 或 `--data-url` 读取 JSON 后，会自动合并顶层 `formData`（若存在），再调用 `loaderBuilder`。原始字段不会被修改；代理对象额外提供以下三个等价入口：

| 模板字段 | 用途 |
| --- | --- |
| `builder` | 表单清单、答案、附件和问题元数据工具 |
| `helper` | `builder` 的兼容别名 |
| `filter` | `builder` 的兼容别名 |

示例：

```text
+++FOR item IN builder.getCheckListSections()+++
++INS item.sectionName+++
++END-FOR item+++
```

数据建议包含 `template.sections[].questions[].cells[]` 与 `answers[].rows[].cells[]`。单元格可用 `answerVal` 直接给值，或以 `answerId` 配合 `answerGroup.generalOptions` 反查选项名称。

## 2. FormDataBuilder

| 函数 | 说明 |
| --- | --- |
| `getCheckListSections(options?)` | 解析含 `togglebutton` 的章节和可达的后续问题，返回章节、项目及动态列值。 |
| `getCheckListSectionsWithCache(options?)` | 按目标列配置缓存清单结果。 |
| `summarySectionItems(sections, value, key?)` | 统计章节项目中某字段的匹配数；默认字段是 `toggleName`。 |
| `summarySectionItemsWithOptions(value, key?, options?)` | 先计算（或读取缓存）清单，再统计。 |
| `getCellValueMap()` | 返回 `cellId -> 实际答案单元格` 的 Map。 |
| `getCellInfoMap()` | 返回 `cellId -> 模板单元格` 的 Map。 |
| `getQuestionMetadata(answerTypes?)` | 返回章节、问题编号、标题和答案类型元数据；可按答案类型过滤。 |
| `getPhotoRecords()` | 返回状态有效且扩展名为 PNG/JPG/JPEG 的附件记录。 |

### Togglebutton 清单逻辑

1. 从每个 `answerType: "togglebutton"` 单元格出发。
2. 通过 `flows[].nextQuestionId` 和目标问题的 `triggeredByCells[].cellId` 广度遍历后续问题。
3. 用目标列标签与可达单元格的 `cellDesc` / `cellCode` 的 Jaccard token 相似度匹配列。
4. 通过 `answerVal` 或 `answerId -> generalOptions[].name` 读取值；`file` 列返回附件列表。

默认列为 `due_date`、`completion_date` 和 `rectification_status`。默认阈值 `MATCH_THRESHOLD` 是 `0.3`。

可在模板表达式内创建配置：

```text
+++EXEC options = createOptions([
  { key: 'remarks', label: 'Remarks', answerTypes: ['text'], type: 'list' }
])+++
+++FOR section IN builder.getCheckListSections(options)+++
...
+++END-FOR section+++
```

`appendOptions(items, threshold?, cacheKey?)` 会在默认列基础上追加列；`defaultColumns` 和 `MATCH_THRESHOLD` 可直接读取。

## 3. Js-Context 函数

以下函数通过 `additionalJsContext` 提供给 `docx-templates`。函数均为通用数据操作，不包含 DWSS 服务端的状态、角色或表单分类映射。

| 分类 | 函数 | 说明 |
| --- | --- | --- |
| 数组/对象 | `chunk`、`ensureArray`、`intersection`、`isArray`、`uniq`、`get` | 分块、数组归一化、交集、去重与 `a[0].b` 路径读取。 |
| 文本 | `firstChar`、`newLInes`、`numberToLetter`、`renderObjectField` | 首字符、换行标准化、序号转 A/B/...、安全读取对象字段。 |
| 日期 | `renderDatetime`、`renderDatetimes`、`renderHongKongDateTime`、`renderFormatTime`、`renderTime` | 按 `Asia/Hong_Kong` 时区渲染；无效日期返回空字符串。`renderDatetimes` 用换行拼接数组结果。 |
| 答案 | `renderAnswerCellValue`、`renderAnswerRows`、`renderQuestion` | 以模板单元格定位回答值、有效行或问题元数据。 |
| 表单 | `renderFormNo`、`renderFormAction` | 格式化表单编号和通用审批历史信息。 |
| 图片 | `renderImage`、`renderAttachmentImage` | 处理 data URL 或文件服务 URL，返回 `docx-templates` 图片负载。 |
| 清单/特殊文本 | `createOptions`、`appendOptions`、`textParse`、`chooseBreak` | 配置清单动态列；拆分 `<w:br>` 特殊文本；选择有效换行数。 |

常见用法：

```text
+++INS renderDatetime(formDate)+++
+++FOR row IN ensureArray(renderAnswerRows(template, answers, 'PHOTO'))+++
...
+++END-FOR row+++
+++IMAGE renderAttachmentImage(signature, { scale: { width: 120 } })+++
```

### Convertor Service Js-Context 参考清单

以下是 `dwss-convertor-service-WEB-9072` 的 `additionalJsContext` 导出函数分类。CLI 已同步表中通用函数；标记为“服务端专用”的函数依赖服务端的表单状态、模板配置或关联表，不会在独立 CLI 中伪造业务结果。

| 模块 | 函数 | CLI 状态 |
| --- | --- | --- |
| `common` | `chunk`、`uniq`、`intersection`、`get`、`numberToLetter`、`ensureArray`、`isArray`、`newLInes`、`firstChar` | 已提供（`groupBy` 可由模板原生数据表达式替代）。 |
| `common` | `renderDatetime`、`renderDatetimes`、`renderFormatTime`、`renderHongKongDateTime`、`renderTime` | 已提供。 |
| `common` | `labelTokens`、`jaccard`、`lookupValueCompare`、`codeCompare`、`findCellByCode`、`parseStatusCode`、`statusCodeCompare`、`statusLookupCompare` | 服务端专用的模板/状态兼容逻辑。 |
| `renderQuestion` | `renderQuestion`、`idxToLetter`、`matchLetterIndex`、`getCellCodeByIndex`、`getQuestionCellCode`、`getSectionCellCodes`、`getSessions`、`getSessionName`、`getSessionQuestionList`、`getSessionQuestion`、`getSessionByIndex`、`renderSectionQuestionDesc`、`renderSingleQuestion` | `renderQuestion` 已提供；其余依赖服务端 DTO 的导航逻辑。 |
| `renderAnswer` | `determineRenderAnswers` | 服务端专用。CLI 使用 `renderAnswerCellValue`、`renderAnswerRows` 和 `builder`。 |
| `renderImage` | `renderImage`、`renderAttachmentImage` | 已提供。 |
| `renderObjectField` | `renderObjectField` | 已提供。 |
| `renderFormInfo` | `renderFormNo`、`renderFormVersion` | `renderFormNo` 已提供；版本解析由调用数据直接提供。 |
| `renderSection` | `renderSectionName`、`renderSection`、`renderSummary`、`renderAnswerCellValueMark`、`renderSummaryTotal` | 服务端专用的固定表单摘要逻辑；独立模板应使用 `builder.getCheckListSections()`。 |
| `helpers` | `renderFormAction`、`renderAnswerCellValue`、`renderAnswerRows`、`formStatusImage`、`saveFile` | 前三项已提供；状态签名和服务器文件写入不属于 CLI 渲染数据层。 |

## 4. DOCX 字体工具

`src/services/docx-font.ts` 提供 DOCX 字体配置读取工具，适用于调用方需要从模板或附件中提取字体时：

| 函数 | 说明 |
| --- | --- |
| `extractDocxFontConfig(docx)` | 读取 `styles.xml`、主题字体和嵌入字体。 |
| `parseDocxStylesFonts(xml)` | 解析文档默认运行字体。 |
| `parseDocxThemeFonts(xml)` | 解析主题的 major/minor 字体及脚本覆盖。 |
| `resolveDocxRunFonts(runFonts, themeFonts)` | 将直接字体和主题引用解析为实际字体名称。 |
| `resolveDocxScriptFont(themeFonts, themeRef, script)` | 读取指定脚本的主题字体覆盖。 |
| `extractDocxEmbeddedFonts(zip)` | 读取 `fontTable.xml` 中的嵌入字体。 |
| `deobfuscateDocxFont(buffer, guid)` | 还原使用 GUID 混淆的嵌入字体前 32 字节。 |
| `chooseEnglishDefaultFont(config)` | 优先返回嵌入的英文字体 Buffer，否则返回字体名称。 |

这些工具仅读取字体元数据和字体二进制数据；不会重建 DOCX runs、样式或关系。

## 5. 使用限制

- `render` 仍要求模板先通过 `check`。
- 未知模板函数仍会要求交互式确认，数据代理不会绕过此限制。
- `loaderBuilder` 只添加代理入口，不会发起网络请求或补全服务端业务数据。
- 数据函数对缺失的数组、答案和配置返回空结果，便于模板安全渲染。
