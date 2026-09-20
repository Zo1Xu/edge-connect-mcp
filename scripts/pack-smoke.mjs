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
  for (const file of ['bin/edge-connect-mcp.js', 'src/cdp.js', 'README.md', 'SECURITY.md', 'LICENSE']) assert.ok(files.includes(file), `Missing ${file}`);
  assert.ok(files.every(file => !/^(?:node_modules|test|scripts|\.git|\.artifacts|\.test-profile)\//.test(file)), 'Private/development files leaked into package');
  await npm(['install', '--prefix', root, '--ignore-scripts', '--no-audit', '--no-fund', path.join(root, packed.filename)], root);
  const version = await npm(['exec', '--offline', '--', 'edge-connect-mcp', '--version'], root);
  assert.equal(version.trim(), manifest.version);
  const help = await npm(['exec', '--offline', '--', 'edge-connect-mcp', '--help'], root);
  assert.match(help, /--isolated/);
  const installed = path.join(root, 'node_modules', manifest.name, 'src', 'upstream.js');
  const { pathToFileURL } = await import('node:url');
  const { upstreamCommand, probeMcp } = await import(pathToFileURL(installed).href);
  const result = await probeMcp(await upstreamCommand('ws://127.0.0.1:1/devtools/browser/pack'));
  assert.ok(result.tools > 0);
  console.log(`Packed ${packed.files.length} files; installed npm bin, help and official MCP handshake passed.`);
} finally {
  await rm(root, { recursive: true, force: true });
}
