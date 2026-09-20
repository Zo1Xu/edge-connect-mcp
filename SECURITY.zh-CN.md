# 安全政策

[English](SECURITY.md) | **简体中文**

## 支持范围

安全修复面向最新版本。目前 `edge-connect-mcp` 0.1.0 尚未发布到 npm；首次发布前可使用 GitHub 源码。

## 信任边界

默认模式连接日常 Edge 用户目录。获得授权的 MCP 客户端和 Agent 可以读取页面、检查网络请求、执行页面脚本，并借助登录会话操作网站；Cookie、扩展和其他敏感状态也可能暴露。页面内容不可信，可能包含提示注入。只使用可信客户端，并在客户端审阅重要操作。

`--isolated` 使用独立、持久化用户目录，不提供操作系统沙箱。该目录中登录的账号仍可被 Agent 使用。单个 Profile 子目录也不是安全边界：CDP 可能访问同一浏览器进程中的其他 Profile。

## CDP 与浏览器生命周期

CDP 通常没有身份认证。启动器绑定回环地址，拒绝非回环端点及 HTTP 重定向，验证浏览器 WebSocket 地址后将其传给官方 MCP。`localhost` 会转换为数字回环地址。这些检查防止误连，无法阻止同机恶意进程冒充服务；Edge 身份字段是服务自行报告的。不要转发或公开 CDP 端口。

对于手动启动的浏览器，用户还需保证监听器没有绑定其他网卡。使用回环 URL 连接无法证明现有服务仅监听回环；同机进程仍可能访问 CDP 和用户数据。

MCP 客户端退出后浏览器保持打开，调试接口可能继续可用。停用调试时完全退出对应 Edge，再正常启动。启动器不会强制结束现有浏览器、复制 Cookie、删除 Profile 或绕过组织策略。

官方 MCP 的使用统计、CrUX 查询及更新检查默认关闭。Edge 遥测和 AI 服务的数据处理由各自设置控制。诊断报告不输出页面内容，但错误或日志可能包含本地路径；分享前请脱敏。

## 漏洞报告

请通过 [GitHub 私密漏洞报告](https://github.com/Zo1Xu/edge-connect-mcp/security/advisories/new) 联系维护者，不要在公开 Issue 中披露漏洞细节、凭据、CDP WebSocket 地址或浏览器数据。

提供包版本、Node/Edge 版本、操作系统、使用全新测试 Profile 的复现步骤、影响与建议修复。不要附真实 Cookie 或令牌。上游问题也应通过 [官方安全政策](https://github.com/ChromeDevTools/chrome-devtools-mcp/security/policy) 中的渠道报告。
