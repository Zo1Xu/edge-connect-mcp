import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { doctor } from '../src/doctor.js';
import { prepareEdge, PRIVACY_NOTICE } from '../src/edge.js';
import { activePort } from '../src/platform.js';
import { verifyCdp } from '../src/cdp.js';
import { probeMcp } from '../src/upstream.js';
import { fileURLToPath } from 'node:url';

// Opt-in desktop test; only this unique temporary browser belongs to the test.
if (typeof WebSocket === 'undefined') throw new Error('The optional desktop smoke test requires Node 22+ for WebSocket cleanup.');
const root = await mkdtemp(path.join(os.tmpdir(), 'edge-connect-mcp-desktop-'));
let connection;
let closed = false;
try {
  console.error(PRIVACY_NOTICE);
  const options = { profile: root, timeout: 30000 };
  connection = await prepareEdge(options, { log: console.error });
  assert.equal(connection.reused, false);
  const reused = await prepareEdge(options);
  assert.equal(reused.reused, true);
  assert.equal(reused.wsEndpoint, connection.wsEndpoint);
  const result = await doctor({ ...options, command: 'doctor' });
  console.log(JSON.stringify(result, null, 2));
  assert.equal(result.ok, true);
  assert.equal(result.checks.find(check => check.name === 'MCP → Edge')?.status, 'pass');
  const bridged = await probeMcp({ executable: process.execPath,
    args: [fileURLToPath(new URL('../bin/edge-connect-mcp.js', import.meta.url)), '--profile', root],
  }, { connectBrowser: true, timeout: 30000 });
  assert.equal(bridged.browserConnected, true);
  console.log('Full CLI stdio → official MCP → real Edge list_pages passed.');
} finally {
  // Even a failed launch may have created a browser; validate this exact test profile's metadata.
  if (!connection) {
    const port = await activePort(root);
    if (port) connection = await verifyCdp(port.url, { socketPath: port.socketPath }).catch(() => undefined);
  }
  if (connection) {
    await new Promise(resolve => {
        const socket = new WebSocket(connection.wsEndpoint);
        const timer = setTimeout(() => { socket.close(); resolve(); }, 5000);
        socket.addEventListener('open', () => socket.send(JSON.stringify({ id: 1, method: 'Browser.close' })));
        socket.addEventListener('close', () => { clearTimeout(timer); closed = true; resolve(); });
        socket.addEventListener('error', () => { clearTimeout(timer); resolve(); });
    });
  }
  if (closed) {
    await delay(1500);
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  } else console.error(`Test browser closure could not be verified; retained temporary profile: ${root}`);
}
