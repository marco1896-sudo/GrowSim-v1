#!/usr/bin/env node
'use strict';

const fs = require('fs');

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

function pass(message) {
  console.log(`OK: ${message}`);
}

const app = fs.readFileSync('app.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

const checks = [
  {
    name: 'UI label describes event timer acceleration',
    test: () => html.includes('Ereignis-Boost (-30 Min Eventzeit)')
  },
  {
    name: 'HUD usage text explains limited plant impulse',
    test: () => app.includes('Event -30 Min · kleiner Pflanzenimpuls')
  },
  {
    name: 'Boost log explains mixed effect explicitly',
    test: () => app.includes('Ereignis-Boost angewendet (Event-Timer -30 Min, Pflanze leicht angestoßen)')
  },
  {
    name: 'Boost advances event scheduler by BOOST_ADVANCE_MS only in idle/cooldown',
    test: () => app.includes("if (state.events.machineState === 'idle' || state.events.machineState === 'cooldown')")
      && app.includes('state.events.scheduler.nextEventRealTimeMs = Math.max(nowMs, state.events.scheduler.nextEventRealTimeMs - BOOST_ADVANCE_MS);')
  },
  {
    name: 'Boost keeps limited plant simulation effect (3 min drift + 2% growth)',
    test: () => app.includes('const BOOST_PLANT_EFFECT_MS = 3 * 60 * 1000;')
      && app.includes('const BOOST_GROWTH_PERCENT_DELTA = 0.02;')
      && app.includes('applyStatusDrift(BOOST_PLANT_EFFECT_MS);')
      && app.includes('applyGrowthPercentDelta(BOOST_GROWTH_PERCENT_DELTA);')
  }
];

for (const check of checks) {
  if (check.test()) {
    pass(check.name);
  } else {
    fail(check.name);
  }
}

if (!process.exitCode) {
  console.log('Boost semantics verification passed.');
}
