import net from 'node:net';
import path from 'node:path';
import os from 'node:os';
import { readdir, readFile, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readActivePort } from './platform.js';

const exec = promisify(execFile);
export const DAILY_HELP = 'Open: edge://inspect/#remote-debugging\nEnable: Allow remote debugging for this browser instance';
const execution = { windowsHide: true, timeout: 5000, maxBuffer: 1024 * 1024 };
const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');

// Best-effort, read-only local policy inspection. Absence is not proof that no
// cloud/managed policy applies. Never change registry, preferences or policy.
export async function remoteDebuggingPolicy(platform = process.platform) {
  try {
    const values = [];
    if (platform === 'win32') {
      const script = "$values = @(); foreach ($key in @('HKLM:\\Software\\Policies\\Microsoft\\Edge','HKCU:\\Software\\Policies\\Microsoft\\Edge')) { if (Test-Path -LiteralPath $key -ErrorAction Stop) { $item = Get-ItemProperty -LiteralPath $key -ErrorAction Stop; if ($null -ne $item.RemoteDebuggingAllowed) { $values += [int]$item.RemoteDebuggingAllowed } } }; ConvertTo-Json -InputObject $values -Compress";
      const { stdout } = await exec(powershell, ['-NoProfile', '-NonInteractive', '-Command', `$ErrorActionPreference = 'Stop'; ${script}`], execution);
      values.push(...JSON.parse(stdout));
    } else if (platform === 'linux') {
      const root = '/etc/opt/edge/policies/managed';
      const files = await readdir(root).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
      for (const file of files.filter(name => name.endsWith('.json'))) {
        const policy = JSON.parse(await readFile(path.join(root, file), 'utf8'));
        if ('RemoteDebuggingAllowed' in policy) values.push(policy.RemoteDebuggingAllowed);
      }
    } else if (platform === 'darwin') {
      for (const root of ['/Library/Managed Preferences', path.join('/Library/Managed Preferences', os.userInfo().username)]) {
        const plist = path.join(root, 'com.microsoft.Edge.plist');
        const present = await stat(plist).catch(error => { if (error.code === 'ENOENT') return undefined; throw error; });
        if (!present) continue;
        try {
          const { stdout } = await exec('/usr/libexec/PlistBuddy', ['-c', 'Print :RemoteDebuggingAllowed', plist], execution);
          values.push(stdout.trim() === 'false' ? false : stdout.trim() === 'true' ? true : Number(stdout.trim()));
        } catch (error) {
          if (!/does not exist|not exist|not found/i.test(`${error.stderr} ${error.stdout}`)) throw error;
        }
      }
    } else return { state: 'unknown' };
    return { state: values.some(value => value === false || value === 0) ? 'disabled' : values.length ? 'allowed' : 'not_configured' };
  } catch { return { state: 'unknown' }; }
}

export function probeListener(url, { signal, timeout = 1000 } = {}) {
  signal?.throwIfAborted();
  const endpoint = new URL(url);
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: endpoint.hostname.replace(/^\[|\]$/g, ''), port: Number(endpoint.port || 80) });
    const finish = state => { signal?.removeEventListener('abort', abort); socket.destroy(); resolve(state); };
    const abort = () => { socket.destroy(); reject(signal.reason); };
    socket.once('connect', () => finish('listening'));
    socket.once('error', error => finish(error.code === 'ECONNREFUSED' ? 'no_listener' : 'unreachable'));
    socket.setTimeout(timeout, () => finish('unreachable'));
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}

// Do not send browser commands to an unrelated service which reused an old
// port. This does not authenticate against a malicious process of the same user.
export async function listenerOwner(url, processes, platform = process.platform) {
  const port = Number(new URL(url).port);
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !processes.length) return 'unverified';
  try {
    let pids;
    if (platform === 'win32') {
      const { stdout } = await exec(powershell, ['-NoProfile', '-NonInteractive', '-Command', `$ErrorActionPreference = 'Stop'; @(Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction Stop | Select-Object -ExpandProperty OwningProcess) | ConvertTo-Json -Compress`], execution);
      const result = JSON.parse(stdout || '[]');
      pids = Array.isArray(result) ? result : [result];
    } else {
      const { stdout } = await exec('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fp'], execution);
      pids = stdout.split('\n').filter(line => /^p\d+$/.test(line)).map(line => Number(line.slice(1)));
    }
    return pids.length && pids.every(pid => processes.some(item => item.pid === pid)) ? 'edge' : 'mismatch';
  } catch { return 'unverified'; }
}

export async function inspectDaily(profile, processes, { signal, readPort = readActivePort, policyReader = remoteDebuggingPolicy, listener = probeListener, owner = listenerOwner } = {}) {
  signal?.throwIfAborted();
  const policy = await policyReader();
  if (policy.state === 'disabled') return { state: 'policy_disabled', policy: policy.state };
  const file = await readPort(profile.root);
  const result = { policy: policy.state, endpointFile: file.state, modifiedAt: file.modifiedAt };
  if (!file.candidate) return { ...result, state: file.state === 'unreadable_file' ? 'discovery_unavailable' : 'authorization_required' };
  const listening = await listener(file.candidate.url, { signal });
  if (listening !== 'listening') return { ...result, endpointFile: listening === 'no_listener' ? 'stale_file' : file.state, state: listening };
  const ownership = await owner(file.candidate.url, processes);
  if (ownership !== 'edge') return { ...result, state: ownership === 'mismatch' ? 'endpoint_mismatch' : 'ownership_unverified', endpointFile: ownership === 'mismatch' ? 'stale_file' : file.state };
  // A listener is only a candidate. Only a successful upstream browser tool
  // establishes connected; no HTTP discovery or extra WebSocket is attempted.
  return { ...result, state: 'ready_to_attach', url: file.candidate.url };
}

export function connectionState(error) {
  const text = typeof error === 'string' ? error : `${error?.message || ''} ${error?.cause?.message || ''}`;
  if (/RemoteDebuggingAllowed[^\n]*(?:false|disabled|=\s*0)|disabled by (?:enterprise |organization |organisational )?policy|remote debugging.*(?:disabled|blocked).*policy/i.test(text)) return 'policy_disabled';
  if (/connection rejected|authorization rejected|permission denied by (?:the )?(?:user|browser)|unexpected server response: 403/i.test(text)) return 'authorization_rejected';
  if (/ECONNREFUSED/i.test(text)) return 'no_listener';
  if (/timed? out|timeout/i.test(text)) return 'waiting_for_authorization';
  if (/DevToolsActivePort|remote debugging is enabled by going/i.test(text) && !/cause:/i.test(text)) return 'authorization_required';
  return 'connection_failed';
}

export function dailyMessage(state) {
  const messages = {
    authorization_required: `Daily Edge remote debugging is not ready. Start Edge normally if needed.\n${DAILY_HELP}`,
    discovery_unavailable: 'Cannot read the Edge endpoint hint. Check access to the selected User Data Dir.',
    no_listener: `No active debugging listener. The DevToolsActivePort hint is stale; its old port is not a current endpoint.\n${DAILY_HELP}`,
    unreachable: `The endpoint hint could not be reached; browser authorization has not been established.\n${DAILY_HELP}`,
    endpoint_mismatch: 'The endpoint hint points to a different process. Refusing to attach. Re-enable remote debugging in the selected Edge instance.',
    ownership_unverified: 'Cannot confirm that the listener belongs to the selected Edge. Check process inspection permissions (and lsof on macOS/Linux). Use --ws-endpoint only if you independently trust that endpoint.',
    ready_to_attach: 'Edge listener found; authorization and CDP connectivity are not yet verified.',
    waiting_for_authorization: 'Waiting for browser authorization/connection. Check Edge for an Allow dialog. A timeout does not mean permission was rejected.',
    authorization_rejected: 'Edge rejected the debugging connection. Allow the request in Edge when you choose to retry; this can also indicate a browser-side connection restriction.',
    policy_disabled: 'Remote debugging is disabled by policy. Check edge://policy and contact your administrator; no policy is changed or bypassed.',
    connected: 'Connected through official MCP; list_pages succeeded.',
    connection_failed: `Official MCP could not establish the browser connection. Check Edge and its remote debugging settings.\n${DAILY_HELP}`,
    cancelled: 'Authorization/connection check cancelled.',
  };
  return messages[state] || messages.connection_failed;
}
