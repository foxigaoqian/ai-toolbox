# 私有小红书公开笔记解析服务

该目录把开源 [JoeanAmier/XHS-Downloader](https://github.com/JoeanAmier/XHS-Downloader) 作为独立容器运行，并在前面增加一个最小鉴权网关。Worker 只允许服务端调用，访客不能传入 Cookie、代理或下载参数。

## 1. 启动

需要一台能运行 Docker Compose、具有正常公网出口的 Linux 主机。部分数据中心 IP 仍可能被小红书要求登录；这种情况需在 XHS-Downloader 的 `Volume/settings.json` 中配置你有权使用的 Cookie 或代理。

```bash
cd deploy/xhs-parser
cp .env.example .env
openssl rand -hex 32
# 把输出填入 .env 的 PARSER_TOKEN
docker compose up -d --build
curl http://127.0.0.1:8788/health
```

原始 XHS-Downloader 端口只在 Docker 内网开放。鉴权网关也只绑定主机 `127.0.0.1:8788`，必须通过 Caddy、Nginx 或 Cloudflare Tunnel 暴露为 HTTPS 域名，例如 `https://xhs-parser.example.com`。不要直接把 5556 或未加 TLS 的 8788 暴露到公网。

## 2. 验证网关

```bash
set -a; . ./.env; set +a
curl -sS http://127.0.0.1:8788/xhs/detail \
  -H "Authorization: Bearer $PARSER_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"url":"https://www.xiaohongshu.com/discovery/item/NOTE_ID"}'
```

网关会强制发送 `download=false`、`check_record=false`，并拒绝非小红书域名。它不会把请求里的 Cookie 或代理继续传给解析器。

## 3. 配置 Cloudflare Worker

```bash
npx wrangler secret put XHS_PARSER_TOKEN
npx wrangler deploy --var XHS_PARSER_URL:https://xhs-parser.example.com
```

`XHS_PARSER_TOKEN` 必须与服务器 `.env` 相同；`XHS_PARSER_URL` 必须是公网 HTTPS 地址。配置生效后，`GET /api/config` 的 `xhsParserConfigured` 会变为 `true`。

调用顺序为：公开页面 SSR/元数据 → 私有 XHS-Downloader → 可选 EasyDown → Cloudflare Browser Run → 分享文字标题兜底。私有解析每日全站最多 30 次、同一匿名浏览器最多 5 次；成功结果写入 D1 短期缓存。

## 维护与合规

- XHS-Downloader 使用 GPL-3.0 许可证；这里引用其官方容器镜像，不复制其源代码。升级前先在测试机运行 `docker compose pull && docker compose up -d` 并复验返回结构。
- 仅处理公开笔记和你有权使用的内容。Cookie 属于敏感信息，只保存在解析主机的持久卷，绝不能提交到 Git 或传给浏览器端。
- 解析器仍可能因登录、验证码、链接失效或平台接口变化失败。失败时 Worker 不会用平台页面通用文案冒充原帖。
