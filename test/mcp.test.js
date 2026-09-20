import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { upstreamCommand, probeMcp, bridge } from '../src/upstream.js';

test('real official MCP initializes and lists tools without launching a browser', { timeout: 30000 }, async () => {
  const command = await upstreamCommand('ws://127.0.0.1:1/devtools/browser/test');
  assert.ok(command.args.includes('--no-usage-statistics'));
  assert.ok(command.args.includes('--no-performance-crux'));
  const result = await probeMcp(command);
  assert.ok(result.tools > 0);
  assert.equal(result.browserConnected, false);
});

test('bridge preserves exact stdio bytes and keeps diagnostics on stderr', { timeout: 10000 }, async () => {
  const input = new PassThrough(); const output = new PassThrough(); const errors = new PassThrough();
  let stdout = '', stderr = '';
  output.on('data', data => { stdout += data; }); errors.on('data', data => { stderr += data; });
  const code = bridge({ executable: process.execPath, args: ['-e', 'process.stderr.write("diagnostic"); process.stdin.pipe(process.stdout)'] }, { input, output, errors });
  const payload = '{"jsonrpc":"2.0","id":1}\n';
  input.end(payload);
  assert.equal(await code, 0);
  assert.equal(stdout, payload);
  assert.equal(stderr, 'diagnostic');
});

test('bridge forwards exit code', { timeout: 10000 }, async () => {
  const input = new PassThrough();
  assert.equal(await bridge({ executable: process.execPath, args: ['-e', 'process.exit(7)'] }, { input, output: new PassThrough(), errors: new PassThrough() }), 7);
});

test('bridge closes upstream on cancellation', { timeout: 10000 }, async () => {
  const controller = new AbortController();
  const running = bridge({ executable: process.execPath, args: ['-e', 'setInterval(()=>{},1000)'] }, { input: new PassThrough(), output: new PassThrough(), errors: new PassThrough(), signal: controller.signal });
  await delay(200);
  controller.abort();
  assert.equal(await running, 0);
});

test('bridge closes uncooperative upstream after client EOF', { timeout: 10000 }, async () => {
  const input = new PassThrough();
  const running = bridge({ executable: process.execPath, args: ['-e', 'setInterval(()=>{},1000)'] }, { input, output: new PassThrough(), errors: new PassThrough() });
  input.end();
  await running;
});

test('CLI invalid options never contaminate MCP stdout', { timeout: 10000 }, async () => {
  const child = spawn(process.execPath, ['bin/edge-connect-mcp.js', '--port', 'invalid'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', data => { stdout += data; }); child.stderr.on('data', data => { stderr += data; });
  const code = await new Promise(resolve => child.on('close', resolve));
  assert.equal(code, 1); assert.equal(stdout, ''); assert.match(stderr, /Invalid port/);
});
