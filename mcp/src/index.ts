/**
 * BlueNote (小蓝书) MCP server
 *
 * Wraps the BlueNote REST API as MCP tools over the Streamable HTTP transport.
 * Stateless: a fresh MCP server + transport is created per request, so it works
 * behind simple HTTP load balancers and needs no sticky sessions.
 *
 * Auth model: call `login` to obtain a JWT, then pass that `token` to the other
 * tools. Nothing is stored server-side and no credentials are hard-coded.
 *
 * Env:
 *   BLUENOTE_API_BASE  backend base URL (default http://app:8080)
 *   PORT               listen port       (default 8084)
 *   MCP_PATH           endpoint path      (default /mcp)
 */
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const API_BASE = (process.env.BLUENOTE_API_BASE ?? "http://app:8080").replace(/\/$/, "");
const PORT = Number(process.env.PORT ?? 8084);
const MCP_PATH = process.env.MCP_PATH ?? "/mcp";

type ApiOpts = { method?: string; token?: string; body?: unknown; query?: Record<string, unknown> };

async function api(path: string, opts: ApiOpts = {}): Promise<any> {
  const { method = "GET", token, body, query } = opts;
  let url = `${API_BASE}${path}`;
  if (query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
    }
    const s = qs.toString();
    if (s) url += `?${s}`;
  }
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = data && typeof data === "object" && data.error ? data.error : `HTTP ${res.status}`;
    throw new Error(`${msg} (${method} ${path})`);
  }
  return data;
}

function ok(data: unknown) {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: "text" as const, text }] };
}
function fail(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
}

function buildServer(): McpServer {
  const server = new McpServer({ name: "bluenote-mcp", version: "1.1.0" });

  server.registerTool(
    "login",
    {
      description:
        "Log in to BlueNote with email + password and get a JWT. Pass the returned `token` to the other tools.",
      inputSchema: {
        email: z.string().email().describe("Account email"),
        password: z.string().describe("Account password"),
      },
    },
    async ({ email, password }) => {
      try {
        const data = await api("/api/login", { method: "POST", body: { email, password } });
        return ok({ token: data.token, user: data.user });
      } catch (e) { return fail(e); }
    },
  );

  server.registerTool(
    "get_feed",
    {
      description: "Get a paginated feed of posts. sort: 'timeline' (newest) or 'community' (ranked).",
      inputSchema: {
        token: z.string().describe("JWT from login"),
        sort: z.enum(["timeline", "community"]).optional(),
        cursor: z.string().optional().describe("Pagination cursor from a previous call"),
        limit: z.number().int().positive().max(50).optional(),
      },
    },
    async ({ token, sort, cursor, limit }) => {
      try {
        return ok(await api("/api/feed/posts", { token, query: { sort, cursor, limit } }));
      } catch (e) { return fail(e); }
    },
  );

  server.registerTool(
    "search_posts",
    {
      description: "Full-text search posts by keyword.",
      inputSchema: {
        token: z.string().describe("JWT from login"),
        q: z.string().describe("Search keyword"),
        limit: z.number().int().positive().max(50).optional(),
        cursor: z.string().optional(),
      },
    },
    async ({ token, q, limit, cursor }) => {
      try {
        return ok(await api("/api/search/posts", { token, query: { q, limit, cursor } }));
      } catch (e) { return fail(e); }
    },
  );

  server.registerTool(
    "search_users",
    {
      description: "Search users by name.",
      inputSchema: {
        token: z.string().describe("JWT from login"),
        q: z.string().describe("Search keyword"),
        limit: z.number().int().positive().max(50).optional(),
      },
    },
    async ({ token, q, limit }) => {
      try {
        return ok(await api("/api/search/users", { token, query: { q, limit } }));
      } catch (e) { return fail(e); }
    },
  );

  server.registerTool(
    "get_post_comments",
    {
      description: "Get the (nested) comments of a post.",
      inputSchema: {
        token: z.string().describe("JWT from login"),
        post_id: z.string().describe("Post UUID"),
      },
    },
    async ({ token, post_id }) => {
      try {
        return ok(await api(`/api/posts/${post_id}/comments`, { token }));
      } catch (e) { return fail(e); }
    },
  );

  server.registerTool(
    "create_post",
    {
      description: "Publish a new post. visibility: public | followers | private (default public).",
      inputSchema: {
        token: z.string().describe("JWT from login"),
        content: z.string().min(1).describe("Post text"),
        tags: z.array(z.string()).optional(),
        image_urls: z.array(z.string()).optional(),
        visibility: z.enum(["public", "followers", "private"]).optional(),
      },
    },
    async ({ token, content, tags, image_urls, visibility }) => {
      try {
        return ok(await api("/api/posts", {
          method: "POST",
          token,
          body: { content, tags, image_urls, visibility },
        }));
      } catch (e) { return fail(e); }
    },
  );

  server.registerTool(
    "comment",
    {
      description: "Comment on a post. Provide parent_id to reply to another comment.",
      inputSchema: {
        token: z.string().describe("JWT from login"),
        post_id: z.string().describe("Post UUID"),
        content: z.string().min(1),
        parent_id: z.string().optional().describe("Parent comment UUID, for a reply"),
      },
    },
    async ({ token, post_id, content, parent_id }) => {
      try {
        return ok(await api(`/api/posts/${post_id}/comments`, {
          method: "POST",
          token,
          body: { content, parent_id },
        }));
      } catch (e) { return fail(e); }
    },
  );

  server.registerTool(
    "like",
    {
      description: "Like a post.",
      inputSchema: {
        token: z.string().describe("JWT from login"),
        post_id: z.string().describe("Post UUID"),
      },
    },
    async ({ token, post_id }) => {
      try {
        return ok(await api(`/api/posts/${post_id}/like`, { method: "POST", token }));
      } catch (e) { return fail(e); }
    },
  );

  server.registerTool(
    "unlike",
    {
      description: "Remove a like from a post.",
      inputSchema: {
        token: z.string().describe("JWT from login"),
        post_id: z.string().describe("Post UUID"),
      },
    },
    async ({ token, post_id }) => {
      try {
        return ok(await api(`/api/posts/${post_id}/like`, { method: "DELETE", token }));
      } catch (e) { return fail(e); }
    },
  );

  server.registerTool(
    "get_user",
    {
      description: "Get a user's profile and their posts.",
      inputSchema: {
        token: z.string().describe("JWT from login"),
        user_id: z.string().describe("User UUID"),
      },
    },
    async ({ token, user_id }) => {
      try {
        return ok(await api(`/api/users/${user_id}`, { token }));
      } catch (e) { return fail(e); }
    },
  );

  server.registerTool(
    "get_notifications",
    {
      description: "Get the current user's notifications (likes, comments, replies).",
      inputSchema: {
        token: z.string().describe("JWT from login"),
      },
    },
    async ({ token }) => {
      try {
        return ok(await api("/api/notifications", { token }));
      } catch (e) { return fail(e); }
    },
  );

  // ── Admin tools ────────────────────────────────────────────────
  // These require an admin / super_admin account. The restriction is enforced
  // server-side (backend RequireAdmin / RequireSuperAdmin middleware): a normal
  // account's token gets HTTP 403, surfaced here as an error.

  server.registerTool(
    "admin_list_reports",
    {
      description: "[Admin] List content reports. status: pending | removed | dismissed (omit for all).",
      inputSchema: {
        token: z.string().describe("JWT of an admin account"),
        status: z.enum(["pending", "removed", "dismissed"]).optional(),
        limit: z.number().int().positive().max(100).optional(),
        offset: z.number().int().nonnegative().optional(),
      },
    },
    async ({ token, status, limit, offset }) => {
      try { return ok(await api("/api/admin/reports", { token, query: { status, limit, offset } })); }
      catch (e) { return fail(e); }
    },
  );

  server.registerTool(
    "admin_resolve_report",
    {
      description: "[Admin] Resolve a report. action: 'remove' (take down the content) or 'dismiss'.",
      inputSchema: {
        token: z.string().describe("JWT of an admin account"),
        report_id: z.string(),
        action: z.enum(["remove", "dismiss"]),
      },
    },
    async ({ token, report_id, action }) => {
      try { return ok(await api(`/api/admin/reports/${report_id}/resolve`, { method: "POST", token, body: { action } })); }
      catch (e) { return fail(e); }
    },
  );

  server.registerTool(
    "admin_list_users",
    {
      description: "[Admin] List / search users. query: username or email; role: user | admin | super_admin.",
      inputSchema: {
        token: z.string().describe("JWT of an admin account"),
        query: z.string().optional(),
        role: z.enum(["user", "admin", "super_admin"]).optional(),
        limit: z.number().int().positive().max(100).optional(),
        offset: z.number().int().nonnegative().optional(),
      },
    },
    async ({ token, query, role, limit, offset }) => {
      try { return ok(await api("/api/admin/users", { token, query: { query, role, limit, offset } })); }
      catch (e) { return fail(e); }
    },
  );

  server.registerTool(
    "admin_ban_user",
    {
      description: "[Admin] Ban a user (the account can no longer log in). A reason is required.",
      inputSchema: { token: z.string(), user_id: z.string(), reason: z.string().min(1) },
    },
    async ({ token, user_id, reason }) => {
      try { return ok(await api(`/api/admin/users/${user_id}/ban`, { method: "POST", token, body: { reason } })); }
      catch (e) { return fail(e); }
    },
  );

  server.registerTool(
    "admin_unban_user",
    {
      description: "[Admin] Lift a ban on a user.",
      inputSchema: { token: z.string(), user_id: z.string() },
    },
    async ({ token, user_id }) => {
      try { return ok(await api(`/api/admin/users/${user_id}/unban`, { method: "POST", token })); }
      catch (e) { return fail(e); }
    },
  );

  server.registerTool(
    "admin_restrict_user",
    {
      description: "[Admin] Restrict a user from posting/commenting (can still log in and browse). A reason is required.",
      inputSchema: { token: z.string(), user_id: z.string(), reason: z.string().min(1) },
    },
    async ({ token, user_id, reason }) => {
      try { return ok(await api(`/api/admin/users/${user_id}/restrict`, { method: "POST", token, body: { reason } })); }
      catch (e) { return fail(e); }
    },
  );

  server.registerTool(
    "admin_unrestrict_user",
    {
      description: "[Admin] Remove a user's posting restriction.",
      inputSchema: { token: z.string(), user_id: z.string() },
    },
    async ({ token, user_id }) => {
      try { return ok(await api(`/api/admin/users/${user_id}/unrestrict`, { method: "POST", token })); }
      catch (e) { return fail(e); }
    },
  );

  server.registerTool(
    "admin_delete_user",
    {
      description: "[Admin] Permanently delete a user account. Irreversible.",
      inputSchema: { token: z.string(), user_id: z.string() },
    },
    async ({ token, user_id }) => {
      try { return ok(await api(`/api/admin/users/${user_id}`, { method: "DELETE", token })); }
      catch (e) { return fail(e); }
    },
  );

  server.registerTool(
    "admin_delete_post",
    {
      description: "[Admin] Delete any post by id (content moderation).",
      inputSchema: { token: z.string(), post_id: z.string() },
    },
    async ({ token, post_id }) => {
      try { return ok(await api(`/api/admin/posts/${post_id}`, { method: "DELETE", token })); }
      catch (e) { return fail(e); }
    },
  );

  server.registerTool(
    "admin_delete_comment",
    {
      description: "[Admin] Delete any comment by id (content moderation).",
      inputSchema: { token: z.string(), comment_id: z.string() },
    },
    async ({ token, comment_id }) => {
      try { return ok(await api(`/api/admin/comments/${comment_id}`, { method: "DELETE", token })); }
      catch (e) { return fail(e); }
    },
  );

  server.registerTool(
    "admin_promote_user",
    {
      description: "[Super admin] Promote a user to admin. Requires a super_admin account.",
      inputSchema: { token: z.string(), user_id: z.string() },
    },
    async ({ token, user_id }) => {
      try { return ok(await api(`/api/admin/users/${user_id}/promote`, { method: "POST", token })); }
      catch (e) { return fail(e); }
    },
  );

  server.registerTool(
    "admin_demote_user",
    {
      description: "[Super admin] Remove a user's admin role. Requires a super_admin account.",
      inputSchema: { token: z.string(), user_id: z.string() },
    },
    async ({ token, user_id }) => {
      try { return ok(await api(`/api/admin/users/${user_id}/demote`, { method: "POST", token })); }
      catch (e) { return fail(e); }
    },
  );

  return server;
}

const app = express();
app.use(express.json());

app.post(MCP_PATH, async (req, res) => {
  try {
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => { transport.close(); server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP request error:", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

const methodNotAllowed = (_req: express.Request, res: express.Response) =>
  res.status(405).set("Allow", "POST").json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed. Use POST." },
    id: null,
  });
app.get(MCP_PATH, methodNotAllowed);
app.delete(MCP_PATH, methodNotAllowed);

app.get("/health", (_req, res) => res.json({ ok: true, service: "bluenote-mcp", apiBase: API_BASE }));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`bluenote-mcp listening on 0.0.0.0:${PORT}${MCP_PATH} (api base: ${API_BASE})`);
});
