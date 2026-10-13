# 中转站 API Key 接入说明（Cloudflare Workers）

## 第一步：在 Cloudflare 填写

Cloudflare Dashboard → Workers & Pages → ai-toolbox → Settings → Variables and Secrets → Add

| 类型 | Variable name | Value |
| --- | --- | --- |
| Secret | AI_API_KEY | 中转站 Token，直接填 sk- 开头的完整值（如果服务商是这种格式） |
| Text 或 Secret | AI_BASE_URL | 官方 OpenAI 兼容 Base URL，例如 https://你的中转域名/v1 |
| Text 或 Secret | AI_TEXT_MODEL | 控制台给出的完整模型 ID |

请用你实际中转站的 API 域名及支持的模型名替换占位示例。保存变量后，按 Cloudflare 的提示部署新版本。

## 第二步：检查是否成功

打开 https://ai-toolbox.foxigaoqian-soocly.workers.dev/api/config

- provider 应为 openai-compatible
- gatewayConfigured 应为 true
- textModel 应为你选择的模型名

接口绝不返回 Key。若没有配置 Key，则继续使用 Cloudflare Workers AI。

## 工作原理

后端在 AI_API_KEY、AI_BASE_URL、AI_TEXT_MODEL 全部齐备时调用 OpenAI 兼容 /chat/completions。单篇 AI 文案和后台队列批量生成共用这个配置。图片和视频生成仍需后续适配，不会因为配置了文本模型就全部启用。

## 注意

不要将 Key 放在 GitHub、前端 JS、公开截图或聊天消息中。创建专用 Token 并限制额度；当前项目为匿名公共试用。配置了 Key 但缺失 URL 或模型时会报 GATEWAY_CONFIG_INCOMPLETE，不会自动切换别的收费渠道。

常见错误：GATEWAY_HTTP_401（Token 不正确）；GATEWAY_HTTP_403（权限）；GATEWAY_HTTP_404（URL 或模型）；GATEWAY_HTTP_429（限流）；GATEWAY_NETWORK_FAILED（网络问题）。

若不知道 Base URL，提供中转站的官网或 API 文档链接即可，不要提供 Key。
