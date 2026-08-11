# DOCX Template Function Reference

This document describes the project's `FormDataBuilder`, Js-Context functions, and `docx-templates` syntax. A top-level `formData` object in the render data is merged into the root object. `builder`, `helper`, and `filter` reference the same `FormDataBuilder` instance.

## Function Summary

| Function | Category | Project Function | Summary |
| --- | --- | --- | --- |
| `getCheckListSections` | Builder | Available | Parses togglebutton checklists and their reachable questions. |
| `getCheckListSectionsWithCache` | Builder | Available | Caches checklist results by column configuration. |
| `summarySectionItems` | Builder | Available | Counts matching fields in checklist items. |
| `summarySectionItemsWithOptions` | Builder | Available | Retrieves cached checklist data and then counts matches. |
| `getCellValueMap` | Builder | Available | Creates a `cellId -> answer cell` mapping. |
| `getCellInfoMap` | Builder | Available | Creates a `cellId -> template cell` mapping. |
| `getQuestionMetadata` | Builder | Available | Returns question number, title, and answer-type metadata. |
| `getFollowupSections` | Builder | Available | Aggregates Observation and Followup rows. |
| `getRemarkSections` | Builder | Available | Aggregates Remarks rows. |
| `chunk` | Js-Context | Available | Splits an array into fixed-size groups. |
| `ensureArray` | Js-Context | Available | Normalizes a single value to an array. |
| `intersection` | Js-Context | Available | Returns the intersection of two arrays. |
| `isArray` | Js-Context | Available | Determines whether a value is an array. |
| `uniq` | Js-Context | Available | Removes duplicate values from an array. |
| `get` | Js-Context | Available | Reads a value from an object path. |
| `firstChar` | Js-Context | Available | Returns the first character of a string. |
| `newLInes` | Js-Context | Available | Normalizes line endings to `\n`. |
| `numberToLetter` | Js-Context | Available | Converts a positive integer to an Excel-style letter index. |
| `renderObjectField` | Js-Context | Available | Safely reads an object field. |
| `renderDatetime` | Js-Context | Available | Renders the default date-time format in Hong Kong time. |
| `renderDatetimes` | Js-Context | Available | Formats one or more dates and joins them with line breaks. |
| `renderHongKongDateTime` | Js-Context | Available | Renders a Hong Kong date-time using a custom format. |
| `renderFormatTime` | Js-Context | Available | Custom-format entry point for `renderHongKongDateTime`. |
| `renderTime` | Js-Context | Available | Renders a date-time using a named built-in format. |
| `renderAnswerCellValue` | Js-Context | Available | Reads an answer value or attachments by template cell code. |
| `renderAnswerRows` | Js-Context | Available | Returns active answer rows for the question containing a cell. |
| `renderQuestion` | Js-Context | Available | Returns a question code, description, and name. |
| `renderFormNo` | Js-Context | Available | Renders a form number, optionally without the version part. |
| `renderFormAction` | Js-Context | Available | Extracts actor and time information from action history. |
| `renderImage` | Js-Context | Available | Creates an image payload for the `IMAGE` command. |
| `renderAttachmentImage` | Js-Context | Available | Creates an image payload from an attachment object. |
| `createOptions` | Js-Context | Available | Creates a fully custom checklist column configuration. |
| `appendOptions` | Js-Context | Available | Appends custom columns to the default checklist columns. |
| `textParse` | Js-Context | Available | Splits special text containing `<w:br>` markers. |
| `chooseBreak` | Js-Context | Available | Selects a valid line-break count or a fallback value. |

## Data Prerequisites and Template Syntax

### Render Data

Checklist and answer functions require `template.sections[].questions[].cells[]` and `answers[].rows[].cells[]`. An answer cell can provide a value through `answerVal`; a selection can provide `answerId`, which is resolved against `answerGroup.generalOptions[].id` in the template cell and returns the corresponding `name`. File columns use `attachments`.

```json
{
  "formData": {
    "formNo": "CIC/01/2026/V1",
    "template": { "sections": [] },
    "answers": []
  }
}
```

### Basic Commands

Template commands are enclosed in `+++`; expressions are JavaScript. Commands and function names are case-sensitive.

| Syntax | Purpose | Example |
| --- | --- | --- |
| `+++INS expression+++` | Inserts the expression result. | `+++INS renderDatetime(formDate)+++` |
| `+++FOR item IN expression+++` | Iterates an array or iterable. | `+++FOR item IN items+++` |
| `+++END-FOR item+++` | Ends the matching loop. | `+++END-FOR item+++` |
| `+++IF expression+++` | Conditionally emits content. | `+++IF photos.length > 0+++` |
| `+++END-IF+++` | Ends a conditional block. | `+++END-IF+++` |
| `+++EXEC statement+++` | Runs a JavaScript statement, such as an assignment. | `+++EXEC options = appendOptions([...])+++` |
| `+++IMAGE expression+++` | Inserts an image payload. | `+++IMAGE renderAttachmentImage(photo)+++` |
| `+++ALIAS ...+++`, `+++HTML ...+++`, `+++LINK ...+++`, `+++QUERY ...+++` | Advanced `docx-templates` commands. | Validate them against the actual template and data before use. |

Loop example:

```text
++++FOR section IN builder.getCheckListSections()+++
++++INS section.sectionName+++
++++FOR item IN section.items+++
++++INS item.questionDesc+++: +++INS item.toggleName+++
++++END-FOR item+++
++++END-FOR section+++
```

Run `dwss-convertor-cli check <input.docx>` before use. An unknown function requires interactive confirmation and cannot be bypassed by template data or syntax.

## FormDataBuilder

### `builder.getCheckListSections(options?)`

**Purpose:** Starts with each `answerType: "togglebutton"` cell, follows `flows[].nextQuestionId` and `triggeredByCells[].cellId` to find reachable questions, then extracts dynamic columns by token similarity between the column label and `cellDesc` or `cellCode`.

**Parameters:** `options` is optional. It accepts `targetColumns` (column definitions), `matchThreshold` (a 0--1 matching threshold; default `0.3`), `filterEmptyDesc` (whether to omit items without a question description), and `cacheKey` (a cache key). Each column definition is `{ key, label, answerTypes, type?, legacyItemKey? }`. A column with `type: 'list'` returns an array; otherwise it returns the first string value.

**Example:**

```text
++++FOR section IN builder.getCheckListSections()+++
++++FOR item IN section.items+++
++++INS item.questionDesc+++ / +++INS item.dueDate+++
++++END-FOR item+++
++++END-FOR section+++
```

**Return value:** An array of sections. Each section has `sectionId`, `sectionName`, `sectionNo`, `items`, and `summaryItems()`. By default, each item includes `questionDesc`, `questionName`, `toggleCellDesc`, `toggleName`, `dueDate`, `completionDate`, and `rectificationStatus`. Date and status lists stringify as newline-separated text.

### `builder.getCheckListSectionsWithCache(options?)`

**Purpose:** Equivalent to `getCheckListSections`, but caches the result by `options.cacheKey` or the column definition. It is useful when a template repeatedly queries the same checklist.

**Parameters:** `options` is the same as for `getCheckListSections`; omitting it uses the default columns.

**Example:** `+++EXEC sections = builder.getCheckListSectionsWithCache(options)+++`

**Return value:** A checklist-section array. The same Builder and cache key return the same cached result.

### `builder.summarySectionItems(sections, value, key?)`

**Purpose:** Counts items across all checklist sections whose specified field equals a value.

**Parameters:** `sections` is a checklist-section array; `value` is the target value; `key` is the item field name and defaults to `toggleName`.

**Example:** `+++INS builder.summarySectionItems(sections, 'Complied')+++`

**Return value:** An integer count of matching items.

### `builder.summarySectionItemsWithOptions(value, key?, options?)`

**Purpose:** Retrieves checklist data using the specified configuration and then counts matches.

**Parameters:** `value` is the target value; `key` defaults to `toggleName`; `options` is a checklist configuration.

**Example:** `+++INS builder.summarySectionItemsWithOptions('Complete', 'rectificationStatus', options)+++`

**Return value:** An integer count of matching items.

### `builder.getCellValueMap()`

**Purpose:** Builds an index keyed by answer-cell `cellId`.

**Parameters:** None.

**Example:** `+++EXEC answerCell = builder.getCellValueMap().get('cell-001')+++`

**Return value:** `Map<string, object>`. The value is the last matching answer cell in `answers[].rows[].cells[]`, or `undefined` when no cell matches.

### `builder.getCellInfoMap()`

**Purpose:** Builds an index keyed by template-cell `id`.

**Parameters:** None.

**Example:** `+++INS builder.getCellInfoMap().get('cell-001').cellDesc+++`

**Return value:** `Map<string, object>`. The value is the matching template cell in `template.sections[].questions[].cells[]`.

### `builder.getQuestionMetadata(answerTypes?)`

**Purpose:** Returns section ordering, display number, title, and answer-type metadata for each question. It prioritizes answer `customQuestionDesc` and `customQuestionCode`.

**Parameters:** `answerTypes` is an optional answer-type array, for example `['file', 'textarea']`; matching is case-insensitive.

**Example:**

```text
++++FOR question IN builder.getQuestionMetadata(['file'])+++
++++INS question.sectionNo+++ +++INS question.questionText+++
++++END-FOR question+++
```

**Return value:** An array of metadata entries containing `sectionIndex`, `sectionNo`, `sectionOrdering`, `questionId`, `questionIndex`, `questionCode`, `questionText`, and `answerTypes`.

### `builder.getFollowupSections()`

**Purpose:** Aggregates answers whose question descriptions end in `Observation` and `Followup` by checklist workflow. Observation and Followup rows are paired by answer-row index.

**Parameters:** None.

**Example:**

```text
++++FOR section IN builder.getFollowupSections()+++
++++FOR question IN section.questions+++
++++FOR row IN question.rows+++
++++INS row.location+++ / +++INS row.finding+++ / +++INS row.action+++
++++END-FOR row+++
++++END-FOR question+++
++++END-FOR section+++
```

**Return value:** `[{ sectionNo, questions }]`. Each question contains `sectionNo`, `description`, `value`, and `rows`. A row contains `location`, `finding`, `action`, `actionBy`, `completionForAgreedDueDate`, `completionDate`, `rectificationStatus`, `observationPhotos`, and `followupPhotos`.

### `builder.getRemarkSections()`

**Purpose:** Aggregates answers whose question descriptions end in `Remark` or `Remarks` by checklist workflow; they are not paired with another question role.

**Parameters:** None.

**Example:** `+++FOR row IN builder.getRemarkSections()[0].questions[0].rows++++++INS row.description++++++END-FOR row+++`

**Return value:** `[{ sectionNo, questions }]`. Each question contains `sectionNo`, `description`, and `value`; each row contains `location`, `description`, and `photos`.

## Js-Context Functions

### Collections and Objects

| Function | Parameters and Purpose | Example | Return Value |
| --- | --- | --- | --- |
| `chunk(items, size)` | `items` is an array; `size` is the number of items per group. | `+++FOR group IN chunk(items, 3)+++` | A two-dimensional array; an empty array returns `[]`. |
| `ensureArray(value)` | Accepts a single value, array, `null`, `undefined`, or empty string. | `+++FOR row IN ensureArray(renderAnswerRows(template, answers, 'PHOTO'))+++` | An array; empty values and `''` return `[]`. |
| `intersection(left, right)` | Returns values shared by two arrays, in `left` order. | `+++INS intersection(tags, ['A', 'B']).join(', ')+++` | An intersection array; duplicates in `left` are retained. |
| `isArray(value)` | Determines whether a value is a JavaScript array. | `+++IF isArray(photos)+++` | A boolean. |
| `uniq(items)` | Removes duplicates using SameValueZero equality. | `+++INS uniq(names).join(', ')+++` | A new array retaining first-occurrence order. |
| `get(value, path, fallback?)` | `path` supports `a.b` and `items[0].name`; the default fallback is `''`. | `+++INS get(user, 'phone.phoneNo', '-')+++` | The path value, or the fallback when missing or `undefined`. |
| `renderObjectField(field, key, fallback?)` | Object-field entry point for `get`. | `+++INS renderObjectField(user, 'items[0].name', '-')+++` | The path value or fallback. |

### Text and Numbering

| Function | Parameters and Purpose | Example | Return Value |
| --- | --- | --- | --- |
| `firstChar(value)` | Reads the first character of a string; empty values are safe. | `+++INS firstChar(section.sectionNo)+++` | The first character or `''`. |
| `newLInes(value)` | Normalizes `\r\n` and `\n` to `\n`. | `+++INS newLInes(note)+++` | Normalized text; empty values return `''`. |
| `numberToLetter(value)` | Converts a one-based integer to letters. | `+++INS numberToLetter(index + 1)+++` | `1 -> A`, `26 -> Z`, `27 -> AA`; a non-positive or non-integer value returns `''`. |
| `textParse(value, breaker?)` | Splits special text by `breaker`, which defaults to `<w:br>`. | `+++EXEC parsed = textParse(note)+++` | `{ text, breaker? }`; `breaker` is the number of segments remaining after the first. |
| `chooseBreak(value?, fallback?)` | Chooses a positive line-break count, otherwise a fallback. | `+++INS chooseBreak(parsed.breaker, 1)+++` | `value` when `value > 0`, otherwise `fallback`. |

`textParse('first<w:br>second<w:br>third')` returns `{ text: 'first', breaker: 2 }`.

### Dates and Times

All date functions accept an ISO string, timestamp, `Date`, `null`, or `undefined`, and render in `Asia/Hong_Kong`. Invalid dates, empty values, and dates at or before the Unix epoch return an empty string.

| Function | Parameters and Purpose | Example | Return Value |
| --- | --- | --- | --- |
| `renderDatetime(value)` | Uses the default `d MMMM yyyy, HH:mm` format. | `+++INS renderDatetime(formDate)+++` | For example, `30 June 2026, 08:40`. |
| `renderDatetimes(values)` | Accepts one date or an array of dates. | `+++INS renderDatetimes(dueDates)+++` | Each valid date is formatted and joined with `\n`. |
| `renderHongKongDateTime(value, format?)` | Uses a custom format. | `+++INS renderHongKongDateTime(date, 'yyyy-MM-dd HH:mm')+++` | Supports `yyyy`, `MMMM`, `MMM`, `MM`, `dd`, `d`, `HH`, `mm`, `ss`, and `EEEE`. |
| `renderFormatTime(value, format)` | Alias entry point for a custom format. | `+++INS renderFormatTime(date, 'yyyy-MM-dd')+++` | A string in the requested format. |
| `renderTime(value, type)` | Uses a built-in named format. | `+++INS renderTime(date, 'weekday')+++` | `timerange` and `time`: `HH:mm`; `datetime2`: `yyyy-MM-dd, HH:mm`; `datetimerange`: `yyyy-MM-dd HH:mm`; `daterange` and `date`: `yyyy-MM-dd`; also `weekday`, `month`, `year`, `monthSlash`, and `monthYear`. An unknown type uses `d MMMM yyyy`. |

### Answers, Questions, and Forms

| Function | Parameters and Purpose | Example | Return Value |
| --- | --- | --- | --- |
| `renderAnswerCellValue(template, answers, cellCode, joiner?, index?, questionCode?, sectionOrdering?, optionKey?)` | Locates a template cell by `cellCode` or export code and reads its `index` row. Selections use `optionKey`, defaulting to `name`. Use `questionCode` and `sectionOrdering` to disambiguate repeated cell codes. | `+++INS renderAnswerCellValue(template, answers, 'CELL_1', ', ')+++` | A text value, attachment array, or empty value. An absent ordinary field returns `''`; an absent code containing `_upload`, `_photo`, `_image`, `_attachment`, `_file`, or `_video` returns `[]`. |
| `renderAnswerRows(template, answers, cellCode, questionCode?, sectionOrdering?)` | Locates the question containing a cell and returns its answer rows. | `+++FOR row IN renderAnswerRows(template, answers, 'PHOTO')+++` | An array of rows where `status !== false`; no match returns `[]`. |
| `renderQuestion(template, answers, formStatusIdentifier, cellCode, questionCode?, sectionOrdering?)` | Locates a question from its cell. `formStatusIdentifier` is retained for compatibility and is not used for lookup. | `+++EXEC question = renderQuestion(template, answers, formStatusIdentifier, 'CELL_1')+++` | `{ code, description, name }`; custom answer code and description take precedence. |
| `renderFormNo(formNo, withoutVersion?)` | Renders a form number. | `+++INS renderFormNo(formNo, true)+++` | The original form number when present. With `withoutVersion=true`, retains the first three `/`-separated parts. Missing values return `'/'`. |
| `renderFormAction(histories, users, formStatuses, statusCodes)` | Searches action history in reverse order for the latest matching status and associates its user. | `+++EXEC approval = renderFormAction(histories, users, formStatuses, ['APPROVED'])+++` | `{ actionByName, actionByDesignation, actionByLabel, actionByPhone, actionDateTime, actionDate, actionTime, actionSignatureBase64 }`; every field is an empty string when no action matches. |

### Images and Checklist Configuration

| Function | Parameters and Purpose | Example | Return Value |
| --- | --- | --- | --- |
| `renderImage(source, options?)` | `source` can be a `data:image/...;base64,...` value, an HTTP(S) URL, or an object with `base64`, `data`, or `fileUrl`. `options.scale` can be a pixel number or `{ width?, height?, ratio? }`. | `+++IMAGE renderImage(logo, { scale: 120 })+++` | A Promise image payload `{ data, extension, width, height }`; pixel dimensions are converted to centimetres. |
| `renderAttachmentImage(source, options?)` | Same behavior as `renderImage`, named to express attachment usage. | `+++IMAGE renderAttachmentImage(signature, { scale: { width: 120 } })+++` | Same as `renderImage`. An empty image becomes a transparent placeholder; an unreadable non-inline attachment produces an error. |
| `createOptions(targetColumns, matchThreshold?, cacheKey?)` | Creates a checklist configuration containing only `targetColumns`. | `+++EXEC options = createOptions([{ key: 'remarks', label: 'Remarks', answerTypes: ['text'], type: 'list' }])+++` | `AnalyzeOptions`; the default threshold is `0.3`. |
| `appendOptions(items, matchThreshold?, cacheKey?)` | Appends columns to `defaultColumns`. | `+++EXEC options = appendOptions([{ key: 'photos', label: 'Photo Upload', answerTypes: ['file'], type: 'list' }])+++` | `AnalyzeOptions` containing both default and appended columns. |

`defaultColumns` contains `due_date`, `completion_date`, and `rectification_status`. `MATCH_THRESHOLD` is the default threshold, `0.3`.
