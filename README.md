# 创作云 AI Toolbox

本仓库运行在 **Cloudflare Workers**，覆盖四阶段工具导航：AI 图文（17）、AI 图片（11）、AI 电商设计（13）、AI 视频（5）。

## 线上地址

https://ai-toolbox.foxigaoqian-soocly.workers.dev/

## V0.7 真实可用能力

- **10 个浏览器本地工具：** 指定文案图文、单篇大字报、热门标题规则生成、封面设计、图片裁剪、调整尺寸、压缩、拼图，新增自由设计图文及自定义多页图文编辑器（4种主题、最多8页、高清 PNG 和 ZIP 导出）。
- **6 个真实 AI 文案入口：** 一句话图文、同款参考仿写（粘贴参考内容）、多内容仿写、人设图文、爆款文案、公众号长图文的文案生成功能。模型：默认 Cloudflare Workers AI Llama 3.1 8B Fast；可通过 Cloudflare Secret 配置 OpenAI 兼容中转站。
- **2 个真实后台批量入口：** AI 批量超级图文、批量大字报图文（当前为每行主题分别生成**文案**，不是自动完整生图；2–4篇/任务）。
- **作品中心：** D1 存储生成文案，支持修改后持久化、查看历史；图片可手动保存到私有 R2 桶，并从同浏览器找回。
- **Cloudflare Queues：** 批量任务由后台消费并保存到 D1，可按任务 ID 查询进度。用户无需持续保持页面开启。
- **保护机制：** 生成 API 每个浏览器单篇 4次/天，批量6篇/天；全站每日 AI 推理合计最多30次。图片保存最多 4MB/张、每浏览器12张/天、全站70张/天。

**尚未完成：** 正式邮箱用户登录/跨设备账号、收费积分、AI 图片生成与修图、电商套图、视频生成、图文自动多页设计及发布。剩余入口会显示未接入，不会伪造 AI 结果。

**隐私注意：** 目前是匿名会话，靠 Secure、HttpOnly Cookie 识别，每次生成自动绑定该浏览器。更换设备、清除 Cookie 或会话过期后无法访问原来的私人作品；需要长期保存请下载本地。正式账号系统将在后续开发。

## V0.7 双分组 Key 接入

现在支持 **两把独立的中转站 Key**：

- `AI_TEXT_API_KEY`（Secret）→ 截图 `text` / `ds-v4.1可用` 分组 → `AI_TEXT_MODEL=deepseek-v4.1-flash` → `/v1/chat/completions`
- `AI_IMAGE_API_KEY`（Secret）→ 截图 `image-2` / `gpt-image-2` 分组 → `AI_IMAGE_MODEL=gpt-image-2.5` → `/v1/images/generations`
- `AI_BASE_URL=https://api.sqface.sbs/v1` 两种接口共用网关地址；模型与 Key 各自独立。

在未设置图片 Secret 前生图功能**自动禁用**，不会使用文字 Token 代替。配置图片 Secret 后新增真实生图 API `POST /api/images/generate`；支持生成结果私有 R2 保存（当供应商返回 base64），限全站每日10张/单浏览器2张。尚未提供实际 Token，因此仅完成公开接口与无 Key 安全测试，不能宣称已验证供应商的带 Key 生图成功。

[详细填写教程](docs/GATEWAY_SETUP.md)。

## V0.7 小红书公开笔记复刻

进入首页 **AI 图文 → AI复刻同款图文**（`?tool=tool-02`）：

1. 粘贴小红书公开长链接、`xhslink.com/a/...`、`xhslink.com/m/...` 或含链接的分享文字，点「解析公开笔记」。
2. Worker 仅抓取无需登录的公开网页，尝试识别笔记标题、正文和最多 9 张可直接访问的参考图片，显示预览及可勾选的图片列表。
3. 若小红书返回登录页、验证码、拦截或动态加载壳，会明确失败；用户可以自行复制参考文案并上传图片（最多 9 张）。
4. 点击「AI 原创复刻文案」通过现有文字模型重新创作，编辑并保存到 D1。点击「用图片和文案制作套图」转入多页编辑器，已加载的参考图片与新文案会共同布局；支持 PNG/ZIP 下载。
5. 手动导入也能直接进行图文设计，无需依赖自动解析成功。

**限制：** 自动抓取是 best-effort，无法保证所有小红书链接能自动取得完整图片和文案。不调用非公开笔记 API，不绕过登录、签名验证或验证码。链接预览默认每日全站最多 80 次；公开图片代理只放行固定小红书 CDN 域名并限制文件大小。AI 文案使用现有全站模型调用额度。

**版权提醒：** 原帖图片和文字属于其相应权利人；应使用自己有权使用的素材，改写后的文案不得假冒原作者。网站不会保证“原图无损下载”或批量复制整篇作品。

接口：`POST /api/xhs/resolve`、`GET /api/xhs/image?url=...`。可用测试：`node scripts/check.mjs`。

## V0.7 小红书解析增强（开源项目适配）

参考 [ShareXtract](https://github.com/wuaishare/sharextract) 的公开笔记 SSR 解析器：
[源代码](https://github.com/wuaishare/sharextract/blob/main/sharextract/extractors/xiaohongshu.py)，Apache-2.0。原生 JS 适配位于 \`src/xhs-ssr.js\`，开源许可证见 \`licenses/sharextract-APACHE-2.0.txt\`。

解析优先级：
1. 校验用户的公开分享 URL（保留该笔记自身 xsec_token，不生成/更新签名）。
2. 先在普通 HTTPS 页面解析 \`window.__INITIAL_STATE__.note.noteDetailMap[noteId].note\`，提取标题、正文、原帖 imageList（最多 9 张，保序）。失败则回退公开 OG 元信息。
3. HTTP 请求如果被转登录页，再尝试同一个笔记官方 URL 的 \`/explore/\`、\`/discovery/item/\` 两种路径。
4. 如果仍被拦截，调用已绑定的 Cloudflare Browser Run \`BROWSER.quickAction('content', ...)\`，从匿名浏览器公开页面解析 SSR/元数据。**不需要额外 API Token**，但消耗 Cloudflare Browser Run 浏览器时长与速率配额。
5. 浏览器备用限流：全站 10 次/天、同一匿名浏览器 3 次/天。429 时明确提示 Cloudflare 额度/限流，绝不误认登录页标题为帖子标题。

**重要**：自动解析不是 100% 保证；Cloudflare Worker 的普通 HTTP 请求仍可能被小红书重定向到 \`/login\`。浏览器渲染在当前账号的连续测试中遇到过 **HTTP 429**，所以真实笔记全图/全文抓取仍需在 Browser Run 速率恢复后复验。不得宣称这两条真实用户链接已成功获取。未获取到原帖素材时仍有手动导入兜底，保留内容授权提醒。

## V0.7 真实 AI 图片复刻

过去的复刻工具仅改写文案，参考图片只是排版素材。现在增加「AI 复刻选中图片」：

- 浏览器逐张提交真实参考图（PNG/JPG/WebP，最多4MB）和新文案，调用 POST /api/images/remix。
- 后端使用图片组 Secret AI_IMAGE_API_KEY，通过 OpenAI 兼容 /v1/images/edits 向 AI_IMAGE_MODEL 发送参考图；不会使用文字组 Key。
- 每次最多3张图片，逐张显示生成进度和结果；成功后可将重绘图片导入图文编辑器。返回 base64 的生成结果私有保存到 R2。
- 图片生成共享额度：全站20张/天，单个浏览器6张/天。模型调用可能产生费用。
- 以原图的构图和配色作为灵感制作原创视觉，不保证中文图片文字完全准确、逐像素一致。复刻和文字改写是两项独立操作。
- 当前中转站的 gpt-image-2.5 是否支持 /images/edits 必须做真实带 Key 验收，不会在没测试时声称已支持。临时外链也不保证能直接用于 Canvas 导出。
## 架构

- 前端：Worker 中内嵌响应式 HTML / CSS / 原生 JS / Canvas
- 接口：Worker fetch handler，AI 单篇生成与保存采用 D1
- 异步任务：Cloudflare Queues + Worker queue handler + D1 batches/batch_items
- 素材：私有 Cloudflare R2，所有 GET 均校验会话与 owner
- 模型：Workers AI `@cf/meta/llama-3.1-8b-instruct-fast`
- 数据保护：服务端验证入参、图片 magic bytes 校验、D1 参数绑定、同源会话 Cookie 与全局预算上限

## 中转站 API Key 配置

请阅读 [Cloudflare Secret 配置教程](docs/GATEWAY_SETUP.md)。在 Cloudflare Workers 的 Settings → Variables and Secrets 设置 AI_API_KEY（Secret）、AI_BASE_URL（Text）、AI_TEXT_MODEL（Text）。不要提交 Key 到 GitHub。具体模型与 URL 以中转站官方文档为准。

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

- AI 文案：真实推理（支持配置外部 OpenAI 兼容中转站的独立文字 Key），结构化返回，写入 D1，支持 PATCH 保存修改
- R2 图片：浏览器 Canvas 导出 WebP，上传私有对象并成功读取，历史中可查询
- 批量任务：Queue 消费2篇，D1 `done` 状态、2篇长文生成与历史记录均通过端到端测试
- 手机端：首页已通过375px浏览器宽度无横向溢出检查

`migrations/` 收录所有已在 Cloudflare D1 环境执行的初始化 SQL。
