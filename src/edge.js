import { mkdir, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { activePort, edgeProcesses, exists, findEdge, processFlag, matchingProcesses, selectProfile } from './platform.js';
import { localUrl, portAvailable, verifyCdp } from './cdp.js';

export const PRIVACY_NOTICE = '[edge-connect-mcp] SECURITY: Connecting to Edge gives the AI agent access to pages, cookies, signed-in sessions, extensions and other sensitive information in that browser. Use only trusted MCP clients. --isolated uses a separate persistent profile. CDP has no authentication; never expose or forward its port. / 安全提示：AI 可访问浏览器页面、Cookie、登录会话及敏感信息；可用 --isolated 隔离。';

export async function inspectEdge(options) {
  if (options.browserUrl) {
    const url = localUrl(options.browserUrl).origin;
    return { profile: undefined, processes: [], candidates: [{ url }], warnings: [] };
  }
  const profile = await selectProfile(options);
  const result = await edgeProcesses();
  const processes = matchingProcesses(result.processes, profile);
  const candidates = [];
  const active = await activePort(profile.root);
  if (active && (!options.port || Number(new URL(active.url).port) === options.port)) candidates.push(active);
  for (const item of processes) {
    const port = Number(processFlag(item, 'remote-debugging-port'));
    const address = processFlag(item, 'remote-debugging-address');
    if (address && !['127.0.0.1', 'localhost', '::1'].includes(address)) continue;
    if (Number.isInteger(port) && port > 0 && port <= 65535 && (!options.port || options.port === port)) {
      candidates.push({ url: `http://127.0.0.1:${port}` });
    }
  }
  // A requested port is not sufficient proof that it belongs to the chosen profile.
  // Use --browser-url when the caller intentionally selects an endpoint directly.
  return { profile, processes, candidates, warnings: result.warning ? [result.warning] : [] };
}

export async function findConnection(inspection, signal) {
  const errors = [];
  for (const candidate of inspection.candidates) {
    try { return { connection: await verifyCdp(candidate.url, { socketPath: candidate.socketPath, signal }), errors }; }
    catch (error) { errors.push(error.message); }
  }
  return { errors };
}

export function launchArgs(profile, port) {
  const args = ['--remote-debugging-address=127.0.0.1', `--remote-debugging-port=${port || 0}`,
    `--user-data-dir=${profile.root}`];
  if (profile.directory) args.push(`--profile-directory=${profile.directory}`);
  return args;
}

export const RESTART_HELP = 'Edge is running for this user data directory but verified CDP is unavailable. Save your work and fully exit Edge (including Startup boost/background processes), then retry. The launcher will never kill Edge. If policy or this Edge version blocks debugging the everyday profile, use --isolated or --profile with a separate directory; no silent fallback is performed.';

export async function prepareEdge(options, { log = () => {}, signal, inspection } = {}) {
  signal?.throwIfAborted();
  const info = inspection || await inspectEdge(options);
  info.warnings.forEach(log);
  const found = await findConnection(info, signal);
  if (found.connection) return { ...found.connection, profile: info.profile, reused: true };
  if (options.browserUrl) throw new Error(`Cannot attach to the requested Edge endpoint: ${found.errors.join('; ')}`);
  if (info.processes.length) throw new Error(`${RESTART_HELP}${found.errors.length ? ` Details: ${found.errors.join('; ')}` : ''}`);
  if (info.profile.mode === 'daily' && !await exists(info.profile.root)) {
    throw new Error('Everyday Edge user data directory not found. Open Edge once to set it up, specify --profile, or choose --isolated.');
  }
  const executable = await findEdge(options.edgePath);
  if (options.port && !await portAvailable(options.port)) throw new Error('Requested port is occupied and was not verified as the selected Edge profile. Choose another --port or omit it.');
  await mkdir(info.profile.root, { recursive: true, mode: 0o700 });
  await access(info.profile.root, constants.R_OK | constants.W_OK);
  signal?.throwIfAborted();
  log(`Starting Edge with ${info.profile.mode} profile and ${options.port ? 'requested' : 'automatically allocated'} loopback port.`);
  // Detached browser ownership stays with the user, including after MCP disconnect.
  const child = spawn(executable, launchArgs(info.profile, options.port), {
    stdio: 'ignore', detached: true, windowsHide: true,
  });
  let launchError;
  child.on('error', error => { launchError = error; });
  child.unref();
  const deadline = Date.now() + options.timeout;
  let lastError;
  while (Date.now() < deadline) {
    signal?.throwIfAborted();
    if (launchError) throw new Error(`Edge failed to start: ${launchError.message}`);
    const candidate = options.port ? { url: `http://127.0.0.1:${options.port}` } : await activePort(info.profile.root);
    if (candidate) {
      try {
        const connection = await verifyCdp(candidate.url, { socketPath: candidate.socketPath, timeout: Math.min(1000, Math.max(1, deadline - Date.now())), signal });
        return { ...connection, profile: info.profile, reused: false };
      } catch (error) { lastError = error.message; }
    }
    await delay(150, undefined, { signal });
  }
  throw new Error(`Edge did not expose a verified CDP endpoint within ${options.timeout} ms. ${RESTART_HELP}${lastError ? ` Last check: ${lastError}` : ''}`);
}
