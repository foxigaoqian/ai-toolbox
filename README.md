# 创作云 · AI Toolbox

一套部署在 **Cloudflare Workers** 的中文创作工具箱，支持电脑与手机，目标范围仅包含：

1. AI 图文创作（17 个入口）
2. AI 图片工具（11 个入口）
3. AI 电商设计（13 个入口）
4. AI 视频生成（5 个入口）

**当前版本 V0.1.0**：46 个分类工具入口与统一工作台，其中 8 个浏览器本地工具可真实使用：指定文案图文、单篇大字报图文、智能热门标题（规则模板）、封面设计器、图片裁剪、图片尺寸调整、图片压缩、图片拼图。

其他 38 个工具为**待接入真实模型**，不会返回模拟 AI 成果。尚未实现用户登录、积分、R2 存储、异步云任务，也不会假装这些已可用。

## 线上地址

https://ai-toolbox.foxigaoqian-soocly.workers.dev/

## API

- `GET /api/health` — 健康检查、工具数量及已可用数量
- `GET /api/tools` — 46 个工具的 JSON 目录
- `GET /api/config` — AI 模型与存储服务接入状态
- 未实现的生成 API 返回 HTTP 503 和明确错误说明

## 本地开发

```bash
npm install
npm run dev
```

## 发布

```bash
npx wrangler login
npm run deploy
```

`wrangler.jsonc` 已配置 Worker 名称 `ai-toolbox`。部署前确保登录的是目标 Cloudflare 账号。密钥须通过 Cloudflare Secrets 配置，绝不能提交到 GitHub。当前没有启用任何需要密钥的模型调用。

## 自动校验

```bash
node scripts/check.mjs
```

校验 Worker 代码、浏览器脚本语法以及 46 个工具 ID、分类数量和本地可用状态。GitHub Actions workflow 在 `.github/workflows/verify.yml`。

## 下一阶段

- P1：配置可靠的用户认证、任务队列、数据库、R2 和积分账本；接入文本模型，完成一句话图文/批量图文/作品管理。
- P2：接入图片模型、编辑能力、更多本地图片工具。
- P3：电商商拍/套图/详情页，后端异步批处理。
- P4：文生/图生视频，视频任务进度与下载。

> 原站功能参考可以帮助确定需求，但本站不会照搬原站品牌、图片和其他受保护资产。
