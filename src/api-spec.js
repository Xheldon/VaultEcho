export const API_ALIASES = {
  new: "files/create",
  create: "files/create",
  open: "files/read",
  read: "files/read",
  write: "files/write",
  append: "files/append",
  prepend: "files/prepend",
  delete: "files/delete",
  list: "files/list",
  daily: "daily/append-by-time",
  search: "search/simple",
  semantic: "search/semantic",
  tags: "tags/list",
  reindex: "index/rebuild",
  index: "index/status",
  script: "batch",
  uri: "uri/execute",
  active: "unsupported/active",
  commands: "unsupported/commands"
};

export const API_ENDPOINTS = [
  {
    route: "files/create",
    method: "POST",
    title: "新建 Markdown 文件",
    summary: "在 Vault 中创建一个新的 Markdown 文件。",
    scenarios: [
      "Coze 已经把灵感整理成一篇笔记，需要写入 Ideas。",
      "采集管道把外部资料处理完，需要写入 Notes。",
      "需要基于 Vault 里的模板创建笔记，并用请求中的 yaml 覆盖模板默认属性。",
      "工作流需要在文件重名时自动追加后缀，避免覆盖。"
    ],
    params: [
      ["path | filename | file | name", "Vault 相对路径。如果没有包含允许的顶级目录，会自动放到 Inbox/ 下。"],
      ["content | text", "Markdown 正文。"],
      ["templatePath | template", "可选的 Vault 内模板相对路径。先读取并应用模板，再合并 content。模板支持 `{{content}}`、`{{title}}`、`{{yyyy-MM-dd}}`、`{{HH:mm}}` 等变量。"],
      ["yaml | frontmatter", "可选对象。最后应用到 frontmatter，因此会覆盖模板中同名 YAML 属性。"],
      ["ifExists", "文件已存在时的策略：fail、overwrite、append_suffix。默认 fail。"],
      ["idempotencyKey", "可选的幂等键，用于防止重复写入。"],
      ["script", "可选的 URL 编码 JSON Vault Script，在主操作后执行。"]
    ],
    curl: `curl -X POST http://localhost:8787/v1/api/files/create \\
  -H "Authorization: Bearer change-me" \\
  -H "Content-Type: application/json" \\
  -d '{
    "path": "Ideas/api-note.md",
    "templatePath": "Templates/idea.md",
    "content": "Hello",
    "yaml": {
      "status": "done",
      "source": "coze"
    },
    "ifExists": "append_suffix"
  }'`
  },
  {
    route: "files/read",
    method: "GET or POST",
    title: "读取文件",
    summary: "从 Vault 中读取一个 Markdown 文件。",
    scenarios: [
      "工作流需要先读取现有笔记，再决定如何更新。",
      "调试时确认网关实际写入了什么内容。"
    ],
    params: [
      ["path | filename | file | name", "目标 Vault 相对路径。"]
    ],
    curl: `curl "http://localhost:8787/v1/api/files/read?path=Ideas/api-note.md" \\
  -H "Authorization: Bearer change-me"`
  },
  {
    route: "files/write",
    method: "POST",
    title: "覆盖写入文件",
    summary: "用新内容覆盖一个 Markdown 文件。",
    scenarios: [
      "从上游权威数据重新生成一篇笔记。",
      "AI 清洗完成后，用整理结果替换临时 Inbox 笔记。"
    ],
    params: [
      ["path | filename | file | name", "目标 Vault 相对路径。"],
      ["content | text", "完整文件内容。"]
    ],
    curl: `curl -X POST http://localhost:8787/v1/api/files/write \\
  -H "Authorization: Bearer change-me" \\
  -H "Content-Type: application/json" \\
  -d '{ "path": "Ideas/api-note.md", "content": "Full replacement" }'`
  },
  {
    route: "files/append",
    method: "POST",
    title: "追加到文件末尾",
    summary: "把内容追加到文件末尾。",
    scenarios: [
      "把原始 capture 追加到 Inbox 日志。",
      "把生成的参考资料列表追加到已有笔记。"
    ],
    params: [
      ["path | filename | file | name", "目标 Vault 相对路径。"],
      ["content | text", "要追加的内容。"],
      ["idempotencyKey", "可选的幂等键，用于防止重复写入。"]
    ],
    curl: `curl -X POST http://localhost:8787/v1/api/files/append \\
  -H "Authorization: Bearer change-me" \\
  -H "Content-Type: application/json" \\
  -d '{ "path": "Inbox/2026-05-13.md", "content": "\\n- New capture" }'`
  },
  {
    route: "files/prepend",
    method: "POST",
    title: "插入到文件开头",
    summary: "把内容插入到文件开头。",
    scenarios: [
      "在导入笔记顶部添加摘要块。",
      "在笔记开头插入警告或处理状态。"
    ],
    params: [
      ["path | filename | file | name", "目标 Vault 相对路径。"],
      ["content | text", "要插入的内容。"],
      ["idempotencyKey", "可选的幂等键，用于防止重复写入。"]
    ],
    curl: `curl -X POST http://localhost:8787/v1/api/files/prepend \\
  -H "Authorization: Bearer change-me" \\
  -H "Content-Type: application/json" \\
  -d '{ "path": "Ideas/api-note.md", "content": "> AI summary\\n\\n" }'`
  },
  {
    route: "files/delete",
    method: "DELETE or POST",
    title: "软删除文件",
    summary: "把文件移动到 Archive/Deleted，而不是永久删除。",
    scenarios: [
      "清理错误 capture，同时保留恢复路径。",
      "安全归档过期的生成笔记。"
    ],
    params: [
      ["path | filename | file | name", "目标 Vault 相对路径。"],
      ["idempotencyKey", "可选的幂等键，用于防止重复写入。"]
    ],
    curl: `curl -X DELETE "http://localhost:8787/v1/api/files/delete?path=Inbox/old.md" \\
  -H "Authorization: Bearer change-me"`
  },
  {
    route: "files/list",
    method: "GET or POST",
    title: "列出文件",
    summary: "列出 Vault 目录下的文件和子目录。",
    scenarios: [
      "查看 Inbox 或 Ideas 下已经写入了哪些内容。",
      "让自动化流程从目录中选择候选文件。"
    ],
    params: [
      ["path", "可选目录路径。为空时列出已存在的配置顶级目录。"]
    ],
    curl: `curl "http://localhost:8787/v1/api/files/list?path=Ideas" \\
  -H "Authorization: Bearer change-me"`
  },
  {
    route: "headings/read",
    method: "GET or POST",
    title: "读取 Heading 段落",
    summary: "读取 Markdown 指定 heading 下的段落内容。",
    scenarios: [
      "生成摘要前读取今天日记的“下午”段落。",
      "读取项目笔记里的 Decisions 段落。"
    ],
    params: [
      ["path | filename | file | name", "目标 Markdown 文件。"],
      ["heading", "不带 # 的 heading 文本。"],
      ["headingLevel", "可选 heading 级别。默认 2。"]
    ],
    curl: `curl "http://localhost:8787/v1/api/headings/read?path=Daily/2026-05-13.md&heading=下午" \\
  -H "Authorization: Bearer change-me"`
  },
  {
    route: "headings/append",
    method: "POST",
    title: "追加到 Heading 段落末尾",
    summary: "把内容追加到指定 heading 段落的末尾。",
    scenarios: [
      "给项目日志段落追加一行。",
      "把处理后的 capture 追加到笔记的指定段落。"
    ],
    params: [
      ["path | filename | file | name", "目标 Markdown 文件。"],
      ["heading", "不带 # 的 heading 文本。"],
      ["headingLevel", "可选 heading 级别。默认 2。"],
      ["content | text", "要追加的内容。"],
      ["ifHeadingMissing", "heading 不存在时的行为：create 或 error。默认 create。"]
    ],
    curl: `curl -X POST http://localhost:8787/v1/api/headings/append \\
  -H "Authorization: Bearer change-me" \\
  -H "Content-Type: application/json" \\
  -d '{ "path": "Daily/2026-05-13.md", "heading": "下午", "content": "[16:21] New item" }'`
  },
  {
    route: "headings/prepend",
    method: "POST",
    title: "插入到 Heading 段落开头",
    summary: "把内容插入到指定 heading 的正下方。",
    scenarios: [
      "把摘要放在某个段落最前面。",
      "把新的高优先级行动项放到旧条目前面。"
    ],
    params: [
      ["path | filename | file | name", "目标 Markdown 文件。"],
      ["heading", "不带 # 的 heading 文本。"],
      ["content | text", "要插入的内容。"]
    ],
    curl: `curl -X POST http://localhost:8787/v1/api/headings/prepend \\
  -H "Authorization: Bearer change-me" \\
  -H "Content-Type: application/json" \\
  -d '{ "path": "Projects/demo.md", "heading": "Next", "content": "- First priority" }'`
  },
  {
    route: "headings/replace",
    method: "POST",
    title: "替换 Heading 段落内容",
    summary: "保留 heading 本身，替换其下方的全部段落内容。",
    scenarios: [
      "用最新项目数据重生成状态段落。",
      "替换 AI 摘要，同时不影响笔记其他部分。"
    ],
    params: [
      ["path | filename | file | name", "目标 Markdown 文件。"],
      ["heading", "不带 # 的 heading 文本。"],
      ["content | text", "替换后的内容。"]
    ],
    curl: `curl -X POST http://localhost:8787/v1/api/headings/replace \\
  -H "Authorization: Bearer change-me" \\
  -H "Content-Type: application/json" \\
  -d '{ "path": "Projects/demo.md", "heading": "Status", "content": "Green" }'`
  },
  {
    route: "headings/insert-after-last-matching-line",
    method: "POST",
    title: "插入到最后一条匹配行之后",
    summary: "在指定 heading 段落内，找到最后一条匹配正则的行，并把内容插到其下方。",
    scenarios: [
      "把 `[HH:mm]` 日记条目插入到上午/下午/晚上段落内最后一条时间行之后。",
      "把新内容插到某个前缀的最后一个 checklist 条目之后。"
    ],
    params: [
      ["path | filename | file | name", "目标 Markdown 文件。"],
      ["heading", "不带 # 的 heading 文本。"],
      ["linePattern", "JavaScript 正则字符串。可默认使用 Daily Note 配置中的正则。"],
      ["content | text", "要插入的内容。"]
    ],
    curl: `curl -X POST http://localhost:8787/v1/api/headings/insert-after-last-matching-line \\
  -H "Authorization: Bearer change-me" \\
  -H "Content-Type: application/json" \\
  -d '{
    "path": "Daily/2026-05-13.md",
    "heading": "下午",
    "linePattern": "^\\\\[\\\\d{2}:\\\\d{2}\\\\]",
    "content": "[16:21] 在折腾 Obsidian 自动化"
  }'`
  },
  {
    route: "frontmatter/get",
    method: "GET or POST",
    title: "读取 Frontmatter 字段",
    summary: "读取一个 YAML frontmatter 字段。",
    scenarios: [
      "检查某篇笔记是否已经被处理过。",
      "选择工作流前读取笔记的 type/status。"
    ],
    params: [
      ["path | filename | file | name", "目标 Markdown 文件。"],
      ["key | field", "Frontmatter 字段名。"]
    ],
    curl: `curl "http://localhost:8787/v1/api/frontmatter/get?path=Ideas/api-note.md&key=status" \\
  -H "Authorization: Bearer change-me"`
  },
  {
    route: "frontmatter/set",
    method: "POST",
    title: "设置 Frontmatter 字段",
    summary: "设置或创建一个 YAML frontmatter 字段。",
    scenarios: [
      "给 AI 已处理笔记标记 status: done。",
      "给 capture 写入 source/type 等元数据。"
    ],
    params: [
      ["path | filename | file | name", "目标 Markdown 文件。"],
      ["key | field", "Frontmatter 字段名。"],
      ["value | content | text", "要保存的值。字符串看起来是 JSON 时会尝试解析。"]
    ],
    curl: `curl -X POST http://localhost:8787/v1/api/frontmatter/set \\
  -H "Authorization: Bearer change-me" \\
  -H "Content-Type: application/json" \\
  -d '{ "path": "Ideas/api-note.md", "key": "status", "value": "draft" }'`
  },
  {
    route: "daily/append-by-time",
    method: "POST",
    title: "按时间追加 Daily 条目",
    summary: "根据配置的时区和时段选择 daily note heading，并把条目插到最后一条时间行之后。",
    scenarios: [
      "Coze 只发送处理后的日记文本，不需要判断应该写入上午/下午/晚上。",
      "快捷指令发送快记，由网关统一生成 `[HH:mm]` 格式。"
    ],
    params: [
      ["content | text", "条目正文，不需要包含 `[HH:mm]` 前缀。"],
      ["at", "可选 ISO 时间。默认使用当前时间。"],
      ["idempotencyKey", "可选的幂等键，用于防止重复写入。"]
    ],
    curl: `curl -X POST http://localhost:8787/v1/api/daily/append-by-time \\
  -H "Authorization: Bearer change-me" \\
  -H "Content-Type: application/json" \\
  -d '{
    "at": "2026-05-13T16:21:00+08:00",
    "content": "在折腾 Obsidian 自动化",
    "idempotencyKey": "daily-20260513-1621"
  }'`
  },
  {
    route: "daily/read",
    method: "GET or POST",
    title: "读取 Daily Note",
    summary: "根据 Daily Note 配置解析路径并读取当天日记。",
    scenarios: [
      "读取今天日记供 AI 生成回顾。",
      "写总结前读取指定日期的日记。"
    ],
    params: [
      ["at", "可选 ISO 时间，用来解析 daily note 路径。"]
    ],
    curl: `curl "http://localhost:8787/v1/api/daily/read?at=2026-05-13T00:00:00%2B08:00" \\
  -H "Authorization: Bearer change-me"`
  },
  {
    route: "search/simple",
    method: "GET or POST",
    title: "简单搜索",
    summary: "用简单字符串包含匹配搜索 Markdown 文件。",
    scenarios: [
      "在建立链接或更新前查找提到某个关键词的笔记。",
      "调试某条 capture 是否已经存在。"
    ],
    params: [
      ["query | content | text", "要搜索的字符串。"],
      ["limit", "最大结果数。默认 100，最大 500。"]
    ],
    curl: `curl -X POST http://localhost:8787/v1/api/search/simple \\
  -H "Authorization: Bearer change-me" \\
  -H "Content-Type: application/json" \\
  -d '{ "query": "Obsidian" }'`
  },
  {
    route: "search/semantic",
    method: "POST",
    title: "语义搜索",
    summary: "使用已构建的远程 embedding 索引进行语义相似搜索。",
    scenarios: [
      "AI 任务需要找出与当前输入最相关的旧笔记。",
      "不用精确关键词，直接搜索“最近我在焦虑什么”。",
      "Coze 已经生成查询文本，需要本服务从 Vault 中召回相关上下文。"
    ],
    params: [
      ["query | content | text", "查询文本。服务会调用配置的 embedding 模型生成查询向量。"],
      ["limit", "最大结果数。默认使用配置中的 searchLimit，最高 50。"]
    ],
    curl: `curl -X POST http://localhost:8787/v1/api/search/semantic \\
  -H "Authorization: Bearer change-me" \\
  -H "Content-Type: application/json" \\
  -d '{ "query": "最近我在思考的 Obsidian 自动化方案", "limit": 5 }'`
  },
  {
    route: "index/status",
    method: "GET or POST",
    title: "查看索引状态",
    summary: "查看 embedding 配置是否就绪，以及当前索引包含多少文件和块。",
    scenarios: [
      "部署后确认 API Key、baseUrl、模型名是否已经配置完整。",
      "调试语义搜索前确认索引是否为空或是否需要重建。"
    ],
    params: [],
    curl: `curl http://localhost:8787/v1/api/index/status \\
  -H "Authorization: Bearer change-me"`
  },
  {
    route: "index/rebuild",
    method: "POST",
    title: "重建 embedding 索引",
    summary: "扫描允许目录下的 Markdown 文件，调用远程 embedding API，增量构建本地索引。",
    scenarios: [
      "首次部署后为 Vault 建立语义索引。",
      "修改 embedding 模型、baseUrl、切块大小后重新生成索引。",
      "Headless 从 Obsidian Sync 拉取了大量历史笔记后手动补偿索引。"
    ],
    params: [
      ["force", "可选布尔值。为 true 时忽略 hash 缓存，强制重新生成所有文件的 embedding。"]
    ],
    curl: `curl -X POST http://localhost:8787/v1/api/index/rebuild \\
  -H "Authorization: Bearer change-me" \\
  -H "Content-Type: application/json" \\
  -d '{ "force": false }'`
  },
  {
    route: "index/file",
    method: "POST",
    title: "索引单个文件",
    summary: "为单个 Markdown 文件重建 embedding 索引；文件不存在时会从索引中移除。",
    scenarios: [
      "外部同步或脚本刚修改了某篇笔记，只想更新这一篇。",
      "调试某个文件的切块和召回效果。"
    ],
    params: [
      ["path | filename | file | name", "目标 Markdown 文件。"]
    ],
    curl: `curl -X POST http://localhost:8787/v1/api/index/file \\
  -H "Authorization: Bearer change-me" \\
  -H "Content-Type: application/json" \\
  -d '{ "path": "Ideas/api-note.md" }'`
  },
  {
    route: "tags/list",
    method: "GET",
    title: "列出标签",
    summary: "统计允许目录下 Markdown hashtag 的出现次数。",
    scenarios: [
      "查看 capture 笔记中的标签分布。",
      "让 AI 从已有主题标签中选择合适标签。"
    ],
    params: [],
    curl: `curl http://localhost:8787/v1/api/tags/list \\
  -H "Authorization: Bearer change-me"`
  },
  {
    route: "batch",
    method: "POST",
    title: "批量操作",
    summary: "在一个请求中执行多个 API 操作。",
    scenarios: [
      "创建笔记后再设置 frontmatter。",
      "写入项目日志后，再给 daily note 追加一条引用。"
    ],
    params: [
      ["operations", "操作数组。每一项使用 route/action/op 指定接口，并附带对应参数。"]
    ],
    curl: `curl -X POST http://localhost:8787/v1/api/batch \\
  -H "Authorization: Bearer change-me" \\
  -H "Content-Type: application/json" \\
  -d '{
    "operations": [
      { "route": "files/write", "path": "Ideas/batch-demo.md", "content": "## Log\\n" },
      { "route": "headings/append", "path": "Ideas/batch-demo.md", "heading": "Log", "content": "Item" }
    ]
  }'`
  },
  {
    route: "uri/execute",
    method: "POST",
    title: "执行 Obsidian URI 兼容请求",
    summary: "解析 Obsidian URI，并在 Headless 模式下执行其中可映射到文件系统的部分。",
    scenarios: [
      "接收已有自动化中已经生成的 obsidian://new URI。",
      "把 URI 风格动作桥接到统一 API 命名空间。"
    ],
    params: [
      ["uri", "obsidian:// URI 字符串，也可以传 action 风格字段。"]
    ],
    curl: `curl -X POST http://localhost:8787/v1/api/uri/execute \\
  -H "Authorization: Bearer change-me" \\
  -H "Content-Type: application/json" \\
  -d '{ "uri": "obsidian://new?file=Ideas%2Furi-demo&content=Hello%20URI" }'`
  },
  {
    route: "unsupported/active",
    method: "GET or POST",
    title: "不支持：Active File",
    summary: "对桌面端专属的 active-file 行为返回明确的 unsupported 响应。",
    scenarios: [
      "兼容探测：某些客户端可能期望 Local REST API 的 active-file 路由存在。"
    ],
    params: [],
    curl: `curl http://localhost:8787/v1/api/active \\
  -H "Authorization: Bearer change-me"`
  },
  {
    route: "unsupported/commands",
    method: "GET or POST",
    title: "不支持：Commands",
    summary: "对桌面 Obsidian command 执行返回明确的 unsupported 响应。",
    scenarios: [
      "兼容探测：某些客户端可能期望 Local REST API 的 command 路由存在。"
    ],
    params: [],
    curl: `curl http://localhost:8787/v1/api/commands \\
  -H "Authorization: Bearer change-me"`
  }
];

export function normalizeApiRoute(route) {
  const normalized = route.replace(/^\/+|\/+$/g, "");
  return API_ALIASES[normalized] || normalized;
}

export function apiRouteNames() {
  return API_ENDPOINTS.map((endpoint) => endpoint.route);
}

export function renderApiDocs() {
  const lines = [
    "# API 参考",
    "",
    "本文件由 `src/api-spec.js` 自动生成。不要手工修改。",
    "",
    "所有操作接口都使用：",
    "",
    "```http",
    "/v1/api/<resource>/<action>",
    "Authorization: Bearer <API_TOKEN>",
    "```",
    "",
    "## 路由总览",
    "",
    "| 路由 | 方法 | 用途 |",
    "|---|---|---|"
  ];

  for (const endpoint of API_ENDPOINTS) {
    lines.push(`| \`${endpoint.route}\` | ${endpoint.method} | ${endpoint.summary} |`);
  }

  lines.push("", "## 短别名", "");
  lines.push("| 短别名 | 标准路由 |", "|---|---|");
  for (const [alias, route] of Object.entries(API_ALIASES)) {
    lines.push(`| \`${alias}\` | \`${route}\` |`);
  }

  for (const endpoint of API_ENDPOINTS) {
    lines.push("", `## ${endpoint.route}`, "");
    lines.push(`**${endpoint.title}**`, "");
    lines.push(endpoint.summary, "");
    lines.push(`方法：\`${endpoint.method}\``, "");

    if (endpoint.scenarios.length > 0) {
      lines.push("适用场景：", "");
      for (const scenario of endpoint.scenarios) {
        lines.push(`- ${scenario}`);
      }
      lines.push("");
    }

    if (endpoint.params.length > 0) {
      lines.push("参数：", "");
      lines.push("| 参数 | 说明 |", "|---|---|");
      for (const [name, description] of endpoint.params) {
        lines.push(`| \`${name}\` | ${description} |`);
      }
      lines.push("");
    }

    lines.push("示例：", "");
    lines.push("```bash", endpoint.curl, "```");
  }

  lines.push("");
  return `${lines.join("\n")}`;
}
