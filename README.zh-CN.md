# BlueNote (小蓝书) — 全栈社交媒体平台

[English](README.md) | **中文**

一个使用 Go(后端)与 React(前端)构建的全栈社交平台,通过 Docker Compose 在本地运行。

- 🌐 **在线演示:** http://118.178.189.111:8082
- 📖 **文档:** http://118.178.189.111:8083/bluenote/

---

## 目录

- [功能特性](#功能特性)
- [技术栈](#技术栈)
- [架构](#架构)
- [项目结构](#项目结构)
- [数据库设计](#数据库设计)
- [API 参考](#api-参考)
- [快速开始](#快速开始)
- [环境变量](#环境变量)
- [部署](#部署)

---

## 功能特性

- **用户认证** — 基于 JWT 的注册、登录、登出;通过邮箱验证码(OTP)重置密码
- **帖子** — 创建、编辑、删除帖子,支持文字、图片与标签;可见性控制(公开 / 仅关注者 / 私密)
- **社交关系** — 关注 / 取消关注用户;关注列表与粉丝列表
- **信息流** — 两种模式:时间线(基于游标的时间排序)与社区(HackerNews 衰减排序)
- **评论** — 支持嵌套层级评论,软删除
- **点赞** — 点赞 / 取消点赞(在数据库层面保证去重)
- **标签** — 话题标签系统,附带热门标签榜(Redis ZSet)
- **搜索** — 帖子全文搜索(PostgreSQL GIN 索引 + tsvector);用户搜索
- **图片上传** — 最大 10 MB(jpg / png / gif / webp),通过魔数(magic bytes)校验
- **通知** — 点赞、评论、回复的站内通知
- **内容举报** — 举报帖子或评论
- **限流** — 基于 IP 的 Redis 计数器(全局 60 次/分钟;上传 10 次/分钟)
- **推荐用户** — 缓存的用户推荐(Redis,10 分钟 TTL)
- **国际化(i18n)** — 带翻译支持的语言上下文(中 / 英双语)

---

## 技术栈

### 后端

| 组件       | 技术                         |
|------------|------------------------------|
| 语言       | Go 1.25                      |
| Web 框架   | Gin v1.11                    |
| ORM        | GORM v1.31                   |
| 数据库     | PostgreSQL 15                |
| 缓存       | Redis 7(go-redis v9)        |
| 认证       | JWT HS256(golang-jwt v5)    |
| UUID       | google/uuid v1.6             |
| 邮件       | Gmail SMTP                   |

### 前端

| 组件       | 技术                         |
|------------|------------------------------|
| 框架       | React 19                     |
| 语言       | TypeScript 5.9               |
| 路由       | React Router v7              |
| 构建工具   | Vite 7                       |
| 样式       | 原生 CSS(无 UI 框架)        |

### 基础设施

| 组件        | 技术                               |
|-------------|------------------------------------|
| 反向代理    | Nginx(alpine)                     |
| 容器化      | Docker Compose                     |
| 运行平台    | 本地(Docker Desktop / Docker Engine) |

---

## 架构

```
客户端(浏览器)
      │
      ▼
  Nginx :80 ──── /assets/*  ──► 静态文件(构建后的 React SPA)
               ── /api/*     ──► Go 后端 :8080
               ── /uploads/* ──► Go 后端 :8080(文件服务)
               ── /*         ──► index.html(SPA 兜底)

  Go 后端 :8080
      │
      ├── 路由(Gin)
      ├── 中间件(JWT 认证 + 限流)
      ├── 控制器 → 服务层 → DAO
      │
      ├── PostgreSQL 15  (持久化数据)
      └── Redis 7        (JWT 黑名单、限流、缓存、OTP)
```

### 后端分层架构

```
HTTP 请求
    ↓
router/router.go         ← Gin 路由注册
    ↓
middleware/auth.go       ← JWT 校验 + Redis 黑名单检查
middleware/ratelimit.go  ← 基于 IP 的 Redis 限流
    ↓
controller/              ← 请求解析、响应封装
    ↓
service/                 ← 业务逻辑、错误处理
    ↓
dao/                     ← 通过 GORM 执行 SQL 查询
    ↓
PostgreSQL / Redis
```

---

## 项目结构

```
/
├── docker-compose.yml          # 4 个服务:frontend、app、postgres、redis
├── .env                        # 密钥:JWT_SECRET、Gmail、BASE_URL
├── init.sql                    # 数据库表结构、索引、视图、触发器
│
├── backend/
│   ├── Dockerfile              # 多阶段:golang:1.25-alpine → alpine:3.21
│   └── my-backend/
│       ├── main.go
│       ├── go.mod / go.sum
│       ├── router/router.go    # 所有路由定义
│       ├── controller/         # HTTP 处理器
│       ├── service/            # 业务逻辑
│       ├── dao/                # 数据访问层
│       ├── model/              # GORM 结构体
│       ├── middleware/         # 认证 + 限流
│       ├── utils/              # JWT、邮件工具
│       └── conf/               # 数据库与 Redis 初始化
│
└── frontend/
    ├── Dockerfile              # 多阶段:node:22-alpine → nginx:alpine
    ├── nginx.conf              # SPA 兜底 + /api 代理
    └── my-app/
        └── src/
            ├── router/         # React Router 路由
            ├── pages/          # 页面组件(9 个页面)
            ├── components/     # 公共组件(PostCard)
            ├── api/            # API 客户端层
            ├── context/        # LanguageContext(i18n)
            ├── types/          # TypeScript 接口定义
            └── i18n/           # 翻译文案
```

---

## 数据库设计

### 数据表

| 表              | 主键                           | 说明                                     |
|-----------------|--------------------------------|------------------------------------------|
| `users`         | `user_id`(UUID)               | 用户账号                                 |
| `posts`         | `post_id`(UUID)               | 帖子,支持软删除与可见性控制             |
| `comments`      | `comment_id`(UUID)            | 嵌套评论,支持软删除                     |
| `follows`       | `(follower_id, followee_id)`   | 关注关系                                 |
| `likes`         | `(user_id, post_id)`           | 帖子点赞(通过复合主键去重)             |
| `tags`          | `tag_id`(UUID)                | 话题标签                                 |
| `post_tags`     | `(post_id, tag_id)`            | 帖子 ↔ 标签 多对多关系                   |
| `reports`       | `report_id`(UUID)             | 内容举报(同一举报人对同一对象唯一)     |
| `notifications` | `notification_id`(UUID)       | 点赞 / 评论 / 回复 通知                  |

### 视图

| 视图           | 说明                                              |
|----------------|---------------------------------------------------|
| `user_stats`   | 每位用户的统计:帖子数、评论数、关注数、粉丝数     |
| `post_details` | 每条帖子的聚合:点赞数、评论数、作者               |

### 关键设计决策

- `posts` 与 `comments` 采用 **软删除**,通过 `deleted_at` 时间戳标记(NULL 表示有效)
- `posts.content_tsv` 支持 **全文搜索**(TSVECTOR、GIN 索引,由触发器使用 `to_tsvector('simple', content)` 自动更新)
- `follows`、`likes`、`post_tags` 使用 **复合主键**,在数据库层面防止重复
- 针对 `deleted_at IS NULL` 的 **部分索引**,提升有效记录的查询效率
- 评论表通过 `parent_id` 自引用实现 **嵌套评论**
- **可见性控制**:`'public'` | `'followers'` | `'private'`,在 DAO 查询中强制执行

---

## API 参考

### 公开接口

| 方法   | 路径                                  | 说明                          |
|--------|---------------------------------------|-------------------------------|
| `POST` | `/api/register`                       | 创建新账号                    |
| `POST` | `/api/login`                          | 登录,返回 JWT                |
| `POST` | `/api/auth/password-reset/send-code`  | 向邮箱发送密码重置验证码      |
| `POST` | `/api/auth/password-reset/confirm`    | 使用验证码重置密码            |

### 需认证接口(需携带 Bearer JWT)

#### 认证
| 方法     | 路径          | 说明                                        |
|----------|---------------|---------------------------------------------|
| `POST`   | `/api/logout` | 使令牌失效(将 JTI 加入 Redis 黑名单)      |

#### 信息流
| 方法   | 路径              | 说明                                                              |
|--------|-------------------|-------------------------------------------------------------------|
| `GET`  | `/api/feed/home`  | 首页信息流:用户卡片、帖子、热门标签、推荐用户                    |
| `GET`  | `/api/feed/posts` | 分页帖子(`?sort=timeline\|community&cursor=...&limit=...`)       |

#### 帖子
| 方法     | 路径                                              | 说明                               |
|----------|---------------------------------------------------|------------------------------------|
| `POST`   | `/api/posts`                                      | 创建帖子(内容、图片、标签、可见性) |
| `PUT`    | `/api/posts/:id`                                  | 编辑帖子                           |
| `DELETE` | `/api/posts/:id`                                  | 软删除帖子                         |
| `POST`   | `/api/posts/:id/like`                             | 点赞帖子                           |
| `DELETE` | `/api/posts/:id/like`                             | 取消点赞                           |
| `GET`    | `/api/posts/:id/comments`                         | 获取评论(嵌套)                   |
| `POST`   | `/api/posts/:id/comments`                         | 创建评论(可选 `parent_id`)       |
| `DELETE` | `/api/posts/:id/comments/:comment_id`             | 删除评论                           |
| `POST`   | `/api/posts/:id/report`                           | 举报帖子                           |
| `POST`   | `/api/posts/:id/comments/:comment_id/report`      | 举报评论                           |

#### 用户与社交
| 方法     | 路径                                  | 说明                                  |
|----------|---------------------------------------|---------------------------------------|
| `GET`    | `/api/users/:id`                      | 获取用户主页 + 帖子                   |
| `GET`    | `/api/users/:id/following`            | 获取该用户关注的人                     |
| `GET`    | `/api/users/:id/followers`            | 获取该用户的粉丝                       |
| `POST`   | `/api/users/:id/follow`               | 关注用户                              |
| `DELETE` | `/api/users/:id/follow`               | 取消关注                              |
| `PUT`    | `/api/users/me`                       | 更新自己的资料                        |
| `DELETE` | `/api/users/me`                       | 删除账号                              |
| `POST`   | `/api/users/me/password/send-code`    | 发送修改密码验证码                     |
| `POST`   | `/api/users/me/password/confirm`      | 使用验证码确认修改密码                 |

#### 搜索、标签与上传
| 方法   | 路径                     | 说明                                   |
|--------|--------------------------|----------------------------------------|
| `GET`  | `/api/search/users`      | 按名称搜索用户                         |
| `GET`  | `/api/search/posts`      | 帖子全文搜索                           |
| `GET`  | `/api/tags/:name/posts`  | 指定标签下的帖子                       |
| `POST` | `/api/upload/image`      | 上传图片(最大 10 MB,10 次/分钟/IP)  |

#### 通知
| 方法   | 路径                               | 说明               |
|--------|------------------------------------|--------------------|
| `GET`  | `/api/notifications`               | 获取全部通知       |
| `GET`  | `/api/notifications/unread-count`  | 获取未读数量       |
| `POST` | `/api/notifications/read-all`      | 全部标记为已读     |

---

## 快速开始

### 前置条件

- [Docker](https://docs.docker.com/get-docker/) 与 Docker Compose
- 一个已启用 [应用专用密码](https://support.google.com/accounts/answer/185833) 的 Gmail 账号

### 1. 克隆仓库

```bash
git clone https://github.com/jndyszy/bluenote.git
cd bluenote
```

### 2. 配置环境变量

在项目根目录创建 `.env` 文件:

```env
JWT_SECRET=your-secret-key-here
GMAIL_FROM=your-email@gmail.com
GMAIL_PASSWORD=your-app-specific-password
BASE_URL=http://your-server-ip-or-domain
```

> **提示:** `DATABASE_URL` 与 `REDIS_ADDR` 由 `docker-compose.yml` 自动注入。

### 3. 启动服务

```bash
docker compose up --build -d
```

将启动 4 个容器:

| 容器       | 说明                                         | 端口              |
|------------|----------------------------------------------|-------------------|
| `frontend` | Nginx 提供 React SPA                         | `80`(对外)      |
| `app`      | Go 后端                                      | `8080`(内网)    |
| `postgres` | PostgreSQL 15(数据持久化于 `pgdata`)        | 内网              |
| `redis`    | Redis 7(数据持久化于 `redisdata`)           | 内网              |

### 4. 打开应用

访问 `http://localhost`。

### 常用命令

```bash
# 查看所有服务日志
docker compose logs -f

# 查看指定服务日志
docker compose logs -f app

# 停止所有服务
docker compose down

# 停止并删除数据卷(清空所有数据)
docker compose down -v

# 修改代码后重新构建单个服务
docker compose up --build app -d
```

---

## 环境变量

| 变量              | 是否必填 | 说明                                                                 |
|-------------------|----------|----------------------------------------------------------------------|
| `JWT_SECRET`      | 是       | HS256 JWT 签名密钥                                                    |
| `GMAIL_FROM`      | 是       | 用于发送 OTP 邮件的 Gmail 地址                                        |
| `GMAIL_PASSWORD`  | 是       | Gmail 应用专用密码(不是常规登录密码)                                |
| `BASE_URL`        | 是       | 上传图片的 URL 前缀(本地部署:`http://localhost`)                   |
| `DATABASE_URL`    | 自动     | 由 docker-compose 设置;PostgreSQL 连接串                            |
| `REDIS_ADDR`      | 自动     | 由 docker-compose 设置;Redis 地址(`redis:6379`)                   |
| `UPLOAD_DIR`      | 可选     | 上传目录路径(默认 `./uploads`)                                     |

---

## Redis 键参考

| 键模式                           | 用途                              | TTL                  |
|----------------------------------|-----------------------------------|----------------------|
| `token:blacklist:{jti}`          | 登出 JWT 黑名单                   | 令牌剩余有效期       |
| `ratelimit:{ip}`                 | 全局 API 限流计数器               | 1 分钟               |
| `ratelimit:upload:{ip}`          | 上传限流计数器                    | 1 分钟               |
| `ratelimit:otp:{email}`          | OTP 发送限流                      | 可配置               |
| `otp:password-reset:{email}`     | 密码重置 OTP                      | 10 分钟              |
| `hot:tags`                       | 热门标签有序集合(ZSet)          | 持久                 |
| `recommend:users:{user_id}`      | 推荐用户缓存                      | 10 分钟              |

---

## 部署

### Docker 镜像细节

**后端**(`backend/Dockerfile`)
- 构建阶段:`golang:1.25-alpine` —— 使用 `CGO_ENABLED=0` 编译为完全静态的二进制
- 运行阶段:`alpine:3.21`,包含 `ca-certificates` 与 `tzdata`
- 通过 `-ldflags="-s -w"` 压缩二进制体积

**前端**(`frontend/Dockerfile`)
- 构建阶段:`node:22-alpine` —— 执行 `npm ci` 后 `npm run build`
- 运行阶段:`nginx:alpine` —— 提供静态资源,并将 `/api/*` 与 `/uploads/*` 代理到后端

> 本项目目前仅在本地运行 —— 配置步骤见 [部署指南.md](部署指南.md)。若后续要公开部署,请设置强 `JWT_SECRET`、收紧 CORS、将 `BASE_URL` 指向你的域名/IP、启用 SSL/TLS,并备份 `uploads` 数据卷。

---

## 前端页面

| 路由              | 页面             | 是否需登录 |
|-------------------|------------------|:---:|
| `/`               | 登录             | 否  |
| `/register`       | 注册             | 否  |
| `/forgot-password`| 忘记密码         | 否  |
| `/reset-password` | 重置密码         | 否  |
| `/home`           | 首页信息流       | 是  |
| `/users/:id`      | 用户主页         | 是  |
| `/profile/edit`   | 编辑资料         | 是  |
| `/search`         | 搜索             | 是  |
| `/tags/:name`     | 标签帖子         | 是  |

---

## 许可

本项目仅供个人 / 教育用途。
