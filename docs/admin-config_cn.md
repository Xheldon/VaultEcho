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
- `Include root Markdown files`: 是否把 Vault 根目录下的 `.md` 文件纳入语义索引和 Review Task 周期来源。
- `Global Exclude Paths`: 全局排除的 Vault 相对目录或文件，会从语义索引和所有 Review Tasks 中排除；任务级排除路径会与这里合并。
- `Vault Directory Picker`: 刷新当前 Vault 已有顶层目录，并渲染为可勾选项。如果某个目录还不存在但未来会创建，例如 `Reviews`，用 `Custom Dir` 添加。
- `Max JSON Body Bytes`: 请求体大小限制。
- `Image Attachment Dir` / `Audio Attachment Dir` / `Video Attachment Dir` / `File Attachment Dir`: `attachments/upload` 使用的 Vault 相对附件目录。如果希望所有附件都进同一个文件夹，把四个目录都填成同一路径。
- `Max Attachment Upload Bytes`: `attachments/upload` 接受的 multipart 附件最大体积。

`Allowed Top-Level Dirs` 不支持通配符，也不要用 `/` 作为全量放开。应该明确选择需要允许的顶层目录。Review Task 里的来源目录和语义召回范围也复用同一份勾选目录列表。

## 日记时间戳插入规则

这一块控制 `daily/append-by-time`。

- `Daily File Path`: 日记文件路径模板，例如 `Daily/{{YYYY}}-{{MM}}-{{DD}}.md` 或 `日记/{{YYYY}}年/{{YYYY}}-{{MM}}-{{DD}}.md`。
- `Daily Template Path`: 可选模板文件。当天日记不存在且需要创建时，会先应用该模板。
- `Create the daily note when it does not exist`: 开启后，如果当天日记不存在，会先创建再插入内容。
- `Heading Level`: 时间段标题的 heading 层级，例如 `2` 表示 `## 下午`。
- `Line Pattern`: 后端固定使用的单行正则，用于识别已有时间戳行。
- `Line Format`: 新条目的格式，默认 `[{{HH:mm}}] {{content}}`。
- 支持多行条目。插入下一条内容时，VaultEcho 会把上一条时间戳行以及它后面连续的非空、非时间戳内容视为同一个条目块；遇到空行即视为该条目结束。
- `Keep a blank line between timestamp entries`: 时间戳条目之间保留一个空行，同时 heading 和第一条时间戳之间也保留一个空行。
- `Insert timestamp entries in chronological order`（按时间顺序插入时间戳条目）：默认开启。开启后，新条目会按时间顺序插入到目标 heading 下已有的 `[HH:mm]` 行之间，而不是总是追加到最后一条下方。这样即使 X 连接器等数据源回补了更早时间的内容，条目也能保持有序。关闭后则按写入先后顺序排列。
- 时间段：可以添加任意多个不重叠时间段。请求时间会按全局 `Time Zone` 计算，然后落到对应 heading 下。
- `连接器数据`: 内部日记数据源。当前支持 X 和 Strava，也可以新增多个来源，用于不同账号或不同写入规则。
- `轮询间隔`: 自动轮询的全局固定间隔。可选 15 分钟、30 分钟、1 小时、2 小时、6 小时、12 小时、24 小时。定时轮询失败后会在 15 分钟后重试。
- 每个来源都有自己的名称、启用开关、平台鉴权、读取选项和输出设置。来源卡片上的 `立即查找` 会先保存当前配置，再读取该来源最近的滑动回看窗口。
- X 鉴权使用开发者平台里的 Bearer 或 User Access Token。Token 会用 `APP_ENCRYPTION_KEY` 加密保存；留空表示保留该来源已有 Token。
- 推荐填写 `X User ID`。如果只填 `X Username`，VaultEcho 会先额外查询一次 User ID。
- Strava 鉴权使用 `Client ID`、`Client Secret` 和 `Refresh Token`；Secret 会用 `APP_ENCRYPTION_KEY` 加密。`Redirect URI` 默认使用当前 Admin UI 地址，例如 `https://your-vps.example/admin`；需要在 Strava App 设置里把 Authorization Callback Domain 配成同一个 VPS 域名。VaultEcho 会自动刷新 access token，并把刷新后的 token 状态存到 `/data`。如果看到 `activity:read_permission missing`，说明当前授权缺少活动读取 scope，需要用后台里的 Strava 授权链接重新授权 `read,activity:read_all`；Strava 回跳到 Admin UI 后会自动填入 authorization code，也可以手动填入新的 refresh token。
- Strava 来源默认单次最多处理 10 条活动，并在每条活动详情请求之间等待 1000 ms。建议保持保守；历史回填继续使用本地导入脚本，不要靠高频连接器轮询补历史。
- Strava 会记录所有运动类型。唯一的过滤是 `最小运动时间`（默认 5 分钟）：低于该时长的活动会被跳过。活动本身没有的指标——例如羽毛球、乒乓球这类室内运动没有速度和里程——会从条目中省略，而不是把整条活动丢弃。
- 每次定时轮询都会按轮询间隔使用滑动回看窗口：15 分钟 -> 30 分钟、30 分钟 -> 1 小时、1 小时 -> 2 小时、2 小时 -> 6 小时、6 小时 -> 12 小时、12 小时 -> 24 小时、24 小时 -> 48 小时。每天本地 23:59 还会额外兜底读取当天 `00:00` 到兜底运行时刻的数据。写入会按来源 + 帖子/活动 ID 做幂等去重。默认迁移来的 X 来源会继续使用旧的 `x-post-<id>` key 格式以兼容已有记录。
- `插入位置`: 可选 `单独 Heading` 或 `日记时间块`。`单独 Heading` 会写入固定 heading，如果当天日记里没有该 heading，会在页面底部新建。`日记时间块` 会按每条帖子的 `created_at` 匹配上方时间段，例如 12:20 写入下午时间块。
- `目标 Heading Markdown`: 完整 Markdown heading，例如 `## Twitter`。只在 `插入位置` 为 `单独 Heading` 时使用。
- `帖子内容模板`: 控制被时间戳行包裹之前的正文。支持 `{{text}}`、`{{url}}`、`{{id}}`、`{{username}}`、`{{created_at}}`。
- Strava 会写入可配置的运动 heading，例如 `## 今日运动` 或 `# 运动`。如果目标 heading 不存在，VaultEcho 会用 `---` 在运动块前后分隔。默认会把新块插到 Daily Time Slots 配置里的最后一个时间段 heading 之后；只有想覆盖默认位置时才填写 `缺失时插入到此 Heading 后`。已有运动条目会按 `[HH:mm]` 合并排序。

连接器运行历史、连接器临时状态文件、写入幂等记录都会在一周后清理，避免 `/data` 目录长期增长，同时保留重试和当天重复轮询所需的保护。

### Strava 授权操作顺序

先配置 Strava 端，再回到 VaultEcho 配置连接器：

1. 打开 [Strava API 设置](https://www.strava.com/settings/api)，进入 `My API Application`。不要在 `My Apps` 页面找，那里只是撤销已授权应用的入口，不是开发者应用配置。
2. 在 Strava 的 `Authorization Callback Domain` 填 Admin UI 的域名本身，例如 `b.bojiapp.com`。这里只填域名，不要填 `https://`，不要填端口，也不要填 `/admin`。错误示例：`https://b.bojiapp.com`、`b.bojiapp.com:58702`、`https://b.bojiapp.com/admin`。
3. 如果 VaultEcho 现在通过非标准端口访问，例如 `https://b.bojiapp.com:58702`，建议先用反向代理把 Admin UI 暴露到标准 HTTPS 443，例如 `https://b.bojiapp.com/admin`。Strava 对公网 `redirect_uri` 的端口匹配比较严格；`localhost` 和 `127.0.0.1` 是本地测试特例。
4. 回到 VaultEcho Admin，Strava 来源里填写 `Client ID`、`Client Secret`，并把 `Strava Redirect URI` 设为 Admin UI 地址，例如 `https://b.bojiapp.com/admin`。这一步必须与 Strava 端的 callback domain 属于同一个域名。
5. 点击 `打开 Strava 授权链接`，授权页里保留活动读取权限，尤其是 `activity:read_all`。授权完成后 Strava 会回跳到 VaultEcho Admin，页面会自动捕获 authorization code。
6. 回到该 Strava 来源点击 `立即查找`。VaultEcho 会保存当前配置，用 authorization code 换取 refresh token，并在后续定时轮询中自动刷新短期 access token。

如果打开授权链接后直接看到 `{"message":"Bad Request","errors":[{"resource":"Application","field":"redirect_uri","code":"invalid"}]}`，优先检查 Strava 端的 `Authorization Callback Domain` 是否只填了裸域名，并确认 VaultEcho 的 `Redirect URI` 没有使用公网非标准端口。

VaultEcho 不会缓存 Strava 活动详情。`/data` 中只保存必要的 token 状态、运行历史和幂等记录；运行历史、临时状态文件、幂等记录最多保留一周。

外部调用方通常不需要传 `at`；不传时 VaultEcho 会用服务器当前时间并转换成全局用户时区。只有在补录历史事件时才建议显式传 `at`。

## Apple 健康

这一节配置 `health/ingest` 端点。和连接器不同，Apple 健康是只接收的：由配套设备把 HealthKit 原始数据推送到 `POST /v1/api/health/ingest`（Bearer 鉴权），VaultEcho 在服务端聚合、格式化后写入每日笔记。VaultEcho 不会主动拉取设备数据。

- `启用 Apple 健康接收端点`：总开关。关闭时 `health/ingest` 直接返回错误。
- 睡眠和运动是两个独立子项，可以只开其中一个。
- `睡眠`：VaultEcho 把原始 `HKCategoryValueSleepAnalysis` 样本聚合成一条当晚摘要——总睡眠时长、卧床时长、各阶段时长（深睡 / 核心 / REM / 清醒），以及可选的平均心率和 HRV。一晚按起床日归属（16 号午夜前入睡、17 号早上起床的睡眠会写入 17 号日记）。重复推送同一晚会覆盖当晚那条，因此 Apple Watch 的增量同步不会产生重复。
- `运动`：每个 `HKWorkout` 使用与 Strava 运动连接器完全一致的条目格式（类型、时长、平均/最大心率、里程、卡路里、设备链接）。每条运动按 UUID 去重，重复推送同一条不会重复写。`最短时长（分钟）` 会跳过短于阈值的运动。
- `插入位置`（每个子项各自配置）：可选 `单独 Heading` 或 `日记时间块`。`单独 Heading` 写入固定标题，例如 `## 今日睡眠` 或 `## 今日运动`，不存在时会创建一个带 `---` 的分隔块；`日记时间块` 按时间戳（运动开始时间、或睡眠起床时间）落入对应时间段 heading。
- `目标 Heading Markdown`：完整的 Markdown 标题，仅在 `插入位置` 为 `单独 Heading` 时使用。
- `在该 Heading 之后插入`：可选。留空则插入到配置的最后一个日记时间段 heading 之后；只有需要覆盖默认位置时才填写。

Apple 健康的写入复用 `每日时间戳插入规则` 里的日记路径、heading 层级、行匹配、空行间隔和模板设置，并复用相同的幂等记录一周保留策略。`Daily` 顶级目录必须在允许写入的顶级目录白名单中。

## AI Model

Review Tasks 可以调用 OpenAI-compatible Chat Completions API，也可以调用 OpenAI 官方 Responses API：

- `Provider`: 固定为 `OpenAI Compatible`。它只表示鉴权和网关家族；真正的请求协议由 `API Mode` 决定。
- `API Mode`: OpenRouter、Groq 和多数 OpenAI-compatible 网关使用 `Chat Completions`。OpenAI 官方强模型或要求 `/v1/responses` 的模型使用 `Responses API`。
- `Base URL`: API 地址，例如 `https://api.openai.com/v1` 或其他兼容网关。
- `Model`: 模型名。`Chat Completions` 模式下使用 `gpt-5-chat-latest` 这类 chat 模型；`Responses API` 模式下使用 `gpt-5.5` 这类支持 Responses 的模型。
- `API Key`: 使用 `APP_ENCRYPTION_KEY` 加密保存。留空表示保留已有 key。
- `Temperature`: 只在 `Chat Completions` 模式传递。`Responses API` 模式下 VaultEcho 会省略它，以兼容推理/前沿模型。
- `Max Output Tokens`: 在 Chat Completions 中作为 `max_tokens` 发送，在 Responses 中作为 `max_output_tokens` 发送。

## Embedding

VaultEcho 使用远程 OpenAI-compatible Embedding API，并把向量索引保存到 `data/index/embeddings.json`。

Embedding 不走 Chat Completions，也不走 Responses API。OpenAI 当前的 embedding 模型，包括 `text-embedding-3-large` 和 `text-embedding-3-small`，仍然使用 `Base URL + /embeddings`。它们的新能力主要是可选的 `dimensions` 参数，VaultEcho 已经在管理页暴露。

- `Enabled`: 是否启用 embedding 能力。
- `Enable remote embeddings`: 语义搜索、自动索引和语义召回的全局开关。只有开启后才显示模型配置。
- `Base URL` / `Model` / `API Key`: 远程 embedding API 配置。VaultEcho 会调用 `Base URL + /embeddings`。
- `Dimensions`: 期望维度。填 `0` 表示让 VaultEcho 自动推断。OpenAI `text-embedding-3-large` 默认是 3072 维，但如果服务商支持，也可以请求更小维度，例如 1024。
- `Batch Size` / `Max Chunk Chars` / `Search Limit`: 控制索引和搜索。
- `Auto Index After Write`: VaultEcho 通过 API 写入文件后，自动更新该文件索引。
- `Auto Scan Interval Minutes`: 后台扫描 Headless Sync 拉下来的文件变化。`0` 表示关闭。

第一次配置 embedding、切换模型或 base URL、或者 Headless Sync 拉下大量文件后，建议手动点击 `Rebuild Index`。

## Review Tasks

Review Tasks 是定时 AI 回顾任务：读取一个周期内的笔记，按需做语义召回，调用 AI 模型，然后向配置好的 Markdown 回顾文件末尾追加一段回顾记录。

管理页现在使用可编辑任务卡片。`Advanced JSON` 只是兜底入口，适合批量导入/导出，或者临时编辑卡片还没暴露的字段。手动改 JSON 后，先点击 `Apply JSON To Cards`，再保存配置。

### 全局字段

- `Enable automatic scheduling`: 自动调度总开关。只有开启后才显示任务卡片配置。
- `Review Status`: 读取每个任务的启用状态、下一次运行时间和最近一次运行记录。
- `Max Source Chars`: 发送给 AI 的当前周期来源笔记最大字符数。
- `Max Recall Chars`: 发送给 AI 的语义召回结果最大字符数。

Review Tasks 使用精确计时器，不是每分钟轮询。配置变化后，VaultEcho 会按当前卡片配置重新计算下一次运行时间。

### 任务卡片字段

- `Enable this task`: 是否让这个任务卡片参与自动调度。可以同时启用多个任务。
- `Run Now`: 先保存当前管理页配置，再手动运行这个任务一次。它不会把定时任务标记为已完成。
- `Task ID`: 稳定标识，用于手动运行和运行历史。建议保持小写且不要频繁改，例如 `weekly-review`。
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
- `Exclude Paths`: 要排除的 Vault 相对目录或子目录，会同时排除周期来源笔记和语义召回结果。适合附件、批量导入、历史整理目录，例如 `Attachments` 或 `书影音/电影`。
- `Use semantic recall`: 从 embedding 索引中搜索历史相关内容。
- `Semantic Recall Query`: 固定召回查询。留空时会从周期笔记内容中派生召回语义。
- `Semantic Recall Limit`: 召回条数。
- `Semantic Recall Scope Dirs`: 允许出现在召回结果中的顶层目录。
- `Output Path Template`: 回顾文件路径。如果文件已存在，每次运行都会向文件末尾追加一段新的回顾记录。
- `Review Template Path`: 这个任务首次创建输出文件时使用的 Vault 相对 Markdown 模板路径。适合固定 YAML/frontmatter；可以省略 `.md`。
- `Output Heading`: 未配置回顾模板时使用的默认标题。
- `Prompt`: 给 AI 的提示词。建议要求模型基于提供的笔记证据输出，避免泛泛建议。

每次运行都会追加一段固定 callout，然后追加 AI 回顾正文：

```md
> [!info] VaultEcho Review
> Period: 2026-W20 (2026-05-11 to 2026-05-18)
> Generated At: 2026-05-18 14:33:21
```

`Generated At` 会按全局 `Time Zone` 格式化。

### 输出路径和回顾模板变量

所有周期都支持：

- `{{period}}`
- `{{periodLabel}}`
- `{{startDate}}`
- `{{endDate}}`
- `{{generatedAt}}`
- `{{title}}`
- `{{heading}}`
- `{{taskId}}`
- `{{taskName}}`
- `{{outputPath}}`

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

回顾模板示例：

```md
---
type: weekly-review
period: {{periodLabel}}
created: {{generatedAt}}
tags:
  - review
---
```

VaultEcho 总是把固定 callout 和 AI 回顾正文追加到已有文件内容后面。模板不需要写 `{{content}}`。

## 推荐配置顺序

1. 在 `Allowed Top-Level Dirs` 中选择真实需要读写的顶层目录。
2. 把 `Daily File Path` 设置成你 Obsidian 日记实际使用的路径模板。
3. Review Task 中保持 `Include daily notes resolved from Daily File Path` 开启。
4. 确认 `Reviews` 在允许目录中。
5. 配置 AI 和 embedding 模型。
6. 重建 embedding 索引。
7. 先启用一个 Review Task 手动运行，检查输出，再开启定时调度。
