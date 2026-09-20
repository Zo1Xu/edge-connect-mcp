# Changelog

**English** | [简体中文](CHANGELOG.zh-CN.md)

## 0.1.1 — Unreleased

- Daily is now attach-only: users enable remote debugging in Edge; the pinned official MCP 1.9.0 receives `--autoConnect --user-data-dir`. No daily launch/restart or isolated fallback, even with `doctor --launch`.
- Daily discovery treats DevToolsActivePort as a hint, checks listeners and local Edge process ownership, and avoids mandatory HTTP `/json/version` for authorization mode.
- Doctor separates stale hints/no listener, authorization required/pending/rejected, detected policy disablement and successful browser connection from MCP protocol readiness. Authorization has its own wait limit.
- Added attach-only `--user-data-dir` and advanced loopback `--ws-endpoint` (`--wsEndpoint`) support. Standard Edge roots selected via `--profile` remain attach-only.
- Preserved persistent `--isolated`, custom agent launching, dynamic ports and verified `--browser-url`. Documented the lifecycle difference from upstream temporary `--isolated`.
- Added authorization, stale metadata, policy, cancellation, ownership and regression tests, including the real official upstream's WebSocket rejection path.

## 0.1.0 — 2026-09-20

- Project, npm package, CLI and isolated directory named `edge-connect-mcp`.
- Cross-platform Edge Stable discovery with everyday-profile-first connection.
- Persistent isolated directories and custom user data/profile selection.
- Dynamic loopback ports, Edge CDP validation and exact WebSocket handoff.
- Standard stdio bridge to a pinned official MCP, with usage statistics, CrUX and update checks disabled.
- Read-only doctor with opt-in launch checks, MCP handshake and browser tool validation.
- Tests, npm bin, GitHub Actions, bilingual documentation and MIT license.
