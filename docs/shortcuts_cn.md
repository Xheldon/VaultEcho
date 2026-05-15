# Apple 快捷指令用法

英文版：[shortcuts.md](shortcuts.md)。

这些方案把 Apple 快捷指令当作 VaultEcho 的轻量采集客户端。

仓库里已经包含两个可导入的初始快捷指令：

- [VaultEcho Daily Text Capture.shortcut](../shortcuts/VaultEcho%20Daily%20Text%20Capture.shortcut)
- [VaultEcho Daily Voice Capture.shortcut](../shortcuts/VaultEcho%20Daily%20Voice%20Capture.shortcut)

它们已经通过 macOS `shortcuts sign --mode anyone` 签名，里面使用的是占位配置：

- URL: `https://YOUR_DOMAIN/v1/api/daily/append-by-time`
- Token: `Bearer CHANGE_ME_API_TOKEN`

导入后，编辑 `获取 URL 内容` 动作，把 URL 和 Token 换成你自己的 VaultEcho 域名和 API Token。也可以用下面的命令按自己的占位值重新生成：

```bash
VAULTECHO_SHORTCUT_BASE_URL=https://vault.example.com \
VAULTECHO_SHORTCUT_API_TOKEN=change-me \
npm run shortcuts:generate
```

不要把包含真实 API Token 的快捷指令文件提交到仓库。

## 基础变量

建议在每个快捷指令开头设置这些变量，或者单独做一个共享的辅助快捷指令：

- `VaultEcho URL`: `https://vault.example.com`
- `API Token`: `.env` 里的 `API_TOKEN`
- `Endpoint`: 通常是 `/v1/api/daily/append-by-time`

公网访问时请使用 HTTPS。不要把自己的 API Token 分享出去。VaultEcho 是单用户、单 Vault 工具；如果给朋友试用，最好让每个人部署自己的实例，除非你明确希望他们写入你的 Vault。

## 推荐的 Daily 接口

时间戳日记采集推荐统一使用：

```http
POST /v1/api/daily/append-by-time
Authorization: Bearer <API_TOKEN>
Content-Type: application/json
```

请求体：

```json
{
  "content": "采集到的文本",
  "idempotencyKey": "shortcut-unique-id"
}
```

这样快捷指令只负责采集文本，VaultEcho 根据 Web UI 配置决定日记文件路径、heading 层级、当前时间段 heading、时间戳格式、模板和空行策略。

当你的目标是“按当前时间写入对应时间段 heading”，就用这个接口。如果你要“不管时间，固定写入某个 heading”，可以使用 `headings/insert-after-last-matching-line` 并让快捷指令自己计算当天日记路径；或者在 Daily 配置里建一个覆盖全天的时间段，让它指向这个固定 heading。

## 方案 1：Action Button 文本快记

场景：按下 Action Button，输入一句想法，追加到今天日记的当前时间段 heading 下。

快捷指令动作：

1. `询问输入`
   - 提示：`Capture`
   - 输入类型：`文本`
2. `获取 URL 内容`
   - URL：`VaultEcho URL` + `/v1/api/daily/append-by-time`
   - 方法：`POST`
   - Header：
     - `Authorization`: `Bearer API Token`
     - `Content-Type`: `application/json`
   - 请求体：`JSON`
     - `content`: `提供的输入`
     - `idempotencyKey`: `当前日期`，格式化为 `yyyyMMdd-HHmmss`
3. `显示通知`
   - 文本：`已写入今日笔记`

然后在 iPhone 设置里把这个快捷指令绑定到 Action Button。

## 方案 2：Action Button 语音快记

场景：按下 Action Button，说一句想法，快捷指令转文本后追加到今天日记。

快捷指令动作：

1. `听写文本`
   - 语言：你的常用语言
   - 停止听写：`暂停后`
2. `获取 URL 内容`
   - URL：`VaultEcho URL` + `/v1/api/daily/append-by-time`
   - 方法：`POST`
   - Header：
     - `Authorization`: `Bearer API Token`
     - `Content-Type`: `application/json`
   - 请求体：`JSON`
     - `content`: `听写文本`
     - `idempotencyKey`: `当前日期`，格式化为 `yyyyMMdd-HHmmss`
3. `显示通知`
   - 文本：`语音已写入`

这个方案使用 Apple 快捷指令内置的语音转文本。VaultEcho 收到的是文本，不是原始音频。

## 方案 3：分享菜单写入 Daily

场景：从其他 App 分享选中文本、链接或片段，写入今天日记。

快捷指令设置：

- 打开 `在共享表单中显示`。
- 接收输入类型：`文本`、`URL`。

快捷指令动作：

1. `从输入中获取文本`
2. `文本`
   - 可选格式：
     ```text
     {{快捷指令输入}}
     ```
3. `获取 URL 内容`
   - URL：`VaultEcho URL` + `/v1/api/daily/append-by-time`
   - 方法：`POST`
   - Header：
     - `Authorization`: `Bearer API Token`
     - `Content-Type`: `application/json`
   - 请求体：`JSON`
     - `content`: 格式化后的文本
     - `idempotencyKey`: `当前日期`，格式化为 `yyyyMMdd-HHmmss`

## 方案 4：Inbox 追加

场景：不写入日记，只把原始想法追加到一个统一 Inbox 文件。

接口：

```http
POST /v1/api/files/append
```

请求体：

```json
{
  "path": "Inbox/Shortcuts.md",
  "content": "\n- 采集到的文本"
}
```

如果你不需要时间段路由，用这个方案更直接。类似日记的记录，优先用 `daily/append-by-time`。

## 排查

- `401 Unauthorized`: 检查 `Authorization` header，必须是 `Bearer <API_TOKEN>`。
- `Top-level directory is not allowed`: 把目标路径的第一个目录加入 `Allowed Top-Level Dirs`。
- 日记创建到了错误目录：检查 Web UI 里的日记路径模板。
- 写入了错误 heading：检查时区和时间段配置，时间段不能重叠。
- 局域网可用、外网不可用：通过 HTTPS 反代或 Cloudflare Tunnel 暴露服务，不要直接开放 `8787`。
