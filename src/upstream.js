import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { connectionState, dailyMessage } from './daily.js';

const require = createRequire(import.meta.url);
export async function upstreamCommand(connection) {
  const manifestPath = require.resolve('chrome-devtools-mcp/package.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin['chrome-devtools-mcp'];
  if (!bin) throw new Error('Installed chrome-devtools-mcp has no MCP executable. Reinstall dependencies.');
  return {
    executable: process.execPath,
    args: [path.resolve(path.dirname(manifestPath), bin), ...(connection?.mode === 'daily'
      ? ['--autoConnect', '--user-data-dir', connection.profile.root]
      : ['--wsEndpoint', typeof connection === 'string' ? connection : connection.wsEndpoint]),
      '--no-usage-statistics', '--no-performance-crux'],
    version: manifest.version,
  };
}

export function startUpstream(command) {
  return spawn(command.executable, command.args, {
    stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
    env: { ...process.env, CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: '1', CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS: '1' },
  });
}

export async function bridge(command, { input = process.stdin, output = process.stdout, errors = process.stderr, signal } = {}) {
  signal?.throwIfAborted();
  const child = startUpstream(command);
  return new Promise((resolve, reject) => {
    let shutdownTimer;
    let forceTimer;
    const stop = () => {
      input.unpipe(child.stdin);
      child.stdin.end();
      child.kill('SIGTERM');
      forceTimer ??= setTimeout(() => child.kill('SIGKILL'), 2000);
      forceTimer.unref();
    };
    const eof = () => { shutdownTimer ??= setTimeout(stop, 1500); shutdownTimer.unref(); };
    const cleanup = () => {
      clearTimeout(shutdownTimer); clearTimeout(forceTimer);
      input.unpipe(child.stdin); input.pause();
      input.off('end', eof); input.off('error', stop); output.off('error', stop);
      signal?.removeEventListener('abort', stop);
    };
    child.on('error', error => { cleanup(); reject(error); });
    child.on('close', (code, killedSignal) => { cleanup(); resolve(code ?? (signal?.aborted ? 0 : killedSignal ? 1 : 0)); });
    child.stdin.on('error', error => { if (error.code !== 'EPIPE') errors.write(`[edge-connect-mcp] Upstream input error: ${error.message}\n`); stop(); });
    input.on('end', eof); input.on('error', stop); output.on('error', stop);
    signal?.addEventListener('abort', stop, { once: true });
    child.stdout.pipe(output, { end: false });
    child.stderr.pipe(errors, { end: false });
    input.pipe(child.stdin);
    if (input.readableEnded) eof();
    if (signal?.aborted) stop();
  });
}

// A diagnostic MCP client only. DevTools tools are exclusively implemented upstream.
export async function probeMcp(command, { connectBrowser = false, timeout = 15000, authorizationTimeout = 60000, authorization = false, signal, onState = () => {} } = {}) {
  signal?.throwIfAborted();
  const child = startUpstream(command);
  let buffer = '';
  let nextId = 0;
  let failure;
  const pending = new Map();
  let protocolReady = false;
  let toolCount = 0;
  const fail = error => {
    failure = error;
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(error); }
    pending.clear();
  };
  child.stderr.resume(); // Do not include page URLs, local paths or noisy upstream logs in a report.
  child.on('error', fail);
  child.stdin.on('error', fail);
  child.on('exit', code => fail(new Error(`Upstream MCP exited (${code}).`)));
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    buffer += chunk;
    if (buffer.length > 4 * 1024 * 1024) { fail(new Error('MCP diagnostic response exceeded 4 MiB.')); child.kill(); return; }
    let index;
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
      if (!line.trim()) continue;
      let message;
      try { message = JSON.parse(line); } catch { fail(new Error('Upstream wrote non-JSON data to MCP stdout.')); return; }
      const request = pending.get(message.id);
      if (!request) continue;
      clearTimeout(request.timer); pending.delete(message.id);
      if (message.error) request.reject(new Error(`MCP ${request.method}: ${message.error.message}`));
      else request.resolve(message.result);
    }
  });
  const abort = () => fail(signal.reason);
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  function rpc(method, params, wait = timeout) {
    if (failure) return Promise.reject(failure);
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`MCP ${method} timed out.`)); }, wait);
      pending.set(id, { resolve, reject, timer, method });
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  }
  try {
    const initialized = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'edge-connect-mcp-doctor', version: '0.1.1' } });
    if (!initialized?.serverInfo || !initialized.protocolVersion) throw new Error('Invalid MCP initialize response.');
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
    const listed = await rpc('tools/list', {});
    if (!Array.isArray(listed?.tools) || !listed.tools.some(tool => tool.name === 'list_pages')) throw new Error('Official MCP did not expose list_pages.');
    protocolReady = true;
    toolCount = listed.tools.length;
    if (connectBrowser) {
      if (authorization) onState('waiting_for_authorization');
      const result = await rpc('tools/call', { name: 'list_pages', arguments: {} }, authorization ? authorizationTimeout : timeout);
      if (!result || result.isError) {
        // Inspect upstream's error chain for classification, never echo page data,
        // raw socket URLs or stale ports into the diagnostic report.
        const detail = (result?.content || []).filter(item => item.type === 'text').map(item => item.text).join('\n');
        const error = new Error('MCP list_pages failed to connect to Edge.');
        error.state = connectionState(detail);
        throw error;
      }
      if (authorization) onState('connected');
    }
    return { server: initialized.serverInfo.name, tools: listed.tools.length, browserConnected: connectBrowser };
  } catch (error) {
    if (protocolReady) {
      const state = signal?.aborted ? 'cancelled' : error.state || connectionState(error);
      const failure = new Error(authorization ? dailyMessage(state) : 'MCP list_pages failed to connect to Edge. Check browser version, policy, and CDP permissions.');
      Object.assign(failure, { state, protocolReady, tools: toolCount });
      if (authorization) onState(state);
      throw failure;
    }
    throw error;
  } finally {
    signal?.removeEventListener('abort', abort);
    fail(new Error('Diagnostic client closed.'));
    child.stdin.end();
    child.kill();
    // Wait for the direct child so doctor never leaves a hidden MCP server behind.
    await new Promise(resolve => {
      if (child.exitCode !== null || child.signalCode !== null) return resolve();
      const timer = setTimeout(() => { child.kill('SIGKILL'); }, 2000);
      child.once('close', () => { clearTimeout(timer); resolve(); });
    });
  }
}
