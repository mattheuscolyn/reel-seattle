import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

function collectTestFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTestFiles(path));
    } else if (entry.name.endsWith('.test.mjs')) {
      files.push(path);
    }
  }
  return files;
}

const testsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'frontend');
const testFiles = collectTestFiles(testsDir).sort();

if (testFiles.length === 0) {
  console.error('No frontend test files found under tests/frontend');
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--test', ...testFiles], {
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
