# API 参考

本文件由 `src/api-spec.js` 自动生成。不要手工修改。

所有操作接口都使用：

```http
/v1/api/<resource>/<action>
Authorization: Bearer <API_TOKEN>
```

## 路由总览

| 路由 | 方法 | 用途 |
|---|---|---|
| `index/errors/clear` | POST | 清空自动索引失败时保存在本地的最近错误记录。 |
| `files/create` | POST | 在 Vault 中创建一个新的 Markdown 文件。 |
| `files/read` | GET or POST | 从 Vault 中读取一个 Markdown 文件。为保护 1C2G 这类小 VPS，超大文件会被拒绝读取。 |
| `attachments/upload` | POST multipart/form-data | 上传一个二进制附件到配置的 Vault 附件目录，并返回扁平的可插入链接字段。 |
| `files/write` | POST | 用新内容覆盖一个 Markdown 文件。 |
| `files/append` | POST | 把内容追加到文件末尾。追加后文件超过服务端上限时会拒绝写入，避免后续整文件 patch 失效。 |
| `files/prepend` | POST | 把内容插入到文件开头。 |
| `files/delete` | DELETE or POST | 把文件移动到 Archive/Deleted，而不是永久删除。 |
| `files/list` | GET or POST | 列出 Vault 目录下的文件和子目录。 |
| `headings/read` | GET or POST | 读取 Markdown 指定 heading 下的段落内容。 |
| `headings/append` | POST | 把内容追加到指定 heading 段落的末尾。 |
| `headings/prepend` | POST | 把内容插入到指定 heading 的正下方。 |
| `headings/replace` | POST | 保留 heading 本身，替换其下方的全部段落内容。 |
| `headings/insert-after-last-matching-line` | POST | 在指定 heading 段落内，找到最后一条匹配正则的行，并把内容插到其下方。 |
| `frontmatter/get` | GET or POST | 读取一个 YAML frontmatter 字段。 |
| `frontmatter/set` | POST | 设置或创建一个 YAML frontmatter 字段。 |
| `frontmatter/append` | POST | 向 inline 数组形式的 frontmatter 字段追加值，默认写当天日记并在缺失时新建。 |
| `geo/convert` | GET or POST | 在 GCJ-02 与 WGS-84 之间转换坐标，方向始终显式指定。 |
| `daily/append-by-time` | POST | 根据配置的时区和时段选择 daily note heading，并把条目插到最后一条时间行之后。 |
| `daily/read` | GET or POST | 根据 Daily Note 配置解析路径并读取当天日记。 |
| `search/simple` | GET or POST | 用简单字符串包含匹配搜索 Markdown 文件。 |
| `search/semantic` | POST | 使用已构建的远程 embedding 索引进行语义相似搜索。 |
| `index/status` | GET or POST | 查看 embedding 配置是否就绪，以及当前索引包含多少文件和块。 |
| `index/rebuild` | POST | 扫描允许目录下的 Markdown 文件，调用远程 embedding API，增量构建本地索引。 |
| `index/file` | POST | 为单个 Markdown 文件重建 embedding 索引；文件不存在时会从索引中移除。 |
| `reviews/status` | GET or POST | 查看已配置的回顾任务、调度是否启用、下次运行时间和最近运行记录。 |
| `reviews/run` | POST | 立即运行一个已配置的回顾任务，使用周期内容、语义召回、配置的 AI 模型和任务输出路径。 |
| `tags/list` | GET | 统计允许目录下 Markdown hashtag 的出现次数。 |
| `batch` | POST | 在一个请求中执行多个 API 操作。 |
| `uri/execute` | POST | 解析 Obsidian URI，并执行其中可映射到 Vault 文件系统操作的部分。 |
| `unsupported/active` | GET or POST | 对桌面端专属的 active-file 行为返回明确的 unsupported 响应。 |
| `unsupported/commands` | GET or POST | 对桌面 Obsidian command 执行返回明确的 unsupported 响应。 |

## 短别名

| 短别名 | 标准路由 |
|---|---|
| `new` | `files/create` |
| `create` | `files/create` |
| `open` | `files/read` |
| `read` | `files/read` |
| `write` | `files/write` |
| `append` | `files/append` |
| `prepend` | `files/prepend` |
| `delete` | `files/delete` |
| `list` | `files/list` |
| `daily` | `daily/append-by-time` |
| `search` | `search/simple` |
| `semantic` | `search/semantic` |
| `tags` | `tags/list` |
| `reindex` | `index/rebuild` |
| `index` | `index/status` |
| `review` | `reviews/run` |
| `reviews` | `reviews/status` |
| `script` | `batch` |
| `uri` | `uri/execute` |
| `active` | `unsupported/active` |
| `commands` | `unsupported/commands` |

## index/errors/clear

**清空 embedding 错误记录**

清空自动索引失败时保存在本地的最近错误记录。

方法：`POST`

适用场景：

- 修复 embedding API Key 或 baseUrl 后，清理 Web UI 中显示的旧错误。
- 确认自动索引恢复后，重置错误状态。

示例：

```bash
curl -X POST http://localhost:8787/v1/api/index/errors/clear \
  -H "Authorization: Bearer change-me"
```

## files/create

**新建 Markdown 文件**

在 Vault 中创建一个新的 Markdown 文件。

方法：`POST`

适用场景：

- Coze 已经把灵感整理成一篇笔记，需要写入 Ideas。
- 采集管道把外部资料处理完，需要写入 Notes。
- 需要基于 Vault 里的模板创建笔记，并用请求中的 yaml 覆盖模板默认属性。
- 工作流需要在文件重名时自动追加后缀，避免覆盖。

参数：

| 参数 | 说明 |
|---|---|
| `path | filename | file | name` | Vault 相对路径。`files/create` 只创建 Markdown；没有扩展名会自动补 `.md`。如果没有包含允许的顶级目录，会自动放到 Inbox/ 下。 |
| `content | text` | Markdown 正文。 |
| `templatePath | template` | 可选的 Vault 内模板相对路径。先读取并应用模板，再合并 content。模板支持 `{{content}}`、`{{title}}`、`{{yyyy-MM-dd}}`、`{{HH:mm}}` 等变量。 |
| `yaml | frontmatter` | 可选对象。最后应用到 frontmatter，因此会覆盖模板中同名 YAML 属性。 |
| `ifExists` | 文件已存在时的策略：fail、overwrite、append_suffix。默认 fail。 |
| `idempotencyKey` | 可选的幂等键，用于防止重复写入。 |
| `script` | 可选的 URL 编码 JSON Vault Script，在主操作后执行。 |

示例：

```bash
curl -X POST http://localhost:8787/v1/api/files/create \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{
    "path": "Ideas/api-note.md",
    "templatePath": "Templates/idea.md",
    "content": "Hello",
    "yaml": {
      "status": "done",
      "source": "coze"
    },
    "ifExists": "append_suffix"
  }'
```

## files/read

**读取文件**

从 Vault 中读取一个 Markdown 文件。为保护 1C2G 这类小 VPS，超大文件会被拒绝读取。

方法：`GET or POST`

适用场景：

- 工作流需要先读取现有笔记，再决定如何更新。
- 调试时确认网关实际写入了什么内容。

参数：

| 参数 | 说明 |
|---|---|
| `path | filename | file | name` | 目标 Vault 相对路径。 |

示例：

```bash
curl "http://localhost:8787/v1/api/files/read?path=Ideas/api-note.md" \
  -H "Authorization: Bearer change-me"
```

## attachments/upload

**上传附件**

上传一个二进制附件到配置的 Vault 附件目录，并返回可直接插入正文的链接文本。

方法：`POST multipart/form-data`

适用场景：

- Apple 快捷指令上传图片、录音或视频后，把返回的 wiki 链接插入日记。
- Coze 把附件上传和 Markdown 写入分成两步，避免创建笔记接口变复杂。
- 工作流需要保存任意文件，例如图片、音频、视频、PDF、RAW 或压缩包。

参数：

| 参数 | 说明 |
|---|---|
| `file` | 必填的 multipart 文件字段。 |
| `type` | 可选附件类型：image、audio、video 或 file。不传时按 MIME 自动判断，无法判断则使用 file。 |
| `filename | name` | 可选文件名覆盖。文件名冲突时会自动追加数字后缀。 |
| `alt` | 可选 alt 文本，用于返回的 Markdown 图片样式链接。 |

示例：

```bash
curl -X POST http://localhost:8787/v1/api/attachments/upload \
  -H "Authorization: Bearer change-me" \
  -F "type=image" \
  -F "file=@/path/to/photo.png"
```

返回结果包含一级字段：

```json
{
  "ok": true,
  "route": "attachments/upload",
  "operation": "attachments/upload",
  "path": "Attachments/Images/photo.png",
  "wiki": "![[Attachments/Images/photo.png]]",
  "markdown": "![photo](<Attachments/Images/photo.png>)"
}
```

## files/write

**覆盖写入文件**

用新内容覆盖一个 Markdown 文件。

方法：`POST`

适用场景：

- 从上游权威数据重新生成一篇笔记。
- AI 清洗完成后，用整理结果替换临时 Inbox 笔记。

参数：

| 参数 | 说明 |
|---|---|
| `path | filename | file | name` | 目标 Vault 相对路径。 |
| `content | text` | 完整文件内容。 |

示例：

```bash
curl -X POST http://localhost:8787/v1/api/files/write \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{ "path": "Ideas/api-note.md", "content": "Full replacement" }'
```

## files/append

**追加到文件末尾**

把内容追加到文件末尾。追加后文件超过服务端上限时会拒绝写入，避免后续整文件 patch 失效。

方法：`POST`

适用场景：

- 把原始 capture 追加到 Inbox 日志。
- 把生成的参考资料列表追加到已有笔记。

参数：

| 参数 | 说明 |
|---|---|
| `path | filename | file | name` | 目标 Vault 相对路径。 |
| `content | text` | 要追加的内容。 |
| `idempotencyKey` | 可选的幂等键，用于防止重复写入。 |

示例：

```bash
curl -X POST http://localhost:8787/v1/api/files/append \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{ "path": "Inbox/2026-05-13.md", "content": "\n- New capture" }'
```

## files/prepend

**插入到文件开头**

把内容插入到文件开头。

方法：`POST`

适用场景：

- 在导入笔记顶部添加摘要块。
- 在笔记开头插入警告或处理状态。

参数：

| 参数 | 说明 |
|---|---|
| `path | filename | file | name` | 目标 Vault 相对路径。 |
| `content | text` | 要插入的内容。 |
| `idempotencyKey` | 可选的幂等键，用于防止重复写入。 |

示例：

```bash
curl -X POST http://localhost:8787/v1/api/files/prepend \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{ "path": "Ideas/api-note.md", "content": "> AI summary\n\n" }'
```

## files/delete

**软删除文件**

把文件移动到 Archive/Deleted，而不是永久删除。

方法：`DELETE or POST`

适用场景：

- 清理错误 capture，同时保留恢复路径。
- 安全归档过期的生成笔记。

参数：

| 参数 | 说明 |
|---|---|
| `path | filename | file | name` | 目标 Vault 相对路径。 |
| `idempotencyKey` | 可选的幂等键，用于防止重复写入。 |

示例：

```bash
curl -X DELETE "http://localhost:8787/v1/api/files/delete?path=Inbox/old.md" \
  -H "Authorization: Bearer change-me"
```

## files/list

**列出文件**

列出 Vault 目录下的文件和子目录。

方法：`GET or POST`

适用场景：

- 查看 Inbox 或 Ideas 下已经写入了哪些内容。
- 让自动化流程从目录中选择候选文件。

参数：

| 参数 | 说明 |
|---|---|
| `path` | 可选目录路径。为空时列出已存在的配置顶级目录。 |

示例：

```bash
curl "http://localhost:8787/v1/api/files/list?path=Ideas" \
  -H "Authorization: Bearer change-me"
```

## headings/read

**读取 Heading 段落**

读取 Markdown 指定 heading 下的段落内容。

方法：`GET or POST`

适用场景：

- 生成摘要前读取今天日记的“下午”段落。
- 读取项目笔记里的 Decisions 段落。

参数：

| 参数 | 说明 |
|---|---|
| `path | filename | file | name` | 目标 Markdown 文件。 |
| `heading` | 不带 # 的 heading 文本。 |
| `headingLevel` | 可选 heading 级别。默认 2。 |

示例：

```bash
curl "http://localhost:8787/v1/api/headings/read?path=Daily/2026-05-13.md&heading=下午" \
  -H "Authorization: Bearer change-me"
```

## headings/append

**追加到 Heading 段落末尾**

把内容追加到指定 heading 段落的末尾。

方法：`POST`

适用场景：

- 给项目日志段落追加一行。
- 把处理后的 capture 追加到笔记的指定段落。

参数：

| 参数 | 说明 |
|---|---|
| `path | filename | file | name` | 目标 Markdown 文件。 |
| `heading` | 不带 # 的 heading 文本。 |
| `headingLevel` | 可选 heading 级别。默认 2。 |
| `content | text` | 要追加的内容。 |
| `ifHeadingMissing` | heading 不存在时的行为：create 或 error。默认 create。 |

示例：

```bash
curl -X POST http://localhost:8787/v1/api/headings/append \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{ "path": "Daily/2026-05-13.md", "heading": "下午", "content": "[16:21] New item" }'
```

## headings/prepend

**插入到 Heading 段落开头**

把内容插入到指定 heading 的正下方。

方法：`POST`

适用场景：

- 把摘要放在某个段落最前面。
- 把新的高优先级行动项放到旧条目前面。

参数：

| 参数 | 说明 |
|---|---|
| `path | filename | file | name` | 目标 Markdown 文件。 |
| `heading` | 不带 # 的 heading 文本。 |
| `content | text` | 要插入的内容。 |

示例：

```bash
curl -X POST http://localhost:8787/v1/api/headings/prepend \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{ "path": "Projects/demo.md", "heading": "Next", "content": "- First priority" }'
```

## headings/replace

**替换 Heading 段落内容**

保留 heading 本身，替换其下方的全部段落内容。

方法：`POST`

适用场景：

- 用最新项目数据重生成状态段落。
- 替换 AI 摘要，同时不影响笔记其他部分。

参数：

| 参数 | 说明 |
|---|---|
| `path | filename | file | name` | 目标 Markdown 文件。 |
| `heading` | 不带 # 的 heading 文本。 |
| `content | text` | 替换后的内容。 |

示例：

```bash
curl -X POST http://localhost:8787/v1/api/headings/replace \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{ "path": "Projects/demo.md", "heading": "Status", "content": "Green" }'
```

## headings/insert-after-last-matching-line

**插入到最后一条匹配行之后**

在指定 heading 段落内，找到最后一条匹配正则的行，并把内容插到其下方。

方法：`POST`

适用场景：

- 把 `[HH:mm]` 日记条目插入到上午/下午/晚上段落内最后一条时间行之后。
- 把新内容插到某个前缀的最后一个 checklist 条目之后。

参数：

| 参数 | 说明 |
|---|---|
| `path | filename | file | name` | 目标 Markdown 文件。 |
| `heading` | 不带 # 的 heading 文本。 |
| `content | text` | 要插入的内容。 |

示例：

```bash
curl -X POST http://localhost:8787/v1/api/headings/insert-after-last-matching-line \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{
    "path": "Daily/2026-05-13.md",
    "heading": "下午",
    "content": "[16:21] 在折腾 Obsidian 自动化"
  }'
```

## frontmatter/get

**读取 Frontmatter 字段**

读取一个 YAML frontmatter 字段。

方法：`GET or POST`

适用场景：

- 检查某篇笔记是否已经被处理过。
- 选择工作流前读取笔记的 type/status。

参数：

| 参数 | 说明 |
|---|---|
| `path | filename | file | name` | 目标 Markdown 文件。 |
| `key | field` | Frontmatter 字段名。 |

示例：

```bash
curl "http://localhost:8787/v1/api/frontmatter/get?path=Ideas/api-note.md&key=status" \
  -H "Authorization: Bearer change-me"
```

## frontmatter/set

**设置 Frontmatter 字段**

设置或创建一个 YAML frontmatter 字段。

方法：`POST`

适用场景：

- 给 AI 已处理笔记标记 status: done。
- 给 capture 写入 source/type 等元数据。

参数：

| 参数 | 说明 |
|---|---|
| `path | filename | file | name` | 目标 Markdown 文件。 |
| `key | field` | Frontmatter 字段名。 |
| `value | content | text` | 要保存的值。字符串看起来是 JSON 时会尝试解析。 |
| `geoConvert` | 可选。对 `lat,lng` 或 `[lat, lng]` 这类坐标值做显式转换，例如 `gcj02-to-wgs84` 或 `wgs84-to-gcj02`。默认不转换。 |

示例：

```bash
curl -X POST http://localhost:8787/v1/api/frontmatter/set \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{ "path": "Ideas/api-note.md", "key": "status", "value": "draft" }'
```

把单点位置写进 Map View 用的 `location` 字段，并把国内 GCJ-02 坐标转成 OSM 瓦片用的 WGS-84：

```bash
curl -X POST http://localhost:8787/v1/api/frontmatter/set \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{
    "path": "Daily/2026-06-03.md",
    "key": "location",
    "value": "31.2304,121.4737",
    "geoConvert": "gcj02-to-wgs84"
  }'
```

## frontmatter/append

**追加 Frontmatter 数组字段**

向一个 inline 数组形式的 YAML frontmatter 字段追加一个值；不传 `path` 时默认写当天日记，文件不存在时自动新建。

方法：`POST`

适用场景：

- 快捷指令一天多次把当前坐标追加到日记的 `locations` 数组里。
- 在不覆盖已有列表的前提下，给笔记累加 tags 或引用。

参数：

| 参数 | 说明 |
|---|---|
| `path | filename | file | name` | 可选目标 Markdown 文件。不传则用 `at` 对应的当天日记。 |
| `at` | 可选 ISO 时间戳，用于解析默认的当天日记。默认当前时间。 |
| `key | field` | Frontmatter 字段名。 |
| `value | content | text` | 要追加的值。看起来是 JSON 的字符串会被解析；整个数组值会作为「一个元素」追加。 |
| `type` | 可选值类型：string、number、boolean、array、json。默认自动识别。 |
| `unique` | 可选布尔。为真时重复值不会重复追加。 |
| `position` | 追加位置：end（默认）或 start。 |
| `createIfMissing` | 可选布尔。默认 true；会新建笔记（默认日记会套用日记模板）。 |
| `templatePath | template` | 可选。新建缺失笔记时使用的 Vault 相对模板路径。 |
| `idempotencyKey` | 可选幂等键，避免上游重试造成重复写入。 |

> 说明：这里写的是 frontmatter 里的 inline 数组（如 `locations: [[39.9,116.3]]`）。Obsidian **Map View 的「多个位置」并不读 frontmatter 数组**，而是读正文里的内联 `geo:` 链接 + 一个空的 `locations:` 标记；frontmatter 数组更适合单点或 Leaflet 等用数组的插件。

示例：

```bash
curl -X POST http://localhost:8787/v1/api/frontmatter/append \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{
    "key": "locations",
    "value": [39.9, 116.3],
    "type": "array",
    "unique": true
  }'
```

## geo/convert

**坐标转换**

在 GCJ-02 与 WGS-84 之间转换坐标。方向始终由调用方显式指定，不做自动判别（GCJ-02 是对 WGS-84 的确定性偏移，单看数字无法区分，自动猜一定会出错）。中国大陆境外为空操作。

方法：`GET or POST`

适用场景：

- 把 GCJ-02 坐标转成 WGS-84，再丢到基于 OpenStreetMap 瓦片的 Map View 上。
- 把 WGS-84 的 GPS 坐标转成 GCJ-02，给高德等国内瓦片源用。

参数：

| 参数 | 说明 |
|---|---|
| `lat | latitude` | 纬度。也可以用 `value` 传 `lat,lng` 或 `[lat, lng]`。 |
| `lng | lon | longitude` | 经度。 |
| `value | coord | coordinate` | 可选的组合形式：`lat,lng` 字符串或 `[lat, lng]` 数组。 |
| `from` | 源坐标系：gcj02 或 wgs84。 |
| `to` | 目标坐标系：gcj02 或 wgs84。 |

示例：

```bash
curl -X POST http://localhost:8787/v1/api/geo/convert \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{
    "value": "31.2304,121.4737",
    "from": "gcj02",
    "to": "wgs84"
  }'
```

返回示例：`{ "ok": true, "operation": "geo/convert", "from": "gcj02", "to": "wgs84", "lat": ..., "lng": ..., "value": "lat,lng" }`。

## daily/append-by-time

**按时间追加 Daily 条目**

根据配置的时区和时段选择 daily note heading，并把条目插到最后一条时间行之后。

方法：`POST`

适用场景：

- Coze 只发送处理后的日记文本，不需要判断应该写入上午/下午/晚上。
- 快捷指令发送快记，由网关统一生成 `[HH:mm]` 格式。

参数：

| 参数 | 说明 |
|---|---|
| `content | text` | 条目正文，不需要包含 `[HH:mm]` 前缀。 |
| `at` | 可选 ISO 时间。默认使用当前时间。 |
| `createIfMissing` | 可选布尔值覆盖。默认使用 Daily Note 配置。 |
| `templatePath | template` | 可选的 Vault 内模板路径覆盖，只在创建缺失日记时使用。 |
| `idempotencyKey` | 可选的幂等键，用于防止重复写入。 |

示例：

```bash
curl -X POST http://localhost:8787/v1/api/daily/append-by-time \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{
    "at": "2026-05-13T16:21:00+08:00",
    "content": "在折腾 Obsidian 自动化",
    "idempotencyKey": "daily-20260513-1621"
  }'
```

## daily/read

**读取 Daily Note**

根据 Daily Note 配置解析路径并读取当天日记。

方法：`GET or POST`

适用场景：

- 读取今天日记供 AI 生成回顾。
- 写总结前读取指定日期的日记。

参数：

| 参数 | 说明 |
|---|---|
| `at` | 可选 ISO 时间，用来解析 daily note 路径。 |

示例：

```bash
curl "http://localhost:8787/v1/api/daily/read?at=2026-05-13T00:00:00%2B08:00" \
  -H "Authorization: Bearer change-me"
```

## search/simple

**简单搜索**

用简单字符串包含匹配搜索 Markdown 文件。

方法：`GET or POST`

适用场景：

- 在建立链接或更新前查找提到某个关键词的笔记。
- 调试某条 capture 是否已经存在。

参数：

| 参数 | 说明 |
|---|---|
| `query | content | text` | 要搜索的字符串。 |
| `limit` | 最大结果数。默认 100，最大 500。 |

示例：

```bash
curl -X POST http://localhost:8787/v1/api/search/simple \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{ "query": "Obsidian" }'
```

## search/semantic

**语义搜索**

使用已构建的远程 embedding 索引进行语义相似搜索。

方法：`POST`

适用场景：

- AI 任务需要找出与当前输入最相关的旧笔记。
- 不用精确关键词，直接搜索“最近我在焦虑什么”。
- Coze 已经生成查询文本，需要本服务从 Vault 中召回相关上下文。

参数：

| 参数 | 说明 |
|---|---|
| `query | content | text` | 查询文本。服务会调用配置的 embedding 模型生成查询向量。 |
| `limit` | 最大结果数。默认使用配置中的 searchLimit，最高 50。 |

示例：

```bash
curl -X POST http://localhost:8787/v1/api/search/semantic \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{ "query": "最近我在思考的 Obsidian 自动化方案", "limit": 5 }'
```

## index/status

**查看索引状态**

查看 embedding 配置是否就绪，以及当前索引包含多少文件和块。

方法：`GET or POST`

适用场景：

- 部署后确认 API Key、baseUrl、模型名是否已经配置完整。
- 调试语义搜索前确认索引是否为空或是否需要重建。

示例：

```bash
curl http://localhost:8787/v1/api/index/status \
  -H "Authorization: Bearer change-me"
```

## index/rebuild

**重建 embedding 索引**

扫描允许目录下的 Markdown 文件，调用远程 embedding API，增量构建本地索引。

方法：`POST`

适用场景：

- 首次部署后为 Vault 建立语义索引。
- 修改 embedding 模型、baseUrl、切块大小后重新生成索引。
- 外部 Obsidian Headless Sync 进程从 Obsidian Sync 拉取了大量历史笔记后手动补偿索引。

参数：

| 参数 | 说明 |
|---|---|
| `force` | 可选布尔值。为 true 时忽略 hash 缓存，强制重新生成所有文件的 embedding。 |

示例：

```bash
curl -X POST http://localhost:8787/v1/api/index/rebuild \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{ "force": false }'
```

## index/file

**索引单个文件**

为单个 Markdown 文件重建 embedding 索引；文件不存在时会从索引中移除。

方法：`POST`

适用场景：

- 外部同步或脚本刚修改了某篇笔记，只想更新这一篇。
- 调试某个文件的切块和召回效果。

参数：

| 参数 | 说明 |
|---|---|
| `path | filename | file | name` | 目标 Markdown 文件。 |

示例：

```bash
curl -X POST http://localhost:8787/v1/api/index/file \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{ "path": "Ideas/api-note.md" }'
```

## reviews/status

**查看回顾任务状态**

查看已配置的回顾任务、调度是否启用、下次运行时间和最近运行记录。

方法：`GET or POST`

适用场景：

- 修改 Web UI 中的周、月、季、年回顾配置后，确认调度时间是否正确。
- 检查某个周期的定时回顾是否已经运行过。

示例：

```bash
curl http://localhost:8787/v1/api/reviews/status \
  -H "Authorization: Bearer change-me"
```

## reviews/run

**立即运行回顾任务**

立即运行一个已配置的回顾任务，使用周期内容、语义召回、配置的 AI 模型和任务输出路径。

方法：`POST`

适用场景：

- 启用定时任务前，先手动测试回顾提示词效果。
- 手动重新生成某个周、月、季、年回顾。

参数：

| 参数 | 说明 |
|---|---|
| `taskId | id | task` | 回顾任务 id，例如 weekly-review。 |

示例：

```bash
curl -X POST http://localhost:8787/v1/api/reviews/run \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{ "taskId": "weekly-review" }'
```

## tags/list

**列出标签**

统计允许目录下 Markdown hashtag 的出现次数。

方法：`GET`

适用场景：

- 查看 capture 笔记中的标签分布。
- 让 AI 从已有主题标签中选择合适标签。

示例：

```bash
curl http://localhost:8787/v1/api/tags/list \
  -H "Authorization: Bearer change-me"
```

## batch

**批量操作**

在一个请求中执行多个 API 操作。

方法：`POST`

适用场景：

- 创建笔记后再设置 frontmatter。
- 写入项目日志后，再给 daily note 追加一条引用。

参数：

| 参数 | 说明 |
|---|---|
| `operations` | 操作数组。每一项使用 route/action/op 指定接口，并附带对应参数。 |

示例：

```bash
curl -X POST http://localhost:8787/v1/api/batch \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{
    "operations": [
      { "route": "files/write", "path": "Ideas/batch-demo.md", "content": "## Log\n" },
      { "route": "headings/append", "path": "Ideas/batch-demo.md", "heading": "Log", "content": "Item" }
    ]
  }'
```

## uri/execute

**执行 Obsidian URI 兼容请求**

解析 Obsidian URI，并执行其中可映射到 Vault 文件系统操作的部分。

方法：`POST`

适用场景：

- 接收已有自动化中已经生成的 obsidian://new URI。
- 把 URI 风格动作桥接到统一 API 命名空间。

参数：

| 参数 | 说明 |
|---|---|
| `uri` | obsidian:// URI 字符串，也可以传 action 风格字段。 |

示例：

```bash
curl -X POST http://localhost:8787/v1/api/uri/execute \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{ "uri": "obsidian://new?file=Ideas%2Furi-demo&content=Hello%20URI" }'
```

## unsupported/active

**不支持：Active File**

对桌面端专属的 active-file 行为返回明确的 unsupported 响应。

方法：`GET or POST`

适用场景：

- 兼容探测：某些客户端可能期望 Local REST API 的 active-file 路由存在。

示例：

```bash
curl http://localhost:8787/v1/api/active \
  -H "Authorization: Bearer change-me"
```

## unsupported/commands

**不支持：Commands**

对桌面 Obsidian command 执行返回明确的 unsupported 响应。

方法：`GET or POST`

适用场景：

- 兼容探测：某些客户端可能期望 Local REST API 的 command 路由存在。

示例：

```bash
curl http://localhost:8787/v1/api/commands \
  -H "Authorization: Bearer change-me"
```
