# BlueNote MCP Server

[English](#english) | [中文](#中文)

---

## English

An [MCP](https://modelcontextprotocol.io) server that wraps the BlueNote REST API as tools, so an AI assistant (e.g. Claude) can operate the platform — read the feed, search, post, comment, like, and more.

- **Transport:** Streamable HTTP (stateless — a fresh server/transport per request)
- **Stack:** TypeScript + `@modelcontextprotocol/sdk`, Node 24
- **Auth:** call `login` to get a JWT, then pass that `token` to the other tools. Nothing is stored server-side and no credentials are hard-coded.

### Tools

| Tool | Description |
|------|-------------|
| `login` | Log in with email + password, returns a JWT |
| `get_feed` | Paginated feed (`sort`: timeline / community) |
| `search_posts` / `search_users` | Keyword search |
| `get_post_comments` | A post's (nested) comments |
| `create_post` | Publish a post (content, tags, images, visibility) |
| `comment` | Comment / reply on a post |
| `like` / `unlike` | Like / unlike a post |
| `get_user` | A user's profile + posts |
| `get_notifications` | Current user's notifications |

#### Admin tools

These require an **admin / super_admin** account. The restriction is enforced server-side (backend `RequireAdmin` / `RequireSuperAdmin`): a normal account's token gets HTTP 403, surfaced as a tool error.

| Tool | Description |
|------|-------------|
| `admin_list_reports` | List content reports (status: pending / removed / dismissed) |
| `admin_resolve_report` | Resolve a report (remove / dismiss) |
| `admin_list_users` | List / search users (by name/email, role) |
| `admin_ban_user` / `admin_unban_user` | Ban / unban an account |
| `admin_restrict_user` / `admin_unrestrict_user` | Restrict / unrestrict posting |
| `admin_delete_user` | Delete a user account (irreversible) |
| `admin_delete_post` / `admin_delete_comment` | Delete any post / comment |
| `admin_promote_user` / `admin_demote_user` | Grant / revoke admin role (**super_admin** only) |

### Configuration

| Env | Default | Description |
|-----|---------|-------------|
| `BLUENOTE_API_BASE` | `http://app:8080` | Backend base URL |
| `PORT` | `8084` | Listen port |
| `MCP_PATH` | `/mcp` | Endpoint path |

### Run with Docker

```bash
docker build -t bluenote-mcp:latest .

# Join the BlueNote compose network so it can reach the backend at app:8080
docker run -d --name bluenote-mcp --restart unless-stopped \
  --network bluenote-main_default \
  -e BLUENOTE_API_BASE=http://app:8080 \
  -e PORT=8084 \
  -p 8084:8084 \
  bluenote-mcp:latest
```

### Run locally (without Docker)

```bash
npm install
npm run build
BLUENOTE_API_BASE=http://localhost:8080 npm start
```

### Connect from Claude Code

```json
{
  "mcpServers": {
    "bluenote": { "type": "http", "url": "http://YOUR_HOST:8084/mcp" }
  }
}
```

For stdio-only clients, bridge with: `npx mcp-remote http://YOUR_HOST:8084/mcp`

> ⚠️ The endpoint has no transport-level auth — anyone with the URL and a platform account can call it. Put it behind a gateway token or IP allowlist before relying on it in production.

---

## 中文

一个 [MCP](https://modelcontextprotocol.io) 服务,把 BlueNote 的 REST API 封装成工具,让 AI 助手(如 Claude)能直接操作这个平台——看信息流、搜索、发帖、评论、点赞等。

- **传输:** Streamable HTTP(无状态,每个请求新建 server/transport)
- **技术栈:** TypeScript + `@modelcontextprotocol/sdk`,Node 24
- **鉴权:** 先调 `login` 拿 JWT,之后的工具带上这个 `token`。服务端不存任何状态,也不硬编码账号密码。

### 工具列表

| 工具 | 说明 |
|------|------|
| `login` | 邮箱+密码登录,返回 JWT |
| `get_feed` | 分页信息流(`sort`:timeline / community) |
| `search_posts` / `search_users` | 关键词搜索 |
| `get_post_comments` | 某帖子的(嵌套)评论 |
| `create_post` | 发帖(内容、标签、图片、可见性) |
| `comment` | 评论 / 回复 |
| `like` / `unlike` | 点赞 / 取消点赞 |
| `get_user` | 用户主页 + 帖子 |
| `get_notifications` | 当前用户的通知 |

#### 管理员工具

以下工具需要 **admin / super_admin** 账号。该限制由**后端强制**(`RequireAdmin` / `RequireSuperAdmin` 中间件):普通账号的 token 调用会得到 HTTP 403,在工具里表现为报错。

| 工具 | 说明 |
|------|------|
| `admin_list_reports` | 举报列表(status:pending / removed / dismissed) |
| `admin_resolve_report` | 处理举报(remove 下架 / dismiss 驳回) |
| `admin_list_users` | 用户列表 / 搜索(按名称或邮箱、角色) |
| `admin_ban_user` / `admin_unban_user` | 封号 / 解封 |
| `admin_restrict_user` / `admin_unrestrict_user` | 限制 / 解除发帖限制 |
| `admin_delete_user` | 删除用户账号(不可恢复) |
| `admin_delete_post` / `admin_delete_comment` | 删除任意帖子 / 评论 |
| `admin_promote_user` / `admin_demote_user` | 任免管理员(**仅 super_admin**) |

### 配置项

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| `BLUENOTE_API_BASE` | `http://app:8080` | 后端地址 |
| `PORT` | `8084` | 监听端口 |
| `MCP_PATH` | `/mcp` | 端点路径 |

### 用 Docker 运行

```bash
docker build -t bluenote-mcp:latest .

# 接入 BlueNote 的 compose 网络,以便通过 app:8080 访问后端
docker run -d --name bluenote-mcp --restart unless-stopped \
  --network bluenote-main_default \
  -e BLUENOTE_API_BASE=http://app:8080 \
  -e PORT=8084 \
  -p 8084:8084 \
  bluenote-mcp:latest
```

### 本地运行(不用 Docker)

```bash
npm install
npm run build
BLUENOTE_API_BASE=http://localhost:8080 npm start
```

### 在 Claude Code 里连接

```json
{
  "mcpServers": {
    "bluenote": { "type": "http", "url": "http://你的主机:8084/mcp" }
  }
}
```

仅支持 stdio 的客户端可用:`npx mcp-remote http://你的主机:8084/mcp` 桥接。

> ⚠️ 该端点没有传输层鉴权——任何人拿到 URL + 一个平台账号即可调用。正式依赖前请加网关 token 或 IP 白名单。
