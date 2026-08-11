# DOCX 模板函数使用详解

本文说明项目提供的 `FormDataBuilder`、Js-Context 函数及 `docx-templates` 语法。渲染数据中的顶层 `formData` 会自动合并到根对象；`builder`、`helper`、`filter` 是同一个 `FormDataBuilder` 实例。

## 函数汇总表

| 函数 | 分类 | 项目功能 | 一句话说明 |
| --- | --- | --- | --- |
| `getCheckListSections` | Builder | 可用 | 解析 togglebutton 清单及其可达问题。 |
| `getCheckListSectionsWithCache` | Builder | 可用 | 按列配置缓存清单解析结果。 |
| `summarySectionItems` | Builder | 可用 | 汇总清单项目中字段的匹配数量。 |
| `summarySectionItemsWithOptions` | Builder | 可用 | 取得缓存清单后进行汇总。 |
| `getCellValueMap` | Builder | 可用 | 建立 `cellId -> 回答单元格` 映射。 |
| `getCellInfoMap` | Builder | 可用 | 建立 `cellId -> 模板单元格` 映射。 |
| `getQuestionMetadata` | Builder | 可用 | 取得问题编号、标题及答案类型元数据。 |
| `getFollowupSections` | Builder | 可用 | 汇总 Observation 与 Followup 行。 |
| `getRemarkSections` | Builder | 可用 | 汇总 Remarks 行。 |
| `chunk` | Js-Context | 可用 | 将数组分割为固定大小的分组。 |
| `ensureArray` | Js-Context | 可用 | 将单值规范为数组。 |
| `intersection` | Js-Context | 可用 | 返回两个数组的交集。 |
| `isArray` | Js-Context | 可用 | 判断值是否为数组。 |
| `uniq` | Js-Context | 可用 | 去除数组中重复值。 |
| `get` | Js-Context | 可用 | 读取对象路径中的值。 |
| `firstChar` | Js-Context | 可用 | 取得字符串首字符。 |
| `newLInes` | Js-Context | 可用 | 将换行符规范为 `\n`。 |
| `numberToLetter` | Js-Context | 可用 | 将正整数转为 Excel 风格字母序号。 |
| `renderObjectField` | Js-Context | 可用 | 安全读取对象字段。 |
| `renderDatetime` | Js-Context | 可用 | 以香港时区输出默认日期时间格式。 |
| `renderDatetimes` | Js-Context | 可用 | 格式化一个或多个日期并以换行连接。 |
| `renderHongKongDateTime` | Js-Context | 可用 | 以指定格式输出香港时区日期时间。 |
| `renderFormatTime` | Js-Context | 可用 | `renderHongKongDateTime` 的格式化入口。 |
| `renderTime` | Js-Context | 可用 | 按内置日期类型输出日期时间。 |
| `renderAnswerCellValue` | Js-Context | 可用 | 以模板单元格代码读取回答值或附件。 |
| `renderAnswerRows` | Js-Context | 可用 | 取得指定单元格所属问题的有效回答行。 |
| `renderQuestion` | Js-Context | 可用 | 取得问题代码、描述和名称。 |
| `renderFormNo` | Js-Context | 可用 | 输出表单编号，可去除版本段。 |
| `renderFormAction` | Js-Context | 可用 | 从审批历史中提取动作人和时间。 |
| `renderImage` | Js-Context | 可用 | 生成 `IMAGE` 命令所需的图片载荷。 |
| `renderAttachmentImage` | Js-Context | 可用 | 从附件对象生成图片载荷。 |
| `createOptions` | Js-Context | 可用 | 创建完全自定义的清单列配置。 |
| `appendOptions` | Js-Context | 可用 | 在默认清单列后附加自定义列。 |
| `textParse` | Js-Context | 可用 | 拆分含 `<w:br>` 标记的特殊文本。 |
| `chooseBreak` | Js-Context | 可用 | 选择有效的换行数量或回退值。 |

## 数据前提与模板语法

### 渲染数据

清单与回答函数需要 `template.sections[].questions[].cells[]` 和 `answers[].rows[].cells[]`。回答单元格可直接设置 `answerVal`；选择题可设置 `answerId`，函数会在模板单元格的 `answerGroup.generalOptions[].id` 中查找并返回对应 `name`。文件列使用 `attachments`。

```json
{
  "formData": {
    "formNo": "CIC/01/2026/V1",
    "template": { "sections": [] },
    "answers": []
  }
}
```

### 基本命令

模板命令以 `+++` 包围，表达式为 JavaScript。命令和函数名均区分大小写。

| 语法 | 用途 | 示例 |
| --- | --- | --- |
| `+++INS expression+++` | 插入表达式结果。 | `+++INS renderDatetime(formDate)+++` |
| `+++FOR item IN expression+++` | 遍历数组或可迭代值。 | `+++FOR item IN items+++` |
| `+++END-FOR item+++` | 结束对应的循环。 | `+++END-FOR item+++` |
| `+++IF expression+++` | 条件输出。 | `+++IF photos.length > 0+++` |
| `+++END-IF+++` | 结束条件块。 | `+++END-IF+++` |
| `+++EXEC statement+++` | 执行赋值等 JavaScript 语句。 | `+++EXEC options = appendOptions([...])+++` |
| `+++IMAGE expression+++` | 插入图片载荷。 | `+++IMAGE renderAttachmentImage(photo)+++` |
| `+++ALIAS ...+++`、`+++HTML ...+++`、`+++LINK ...+++`、`+++QUERY ...+++` | `docx-templates` 支持的高级命令。 | 使用前应以实际模板和数据验证。 |

循环示例：

```text
+++++FOR section IN builder.getCheckListSections()+++
+++++INS section.sectionName+++
+++++FOR item IN section.items+++
+++++INS item.questionDesc+++：+++INS item.toggleName+++
+++++END-FOR item+++
+++++END-FOR section+++
```

使用前执行 `dwss-convertor-cli check <input.docx>`。未知函数会触发交互式确认，不能通过数据或模板绕过。

## FormDataBuilder

### `builder.getCheckListSections(options?)`

**功能：** 从每个 `answerType: "togglebutton"` 单元格开始，沿 `flows[].nextQuestionId` 与 `triggeredByCells[].cellId` 找出可达问题；再按照列标签与 `cellDesc`/`cellCode` 的 token 相似度提取动态列。

**参数：** `options` 可省略。其字段为：`targetColumns`（列定义数组）、`matchThreshold`（0 至 1 的匹配阈值，默认 `0.3`）、`filterEmptyDesc`（是否剔除无问题描述的项目）和 `cacheKey`（缓存键）。每个列定义为 `{ key, label, answerTypes, type?, legacyItemKey? }`；`type` 为 `list` 时返回数组，否则返回首个字符串值。

**示例：**

```text
+++++FOR section IN builder.getCheckListSections()+++
+++++FOR item IN section.items+++
+++++INS item.questionDesc+++ / +++INS item.dueDate+++
+++++END-FOR item+++
+++++END-FOR section+++
```

**返回结果：** 章节数组。每项有 `sectionId`、`sectionName`、`sectionNo`、`items`、`summaryItems()`；项目默认包含 `questionDesc`、`questionName`、`toggleCellDesc`、`toggleName`、`dueDate`、`completionDate`、`rectificationStatus`。日期和状态的列表转换为文本时以换行连接。

### `builder.getCheckListSectionsWithCache(options?)`

**功能：** 与 `getCheckListSections` 相同，但按 `options.cacheKey` 或列定义缓存结果，适合在同一模板重复统计。

**参数：** `options` 同 `getCheckListSections`；省略时使用默认列。

**示例：** `+++EXEC sections = builder.getCheckListSectionsWithCache(options)+++`

**返回结果：** 清单章节数组；同一 Builder 和同一缓存键会返回同一份缓存结果。

### `builder.summarySectionItems(sections, value, key?)`

**功能：** 统计所有章节项目中某字段等于指定值的数量。

**参数：** `sections` 为清单章节数组；`value` 是目标值；`key` 是项目字段名，默认 `toggleName`。

**示例：** `+++INS builder.summarySectionItems(sections, 'Complied')+++`

**返回结果：** 匹配项目的整数数量。

### `builder.summarySectionItemsWithOptions(value, key?, options?)`

**功能：** 使用指定配置取得缓存清单，再执行汇总。

**参数：** `value` 为目标值；`key` 默认 `toggleName`；`options` 同清单配置。

**示例：** `+++INS builder.summarySectionItemsWithOptions('Complete', 'rectificationStatus', options)+++`

**返回结果：** 匹配项目的整数数量。

### `builder.getCellValueMap()`

**功能：** 按回答单元格的 `cellId` 建立索引。

**参数：** 无。

**示例：** `+++EXEC answerCell = builder.getCellValueMap().get('cell-001')+++`

**返回结果：** `Map<string, object>`；值是 `answers[].rows[].cells[]` 中最后出现的对应回答单元格，未命中时为 `undefined`。

### `builder.getCellInfoMap()`

**功能：** 按模板单元格的 `id` 建立索引。

**参数：** 无。

**示例：** `+++INS builder.getCellInfoMap().get('cell-001').cellDesc+++`

**返回结果：** `Map<string, object>`；值是 `template.sections[].questions[].cells[]` 中对应的模板单元格。

### `builder.getQuestionMetadata(answerTypes?)`

**功能：** 输出问题的章节顺序、显示编号、标题和答案类型。优先采用回答的 `customQuestionDesc` 与 `customQuestionCode`。

**参数：** `answerTypes` 是可选答案类型数组，例如 `['file', 'textarea']`；匹配不区分大小写。

**示例：**

```text
+++++FOR question IN builder.getQuestionMetadata(['file'])+++
+++++INS question.sectionNo+++ +++INS question.questionText+++
+++++END-FOR question+++
```

**返回结果：** 元数据数组，每项含 `sectionIndex`、`sectionNo`、`sectionOrdering`、`questionId`、`questionIndex`、`questionCode`、`questionText`、`answerTypes`。

### `builder.getFollowupSections()`

**功能：** 按 checklist 工作流聚合问题描述以 `Observation` 和 `Followup` 结尾的回答；两者以回答行索引配对。

**参数：** 无。

**示例：**

```text
+++++FOR section IN builder.getFollowupSections()+++
+++++FOR question IN section.questions+++
+++++FOR row IN question.rows+++
+++++INS row.location+++ / +++INS row.finding+++ / +++INS row.action+++
+++++END-FOR row+++
+++++END-FOR question+++
+++++END-FOR section+++
```

**返回结果：** `[{ sectionNo, questions }]`。问题有 `sectionNo`、`description`、`value` 和 `rows`；行包含 `location`、`finding`、`action`、`actionBy`、`completionForAgreedDueDate`、`completionDate`、`rectificationStatus`、`observationPhotos`、`followupPhotos`。

### `builder.getRemarkSections()`

**功能：** 按 checklist 工作流聚合问题描述以 `Remark` 或 `Remarks` 结尾的回答，不与其他问题角色配对。

**参数：** 无。

**示例：** `+++FOR row IN builder.getRemarkSections()[0].questions[0].rows++++++INS row.description++++++END-FOR row+++`

**返回结果：** `[{ sectionNo, questions }]`；每个问题有 `sectionNo`、`description`、`value`；每行有 `location`、`description`、`photos`。

## Js-Context 函数

### 集合和对象

| 函数 | 参数与功能 | 示例 | 返回结果 |
| --- | --- | --- | --- |
| `chunk(items, size)` | `items` 为数组，`size` 为每组数量。 | `+++FOR group IN chunk(items, 3)+++` | 二维数组；空数组返回 `[]`。 |
| `ensureArray(value)` | 接收单值、数组、`null`、`undefined` 或空字符串。 | `+++FOR row IN ensureArray(renderAnswerRows(template, answers, 'PHOTO'))+++` | 数组；空值和 `''` 返回 `[]`。 |
| `intersection(left, right)` | 两个数组取交集，按 `left` 的顺序保留。 | `+++INS intersection(tags, ['A', 'B']).join(', ')+++` | 交集数组，可保留 `left` 中重复项。 |
| `isArray(value)` | 判断是否为 JavaScript 数组。 | `+++IF isArray(photos)+++` | 布尔值。 |
| `uniq(items)` | 用 SameValueZero 规则去重。 | `+++INS uniq(names).join(', ')+++` | 保留首次出现顺序的新数组。 |
| `get(value, path, fallback?)` | `path` 支持 `a.b`、`items[0].name`；默认回退为 `''`。 | `+++INS get(user, 'phone.phoneNo', '-')+++` | 路径值；不存在或值为 `undefined` 时为回退值。 |
| `renderObjectField(field, key, fallback?)` | `get` 的对象字段入口。 | `+++INS renderObjectField(user, 'items[0].name', '-')+++` | 路径值或回退值。 |

### 文本和序号

| 函数 | 参数与功能 | 示例 | 返回结果 |
| --- | --- | --- | --- |
| `firstChar(value)` | 读取字符串首字符；空值安全。 | `+++INS firstChar(section.sectionNo)+++` | 首字符或 `''`。 |
| `newLInes(value)` | 将 `\r\n` 和 `\n` 统一为 `\n`。 | `+++INS newLInes(note)+++` | 规范化后的文本；空值为 `''`。 |
| `numberToLetter(value)` | 将从 1 开始的整数转字母。 | `+++INS numberToLetter(index + 1)+++` | `1 -> A`、`26 -> Z`、`27 -> AA`；非正整数或非整数为 `''`。 |
| `textParse(value, breaker?)` | 以 `breaker`（默认 `<w:br>`）切分特殊文本。 | `+++EXEC parsed = textParse(note)+++` | `{ text, breaker? }`；`breaker` 是首段后的剩余段数。 |
| `chooseBreak(value?, fallback?)` | 选择正数换行数量，否则使用回退值。 | `+++INS chooseBreak(parsed.breaker, 1)+++` | `value > 0` 时返回 `value`，否则返回 `fallback`。 |

`textParse('first<w:br>second<w:br>third')` 的结果为 `{ text: 'first', breaker: 2 }`。

### 日期和时间

所有日期函数接受 ISO 字符串、时间戳、`Date`、`null` 或 `undefined`，均按 `Asia/Hong_Kong` 输出；无效日期、空值和不大于 Unix epoch 的日期均返回空字符串。

| 函数 | 参数与功能 | 示例 | 返回结果 |
| --- | --- | --- | --- |
| `renderDatetime(value)` | 使用默认格式 `d MMMM yyyy, HH:mm`。 | `+++INS renderDatetime(formDate)+++` | 例如 `30 June 2026, 08:40`。 |
| `renderDatetimes(values)` | 接收单个日期或日期数组。 | `+++INS renderDatetimes(dueDates)+++` | 每个有效日期格式化后以 `\n` 连接。 |
| `renderHongKongDateTime(value, format?)` | 使用自定义格式。 | `+++INS renderHongKongDateTime(date, 'yyyy-MM-dd HH:mm')+++` | 支持 `yyyy`、`MMMM`、`MMM`、`MM`、`dd`、`d`、`HH`、`mm`、`ss`、`EEEE`。 |
| `renderFormatTime(value, format)` | 自定义格式的别名入口。 | `+++INS renderFormatTime(date, 'yyyy-MM-dd')+++` | 指定格式的字符串。 |
| `renderTime(value, type)` | 使用内置类型。 | `+++INS renderTime(date, 'weekday')+++` | `timerange`/`time`=`HH:mm`，`datetime2`=`yyyy-MM-dd, HH:mm`，`datetimerange`=`yyyy-MM-dd HH:mm`，`daterange`/`date`=`yyyy-MM-dd`，`weekday`、`month`、`year`、`monthSlash`、`monthYear`；未知类型为 `d MMMM yyyy`。 |

### 回答、问题和表单

| 函数 | 参数与功能 | 示例 | 返回结果 |
| --- | --- | --- | --- |
| `renderAnswerCellValue(template, answers, cellCode, joiner?, index?, questionCode?, sectionOrdering?, optionKey?)` | 用 `cellCode` 或导出代码定位模板单元格，再取对应问题的第 `index` 行；选择题按 `optionKey`（默认 `name`）读取选项。可用 `questionCode`、`sectionOrdering` 消除重名代码。 | `+++INS renderAnswerCellValue(template, answers, 'CELL_1', ', ')+++` | 文本值、附件数组或空值。找不到一般字段为 `''`；名称含 `_upload`、`_photo`、`_image`、`_attachment`、`_file`、`_video` 的代码找不到时为 `[]`。 |
| `renderAnswerRows(template, answers, cellCode, questionCode?, sectionOrdering?)` | 定位单元格所属问题，并返回其回答行。 | `+++FOR row IN renderAnswerRows(template, answers, 'PHOTO')+++` | `status !== false` 的行数组；未命中为 `[]`。 |
| `renderQuestion(template, answers, formStatusIdentifier, cellCode, questionCode?, sectionOrdering?)` | 根据单元格定位问题；`formStatusIdentifier` 为兼容参数，当前实现不参与定位。 | `+++EXEC question = renderQuestion(template, answers, formStatusIdentifier, 'CELL_1')+++` | `{ code, description, name }`；优先使用回答中的自定义代码和描述。 |
| `renderFormNo(formNo, withoutVersion?)` | 输出表单编号。 | `+++INS renderFormNo(formNo, true)+++` | 有值时原编号；`withoutVersion=true` 时保留前 3 个 `/` 分段；无值时为 `'/'`。 |
| `renderFormAction(histories, users, formStatuses, statusCodes)` | 在倒序审批历史中查找状态代码匹配的最新动作，并关联用户。 | `+++EXEC approval = renderFormAction(histories, users, formStatuses, ['APPROVED'])+++` | `{ actionByName, actionByDesignation, actionByLabel, actionByPhone, actionDateTime, actionDate, actionTime, actionSignatureBase64 }`；无匹配时所有字段为空字符串。 |

### 图片和清单配置

| 函数 | 参数与功能 | 示例 | 返回结果 |
| --- | --- | --- | --- |
| `renderImage(source, options?)` | `source` 可为 `data:image/...;base64,...`、HTTP(S) URL 或含 `base64`/`data`/`fileUrl` 的对象；`options.scale` 可为像素数或 `{ width?, height?, ratio? }`。 | `+++IMAGE renderImage(logo, { scale: 120 })+++` | Promise 图片载荷 `{ data, extension, width, height }`；尺寸由像素换算为厘米。 |
| `renderAttachmentImage(source, options?)` | 与 `renderImage` 相同，名称表达附件用途。 | `+++IMAGE renderAttachmentImage(signature, { scale: { width: 120 } })+++` | 同 `renderImage`。空图片生成透明占位图片；不能读取的非内联附件会报错。 |
| `createOptions(targetColumns, matchThreshold?, cacheKey?)` | 创建只含 `targetColumns` 的清单配置。 | `+++EXEC options = createOptions([{ key: 'remarks', label: 'Remarks', answerTypes: ['text'], type: 'list' }])+++` | `AnalyzeOptions`。默认阈值为 `0.3`。 |
| `appendOptions(items, matchThreshold?, cacheKey?)` | 在 `defaultColumns` 后追加列。 | `+++EXEC options = appendOptions([{ key: 'photos', label: 'Photo Upload', answerTypes: ['file'], type: 'list' }])+++` | `AnalyzeOptions`，包含默认列和新列。 |

`defaultColumns` 可直接读取，默认列为 `due_date`、`completion_date`、`rectification_status`；`MATCH_THRESHOLD` 是默认阈值 `0.3`。
