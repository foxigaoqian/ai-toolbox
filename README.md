# 创作云 AI Toolbox

本仓库运行在 **Cloudflare Workers**，覆盖四阶段工具导航：AI 图文（17）、AI 图片（11）、AI 电商设计（13）、AI 视频（5）。

## 线上地址

https://ai-toolbox.foxigaoqian-soocly.workers.dev/

## V0.2 真实可用能力

- **8 个浏览器本地工具：** 指定文案图文、单篇大字报、热门标题规则生成、封面设计、图片裁剪、调整尺寸、压缩、拼图。
- **6 个真实 AI 文案入口：** 一句话图文、同款参考仿写（粘贴参考内容）、多内容仿写、人设图文、爆款文案、公众号长图文的文案生成功能。模型：Cloudflare Workers AI Llama 3.1 8B Fast。
- **2 个真实后台批量入口：** AI 批量超级图文、批量大字报图文（当前为每行主题分别生成**文案**，不是自动完整生图；2–4篇/任务）。
- **作品中心：** D1 存储生成文案，支持修改后持久化、查看历史；图片可手动保存到私有 R2 桶，并从同浏览器找回。
- **Cloudflare Queues：** 批量任务由后台消费并保存到 D1，可按任务 ID 查询进度。用户无需持续保持页面开启。
- **保护机制：** 生成 API 每个浏览器单篇 4次/天，批量6篇/天；全站每日 AI 推理合计最多30次。图片保存最多 4MB/张、每浏览器12张/天、全站70张/天。

**尚未完成：** 正式邮箱用户登录/跨设备账号、收费积分、AI 图片生成与修图、电商套图、视频生成、图文自动多页设计及发布。剩余入口会显示未接入，不会伪造 AI 结果。

**隐私注意：** 目前是匿名会话，靠 Secure、HttpOnly Cookie 识别，每次生成自动绑定该浏览器。更换设备、清除 Cookie 或会话过期后无法访问原来的私人作品；需要长期保存请下载本地。正式账号系统将在后续开发。

## 架构

- 前端：Worker 中内嵌响应式 HTML / CSS / 原生 JS / Canvas
- 接口：Worker fetch handler，AI 单篇生成与保存采用 D1
- 异步任务：Cloudflare Queues + Worker queue handler + D1 batches/batch_items
- 素材：私有 Cloudflare R2，所有 GET 均校验会话与 owner
- 模型：Workers AI `@cf/meta/llama-3.1-8b-instruct-fast`
- 数据保护：服务端验证入参、图片 magic bytes 校验、D1 参数绑定、同源会话 Cookie 与全局预算上限

## 主要 API

| Method | Endpoint | 用途 |
| --- | --- | --- |
| GET | /api/health | 服务健康及工具数 |
| GET | /api/tools | 全工具目录 |
| GET | /api/config | 模型与存储就绪状态 |
| POST | /api/generate | 单篇 AI 文案 |
| GET | /api/works | 当前浏览器的文案/图片列表 |
| PATCH | /api/works/:id | 保存文案修改 |
| POST | /api/assets | 仅上传 PNG/JPG/WebP 私有图片 |
| GET | /api/assets/:id | 同会话私有图片读取 |
| POST | /api/batches | 创建异步批量任务 |
| GET | /api/batches | 我的批量任务 |
| GET | /api/batches/:id | 批量任务条目与完成结果 |

## 部署

```bash
npm install
node scripts/check.mjs
npx wrangler login
npm run deploy
```

部署 Wrangler 前，务必确认目标 Cloudflare 账号、D1 数据库、R2 桶、Queue 均已创建。首次创建环境后依次执行：

```bash
npx wrangler d1 execute ai-toolbox-content --remote --file=migrations/0001_init.sql
npx wrangler d1 execute ai-toolbox-content --remote --file=migrations/0002_batches.sql
```

Cloudflare Queues 的消费 Worker 是 `ai-toolbox`，生产队列名 `ai-toolbox-batch`。项目已通过 Cloudflare API 部署到用户账号；`wrangler.jsonc` 也包含 AI/D1/R2/Queues 配置。

GitHub Actions 只进行语法和注册表校验，**尚未配置自动发布到 Cloudflare**（GitHub Secrets 未授权），新提交代码不会自动上线，需要执行部署或通过 Cloudflare API 推送。不可将任何 API Token、密钥提交进仓库。

## 当前部署与验收

- AI 文案：真实推理，结构化返回，写入 D1，支持 PATCH 保存修改
- R2 图片：浏览器 Canvas 导出 WebP，上传私有对象并成功读取，历史中可查询
- 批量任务：Queue 消费2篇，D1 `done` 状态、2篇长文生成与历史记录均通过端到端测试
- 手机端：首页已通过375px浏览器宽度无横向溢出检查

`migrations/` 收录所有已在 Cloudflare D1 环境执行的初始化 SQL。
