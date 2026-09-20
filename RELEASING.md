# Releasing

**English** | [简体中文](RELEASING.zh-CN.md)

Source repository: [Zo1Xu/edge-connect-mcp](https://github.com/Zo1Xu/edge-connect-mcp). The package is not yet published on npm. Registry checks found no public package under this name, but the name is not reserved until publication succeeds.

1. Verify name availability and npm publishing permissions. If switching to a scoped name, update package.json, the lockfile and documentation.

2. Verify `repository`, `homepage`, `bugs`, the MIT license and attribution. Confirm private vulnerability reporting works and consider protecting the default branch with required CI checks.

3. Run the checks below. Also run `npm run test:edge` on a desktop with Edge and Node 22+. Inspect package contents for personal profiles, credentials and development artifacts.

   ```sh
   npm ci
   npm run check
   npm test
   npm run test:pack
   npm pack --dry-run
   ```

4. Pin the official upstream version. Review release notes and rerun MCP handshake and real Edge tests when upgrading. Do not download an unpinned server at runtime.

5. Choose the version, update release status in CHANGELOG.md and SECURITY.md, then review and commit the source and matching version tag. README npm commands describe usage after publication.

6. Sign in to npm, verify the account and package name, then publish. Configure two-factor authentication or trusted publishing as required by the account. No automatic publishing workflow is configured.

   ```sh
   npm login
   npm publish --access public
   ```

7. Verify the following commands in a clean directory and test installation with a real MCP client.

   ```sh
   npx -y edge-connect-mcp@latest --version
   npx -y edge-connect-mcp@latest doctor
   ```

GitHub Actions checks tests and packaging across three platforms on pushes and pull requests. It uses read-only repository permissions and requires no publishing credentials.
