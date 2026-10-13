# Square API 双 Key 配置 — ai-toolbox V0.4

你已经在 Square API 控制台创建了两把不同分组的 Key。这是正确做法。**一个 Key 不需要、也不一定能够跨分组调用所有模型。**

## 1. Cloudflare Workers 设置

打开 Cloudflare Dashboard → Workers & Pages → **ai-toolbox** → Settings → Variables and Secrets → Add。

| 变量名 | 类型 | 填写什么 |
| --- | --- | --- |
| `AI_TEXT_API_KEY` | **Secret** | Square API 里名称为 **text**、分组 **ds-v4.1可用** 的完整 Key |
| `AI_IMAGE_API_KEY` | **Secret** | 名称为 **image-2**、分组 **gpt-image-2** 的完整 Key |
| `AI_BASE_URL` | Text | **`https://api.sqface.sbs/v1`**（已验证该域名的文本和图片接口存在，未带 Key 返回 401） |
| `AI_TEXT_MODEL` | Text | `deepseek-v4.1-flash` |
| `AI_IMAGE_MODEL` | Text | `gpt-image-2.5`（该分组公开列表已包含；如模型路由不通可测试 `gpt-image-2`） |

如果图片服务提供的 Base URL 与文字不同，可另加 `AI_IMAGE_BASE_URL`；否则**共用** `AI_BASE_URL` 即可。文字也可使用 `AI_TEXT_BASE_URL` 单独覆盖地址。

**不要**复制截图中的部分掩码 Key；请在中转站自己点击复制完整 Key，直接粘贴到 Cloudflare Secret。不要粘贴到 GitHub 或聊天消息中。

Cloudflare 保存设置后按界面提示部署/生效。若选择了 Secret，请确保 Secret 已与当前 Worker 版本关联。

## 2. 生效检查

访问 [公开配置检查接口](https://ai-toolbox.foxigaoqian-soocly.workers.dev/api/config)。

预期输出中的公开状态：
- `textConfigured: true`：文字 Key + Base URL 可用（只是配置检测，不是推理成功证明）
- `imageConfigured: true`：图片 Key + Base URL 可用
- `textModel: "deepseek-v4.1-flash"`
- `imageModel: "gpt-image-2.5"`

这里不会返回密钥，也不会返回任何 Key 的部分值。配置正确后，进入「一句话图文」和「AI设计好图」分别执行小额请求测试，核对中转站使用日志是否落在 **text** 和 **image-2** 对应的令牌上。

## 3. 程序如何区分 Key

- 文案 / 批量文案：读取 `AI_TEXT_API_KEY`，请求 `/chat/completions`，模型 `AI_TEXT_MODEL`。
- AI 生成图片：读取 `AI_IMAGE_API_KEY`，请求 `/images/generations`，模型 `AI_IMAGE_MODEL`。
- Cloudflare Workers AI：文字 Key 未配置时的默认备用路径；**不会**擅自用文字 Key 来生成图片。
- 旧版 `AI_API_KEY` 只作为**文字**兼容变量。已使用 `AI_TEXT_API_KEY` 时优先读取新变量。
- Key 权限限制来自中转站的 Token 分组，代码不自行伪造或切换分组。

## 4. 费用与验收

图片接口目前是实验性功能，公共试用设定：每浏览器 2 张/天，全站最多 10 张/天。正式对外运营前应加入账号、额度计费、取消与队列等能力。

兼容 OpenAI 的图片端点不代表每个自定义图片模型都能处理所有尺寸或返回格式：
- 程序已适配 `b64_json` 图片输出或临时 HTTPS 图片链接。
- Base64 图片会写入私有 Cloudflare R2；临时外链结果需要及时下载。
- 图片生成功能需填入自己的真实 Key 并成功调用后才能证明最终兼容性。
- 视频模型和原图编辑仍未接入。

## 5. 出错排查

- `IMAGE_KEY_REQUIRED`：未配置图片组专属 Key 或 Base URL
- `IMAGE_HTTP_401`：图片 Key 无效
- `IMAGE_HTTP_403`：图片 Key 无权限
- `IMAGE_HTTP_404`：模型 ID 或图片接口不匹配
- `IMAGE_HTTP_429`：中转站限流
- `IMAGE_EMPTY_RESPONSE`：返回结构非兼容图片格式
- `GATEWAY_HTTP_401`：文字 Key 有问题

图文多页编辑器无需图片生成 Key 即可使用，但真正的 AI 配图必须配置图片 Key。
