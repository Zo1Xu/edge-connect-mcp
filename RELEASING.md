# 发布步骤 / Releasing

源码仓库：[Zo1Xu/edge-connect-mcp](https://github.com/Zo1Xu/edge-connect-mcp)。目前尚未发布到 npm；包名查询未发现同名公开包，但名称在成功发布前不会被预留。
Source repository: [Zo1Xu/edge-connect-mcp](https://github.com/Zo1Xu/edge-connect-mcp). The package is not yet published on npm. Registry checks found no public package under this name, but the name is not reserved until publication succeeds.

1. 确认 `edge-connect-mcp` 名称仍可用，且你的 npm 账号有发布权限。若改用 scope，同步修改 package.json、lockfile 和文档。
   Verify name availability and npm publishing permissions. If switching to a scoped name, update package.json, the lockfile and documentation.

2. 核对 package.json 的 `repository`、`homepage`、`bugs` 地址，以及 MIT 许可和版权署名。确认私密漏洞报告可用，并考虑为主分支配置 CI 保护。
   Verify `repository`, `homepage`, `bugs`, the MIT license and attribution. Confirm private vulnerability reporting works and consider protecting the default branch with required CI checks.

3. 执行下面的检查。在有 Edge 的桌面环境中另行运行 `npm run test:edge`（Node 22+）。检查打包文件，确保不包含个人 Profile、凭据或开发产物。
   Run the checks below. Also run `npm run test:edge` on a desktop with Edge and Node 22+. Inspect package contents for personal profiles, credentials and development artifacts.

   ```sh
   npm ci
   npm run check
   npm test
   npm run test:pack
   npm pack --dry-run
   ```

4. 固定官方上游版本，升级时审阅更新说明并重跑 MCP 握手和真实 Edge 测试。运行时不得下载未固定版本的服务。
   Pin the official upstream version. Review release notes and rerun MCP handshake and real Edge tests when upgrading. Do not download an unpinned server at runtime.

5. 确定版本，更新 CHANGELOG.md、SECURITY.md 的发行状态，审阅后提交源码及对应版本标签。README 的 npm 命令按正式发布后的用法编写。
   Choose the version, update release status in CHANGELOG.md and SECURITY.md, then review and commit the source and matching version tag. README npm commands describe usage after publication.

6. 登录 npm，核对账号和包名后发布。根据账号要求配置双因素认证或可信发布。当前没有自动发布工作流。
   Sign in to npm, verify the account and package name, then publish. Configure two-factor authentication or trusted publishing as required by the account. No automatic publishing workflow is configured.

   ```sh
   npm login
   npm publish --access public
   ```

7. 在干净目录验证下列命令，并用真实 MCP 客户端测试安装。
   Verify the following commands in a clean directory and test installation with a real MCP client.

   ```sh
   npx -y edge-connect-mcp@latest --version
   npx -y edge-connect-mcp@latest doctor
   ```

GitHub Actions 在 push 和 pull request 时验证三平台测试与打包，仅使用仓库读取权限，不需要发布密钥。
GitHub Actions checks tests and packaging across three platforms on pushes and pull requests. It uses read-only repository permissions and requires no publishing credentials.
