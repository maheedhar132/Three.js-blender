// Forwarder to run igzp-virtual-zoo/tools/verify-suite.js
import { fileURLToPath } from 'url';
import { resolve } from 'path';
import { spawnSync } from 'child_process';

const baseDir = fileURLToPath(new URL('..', import.meta.url));
const targetScript = resolve(baseDir, 'igzp-virtual-zoo', 'tools', 'verify-suite.js');
const zooDir = resolve(baseDir, 'igzp-virtual-zoo');

const res = spawnSync(process.execPath, [targetScript], {
  cwd: zooDir,
  stdio: 'inherit'
});

process.exit(res.status ?? 0);
