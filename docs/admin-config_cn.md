# 管理页配置指南

English version: [admin-config.md](admin-config.md).

这篇文档解释 Web 管理页里的配置项。Docker 部署时，管理页里的容器路径应保持为 `/vault` 和 `/data`；宿主机真实路径通过 `.env` 和 Docker Compose 挂载，不要填到管理页里。

管理页现在由 `admin/` 下的 Vue、Vite 和 Element Plus 构建。Node 服务端只在 Basic Auth 后输出 `public/admin` 中的构建产物。Docker 构建镜像时会自动打包；本地开发时如果改了 UI 文件，`npm start` 前先运行 `npm run admin:build`。

管理页默认英文，右上角提供中文/英文切换。语言选择只保存在浏览器 `localStorage`，不会影响运行配置。

## 访问权限

- `.env` 中的 `ADMIN_USERNAME` 和 `ADMIN_PASSWORD` 用 Basic Auth 保护 Web 管理页、`/v1/config`、`/health`，以及索引和回顾任务里的管理动作。
- `API_TOKEN` 只给 Coze、n8n、Telegram Bot、Apple 快捷指令等外部调用方使用。它们调用 `/v1/api/...` 时使用 `Authorization: Bearer <API_TOKEN>`。
- 管理页不需要输入 `API_TOKEN`，也不会把它保存到浏览器。
- 管理页刷新 Vault 目录时走 `/v1/config/vault-dirs`，使用 Basic Auth，不需要外部 Bearer Token。

## Vault

- `Vault Root`: VaultEcho 可写入的 Vault 目录。Docker 中使用 `/vault`。
- `Data Dir`: 运行配置、幂等记录、embedding 索引和回顾任务运行历史。Docker 中使用 `/data`。
- `Time Zone`: 全局用户时区。它同时影响日记路径、`daily/append-by-time` 和定时 Review Tasks。
- `Allowed Top-Level Dirs`: 允许 VaultEcho 读写的顶层目录，使用勾选样式选择。新配置会尽量从当前 Vault 已有顶层目录初始化。
- `Vault Directory Picker`: 刷新当前 Vault 已有顶层目录，并渲染为可勾选项。如果某个目录还不存在但未来会创建，例如 `Reviews`，用 `Custom Dir` 添加。
- `Max JSON Body Bytes`: 请求体大小限制。
- `Image Attachment Dir` / `Audio Attachment Dir`: 后续附件写入的默认 Vault 相对目录。

`Allowed Top-Level Dirs` 不支持通配符，也不要用 `/` 作为全量放开。应该明确选择需要允许的顶层目录。Review Task 里的来源目录和语义召回范围也复用同一份勾选目录列表。

## 日记时间戳插入规则

这一块控制 `daily/append-by-time`。

- `Daily File Path`: 日记文件路径模板，例如 `Daily/{{YYYY}}-{{MM}}-{{DD}}.md` 或 `日记/{{YYYY}}年/{{YYYY}}-{{MM}}-{{DD}}.md`。
- `Daily Template Path`: 可选模板文件。当天日记不存在且需要创建时，会先应用该模板。
- `Create the daily note when it does not exist`: 开启后，如果当天日记不存在，会先创建再插入内容。
- `Heading Level`: 时间段标题的 heading 层级，例如 `2` 表示 `## 下午`。
- `Line Pattern`: 后端固定使用的单行正则，用于识别已有时间戳行。
- `Line Format`: 新条目的格式，默认 `[{{HH:mm}}] {{content}}`。
- `Keep a blank line between timestamp entries`: 时间戳条目之间保留一个空行，同时 heading 和第一条时间戳之间也保留一个空行。
- 时间段：可以添加任意多个不重叠时间段。请求时间会按全局 `Time Zone` 计算，然后落到对应 heading 下。

外部调用方通常不需要传 `at`；不传时 VaultEcho 会用服务器当前时间并转换成全局用户时区。只有在补录历史事件时才建议显式传 `at`。

## AI Model

Review Tasks 使用 OpenAI-compatible Chat API：

- `Provider`: 固定为 `OpenAI Compatible`。填写其他名称不会切换协议；VaultEcho 调 AI 时调用 `Base URL + /chat/completions`，调 embedding 时调用 `Base URL + /embeddings`。
- `Base URL`: Chat API 地址，例如 `https://api.openai.com/v1` 或其他兼容网关。
- `Model`: Chat 模型名。
- `API Key`: 使用 `APP_ENCRYPTION_KEY` 加密保存。留空表示保留已有 key。
- `Temperature` / `Max Output Tokens`: 传给 Chat Completion 的参数。

## Embedding

第一版使用远程 OpenAI-compatible Embedding API，并把向量索引保存到 `data/index/embeddings.json`。

- `Enabled`: 是否启用 embedding 能力。
- `Base URL` / `Model` / `API Key`: 远程 embedding API 配置。Provider 同样固定为 OpenAI-compatible 协议。
- `Dimensions`: 期望维度。填 `0` 表示让 VaultEcho 自动推断。
- `Batch Size` / `Max Chunk Chars` / `Search Limit`: 控制索引和搜索。
- `Auto Index After Write`: VaultEcho 通过 API 写入文件后，自动更新该文件索引。
- `Auto Scan Interval Minutes`: 后台扫描 Headless Sync 拉下来的文件变化。`0` 表示关闭。

第一次配置 embedding、切换模型或 base URL、或者 Headless Sync 拉下大量文件后，建议手动点击 `Rebuild Index`。

## Review Tasks

Review Tasks 是定时 AI 回顾任务：读取一个周期内的笔记，按需做语义召回，调用 AI 模型，然后把结果写回 Vault 中一个受管理的 Markdown 块。

管理页现在使用可编辑任务卡片。`Advanced JSON` 只是兜底入口，适合批量导入/导出，或者临时编辑卡片还没暴露的字段。手动改 JSON 后，先点击 `Apply JSON To Cards`，再保存配置。

### 全局字段

- `Enable scheduled review tasks`: 开关后台定时任务。
- `Max Source Chars`: 发送给 AI 的当前周期来源笔记最大字符数。
- `Max Recall Chars`: 发送给 AI 的语义召回结果最大字符数。
- `Run Task ID`: 手动运行的任务 ID。`Run Now` 不会把定时任务标记为已完成。

Review Tasks 使用精确计时器，不是每分钟轮询。配置变化后，VaultEcho 会按当前卡片配置重新计算下一次运行时间。

### 任务卡片字段

- `Task ID`: 稳定标识，用于手动运行、运行历史和 managed block 标记。建议保持小写且不要频繁改，例如 `weekly-review`。
- `Name`: 展示名称。
- `Period`: `weekly`、`monthly`、`quarterly` 或 `yearly`。
- `Target Period`: 通常选择 `Previous completed period`，也可以选择 `Current period` 做进行中回顾。
- `Run Time`: 按全局 `Time Zone` 解释的运行时间。
- `Weekday`: 每周任务使用，`0` 表示周日，`1` 表示周一。
- `Month Day`: 每月任务使用；年度任务中也表示所选月份的第几天。
- `Quarter Day Offset`: 每季度任务使用，`1` 表示每季度第一天。
- `Month`: 年度任务使用，`1` 到 `12`。
- `Include daily notes resolved from Daily File Path`: 按配置的 `Daily File Path` 逐日读取周期内的每日笔记。即使你的日记目录叫 `日记`、`Journal` 而不是 `Daily`，也应该开启它。
- `Source Dirs`: 额外来源目录。VaultEcho 会按文件修改时间筛选所选周期内的文件。
- `Use semantic recall`: 从 embedding 索引中搜索历史相关内容。
- `Semantic Recall Query`: 固定召回查询。留空时会从周期笔记内容中派生召回语义。
- `Semantic Recall Limit`: 召回条数。
- `Semantic Recall Scope Dirs`: 允许出现在召回结果中的顶层目录。
- `Output Path Template`: 回顾结果写入路径。
- `Output Heading`: 输出 heading。
- `Write Mode`: `Replace managed block` 会在重复运行时替换同一个受管理块；`Append` 只在块不存在时追加。
- `Prompt`: 给 AI 的提示词。建议要求模型基于提供的笔记证据输出，避免泛泛建议。

### 输出路径变量

所有周期都支持：

- `{{period}}`
- `{{periodLabel}}`
- `{{startDate}}`
- `{{endDate}}`

周期专属变量：

- Weekly: `{{YYYY}}`, `{{WW}}`
- Monthly: `{{YYYY}}`, `{{MM}}`
- Quarterly: `{{YYYY}}`, `{{Q}}`
- Yearly: `{{YYYY}}`

示例：

- `Reviews/Weekly/{{YYYY}}-W{{WW}}.md`
- `Reviews/Monthly/{{YYYY}}-{{MM}}.md`
- `Reviews/Quarterly/{{YYYY}}-Q{{Q}}.md`
- `Reviews/Yearly/{{YYYY}}.md`

## 推荐配置顺序

1. 在 `Allowed Top-Level Dirs` 中选择真实需要读写的顶层目录。
2. 把 `Daily File Path` 设置成你 Obsidian 日记实际使用的路径模板。
3. Review Task 中保持 `Include daily notes resolved from Daily File Path` 开启。
4. 确认 `Reviews` 在允许目录中。
5. 配置 AI 和 embedding 模型。
6. 重建 embedding 索引。
7. 先启用一个 Review Task 手动运行，检查输出，再开启定时调度。
