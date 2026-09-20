#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { HELP, parseOptions, supportedNode } from '../src/options.js';
import { prepareEdge, PRIVACY_NOTICE } from '../src/edge.js';
import { bridge, upstreamCommand } from '../src/upstream.js';
import { doctor } from '../src/doctor.js';
import { dailyMessage } from '../src/daily.js';

const controller = new AbortController();
const abort = () => controller.abort();
process.once('SIGINT', abort);
process.once('SIGTERM', abort);
const log = message => process.stderr.write(`[edge-connect-mcp] ${message}\n`);

try {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) process.stdout.write(HELP);
  else if (options.version) {
    const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    process.stdout.write(`${manifest.version}\n`);
  } else if (!supportedNode()) throw new Error('Node.js 20.19+, 22.12+, or >=23 is required. Use a supported Node LTS release.');
  else if (options.command === 'doctor') {
    process.stderr.write(`${PRIVACY_NOTICE}\n`);
    const report = await doctor(options, { log, signal: controller.signal });
    process.stdout.write(options.json ? `${JSON.stringify(report, null, 2)}\n` : `${report.checks.map(check => `[${check.status.toUpperCase()}] ${check.name}: ${check.detail}`).join('\n')}\n`);
    process.exitCode = report.ok ? 0 : 1;
  } else {
    // Always shown, including first run. Never read a confirmation from MCP stdin.
    process.stderr.write(`${PRIVACY_NOTICE}\n`);
    const edge = await prepareEdge(options, { log, signal: controller.signal });
    const command = await upstreamCommand(edge);
    log(edge.mode === 'daily' ? `${dailyMessage(edge.state)} Official MCP ${command.version} will request authorization on the first browser tool; check Edge for an Allow dialog.`
      : edge.mode === 'ws' ? `Starting official MCP ${command.version} with the user-selected WebSocket endpoint; browser identity is not preverified.`
      : `${edge.reused ? 'Reusing' : 'Connected to'} verified Microsoft Edge; starting official MCP ${command.version}.`);
    process.exitCode = await bridge(command, { signal: controller.signal });
  }
} catch (error) {
  if (!controller.signal.aborted) log(error.message);
  process.exitCode = controller.signal.aborted ? 0 : 1;
} finally {
  process.off('SIGINT', abort);
  process.off('SIGTERM', abort);
}
