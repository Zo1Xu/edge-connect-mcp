# 开发说明

[English](CONTRIBUTING.md) | **简体中文**

使用受支持的 Node.js 版本运行以下命令。源码为 ESM JavaScript，无需编译。

修改文档时同步更新英文 `.md` 和中文 `.zh-CN.md` 版本。

```sh
npm ci
npm run check
npm test
npm run test:pack
```

## 代码结构

| 文件 | 职责 |
| --- | --- |
| `src/edge.js`, `src/platform.js` | 浏览器发现、Profile 与生命周期。 |
| `src/cdp.js` | CDP 地址与浏览器身份验证。 |
| `src/upstream.js` | 官方依赖、stdio 桥接与 MCP 诊断。 |

不要重新实现上游 DevTools 工具；日志不得写入 MCP stdout，也不得通过 MCP stdin 请求交互确认。

## 验证

为实际行为变化添加回归测试，尤其是 Profile 归属、回环地址验证、启动失败和子进程清理。自动测试不得使用个人浏览器 Profile。

`npm run test:edge` 是可选桌面测试，需要 Node 22+ 和已安装的 Edge；它创建临时 Profile，验证完整链路，然后仅关闭该测试浏览器并清理目录。

按照 [SECURITY.md](SECURITY.zh-CN.md) 私下报告安全问题。不要上传 Profile 归档、Cookie、登录会话、私密页面地址或个人机器配置。
