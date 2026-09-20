# Contributing

**English** | [简体中文](CONTRIBUTING.zh-CN.md)

Use a supported Node.js version and run the commands below. The source is ESM JavaScript and needs no build step.

Keep the English `.md` and Chinese `.zh-CN.md` documentation in sync.

```sh
npm ci
npm run check
npm test
npm run test:pack
```

## Code structure

| File | Responsibility |
| --- | --- |
| `src/edge.js`, `src/platform.js` | Browser discovery, profiles and lifecycle. |
| `src/cdp.js` | CDP endpoint and browser identity validation. |
| `src/upstream.js` | Official dependency, stdio bridge and MCP diagnostics. |

Do not reimplement upstream DevTools tools, write logs to MCP stdout, or ask interactive questions on MCP stdin.

## Validation

Add regression tests for meaningful behavior changes, especially profile ownership, loopback validation, startup failures and subprocess cleanup. Never use personal browser profiles in automated tests.

`npm run test:edge` is an optional desktop test requiring Node 22+ and Edge. It creates a temporary profile, verifies the full connection, then closes only that test browser and cleans up its directory.

Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md). Do not upload profile archives, cookies, sessions, private page URLs or personal machine configuration.
