import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('../', import.meta.url));
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run this script via npm run test:pack.');
const root = await mkdtemp(path.join(os.tmpdir(), 'edge-connect-mcp-pack-'));
function npm(args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [npmCli, ...args], { cwd, windowsHide: true });
    let output = '', error = '';
    child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { error += data; });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(output) : reject(new Error(`npm ${args[0]} failed: ${error}`)));
  });
}
try {
  const manifest = JSON.parse(await readFile(path.join(project, 'package.json'), 'utf8'));
  const [packed] = JSON.parse(await npm(['pack', '--ignore-scripts', '--json', '--pack-destination', root], project));
  const files = packed.files.map(file => file.path);
  assert.ok(manifest.files.every(file => !/[?*]|\/$|(?:^|\/)\.\.(?:\/|$)/.test(file)), 'Package whitelist must contain explicit file paths only');
  assert.deepEqual([...files].sort(), [...new Set(['package.json', ...manifest.files])].sort(), 'Packed files must exactly match the explicit whitelist');
  for (const file of ['bin/edge-connect-mcp.js', 'src/cdp.js', 'src/daily.js', 'README.md', 'README.zh-CN.md', 'SECURITY.md', 'SECURITY.zh-CN.md', 'CHANGELOG.md', 'CHANGELOG.zh-CN.md', 'LICENSE']) assert.ok(files.includes(file), `Missing ${file}`);
  assert.ok(files.every(file => !/^(?:node_modules|test|scripts|\.git|\.artifacts|\.test-profile)\//.test(file)), 'Private/development files leaked into package');
  await npm(['install', '--prefix', root, '--ignore-scripts', '--no-audit', '--no-fund', path.join(root, packed.filename)], root);
  const version = await npm(['exec', '--offline', '--', 'edge-connect-mcp', '--version'], root);
  assert.equal(version.trim(), manifest.version);
  const help = await npm(['exec', '--offline', '--', 'edge-connect-mcp', '--help'], root);
  assert.match(help, /--isolated/);
  assert.match(help, /edge:\/\/inspect\/#remote-debugging/);
  assert.match(help, /--ws-endpoint/);
  const installed = path.join(root, 'node_modules', manifest.name, 'src', 'upstream.js');
  const { pathToFileURL } = await import('node:url');
  const { upstreamCommand, probeMcp } = await import(pathToFileURL(installed).href);
  const result = await probeMcp(await upstreamCommand('ws://127.0.0.1:1/devtools/browser/pack'));
  assert.ok(result.tools > 0);
  const daily = await upstreamCommand({ mode: 'daily', profile: { root: path.join(root, 'unused-daily') } });
  assert.ok(daily.args.includes('--autoConnect'));
  assert.ok(!daily.args.includes('--wsEndpoint'));
  assert.ok((await probeMcp(daily)).tools > 0); // handshake only; never request browser authorization
  console.log(`Packed ${packed.files.length} files; installed npm bin, help and official MCP handshake passed.`);
} finally {
  if (path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('edge-connect-mcp-pack-')) throw new Error('Refusing cleanup outside the generated pack test directory.');
  await rm(root, { recursive: true, force: true });
}
