'use strict';

const { spawnSync } = require('node:child_process');

const files = [
  'app.js',
  'events.js',
  'sim.js',
  'ui.js',
  'storage.js',
  'src/events/eventResolver.js',
  'src/events/eventAnalysis.js',
  'src/events/eventFlags.js',
  'src/events/eventMemory.js',
  'src/simulation/plantState.js',
  'dev/verify_event_foundation.js',
  'dev/verify_event_resolver_guards.js'
];

let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status === 0) {
    console.log(`OK: ${file}`);
    continue;
  }

  failed = true;
  console.error(`FAIL: ${file}`);
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
}

if (failed) {
  process.exit(1);
}

console.log('Core syntax gate passed.');
