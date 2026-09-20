import { readdir, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
for (const directory of ['bin', 'src', 'test', 'scripts']) {
  for (const file of await readdir(new URL(`../${directory}/`, import.meta.url))) {
    if (!/\.[cm]?js$/.test(file)) continue;
    execFileSync(process.execPath, ['--check', `${directory}/${file}`], { stdio: 'inherit' });
  }
}
const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
if (manifest.version !== lock.version || manifest.version !== lock.packages[''].version) throw new Error('Package and lockfile versions must match.');
if (manifest.private || manifest.bin?.['edge-connect-mcp'] !== 'bin/edge-connect-mcp.js') throw new Error('Invalid npm package/bin.');
if (!/^\d+\.\d+\.\d+$/.test(manifest.dependencies['chrome-devtools-mcp'])) throw new Error('Upstream must be pinned to a tested version.');
console.log('Syntax and package configuration checks passed.');
