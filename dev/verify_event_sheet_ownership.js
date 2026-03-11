#!/usr/bin/env node
'use strict';

const fs = require('fs');

function check(ok, msg) {
  if (ok) {
    console.log(`OK: ${msg}`);
    return;
  }
  console.error(`FAIL: ${msg}`);
  process.exitCode = 1;
}

const app = fs.readFileSync('app.js', 'utf8');
const ui = fs.readFileSync('ui.js', 'utf8');

check(
  ui.includes('window.GrowSimUI = Object.freeze({')
  && ui.includes('renderEventSheet,')
  && ui.includes('closeSheet,')
  && ui.includes('dismissActiveEvent,')
  && ui.includes('openSheet'),
  'ui.js exports event-sheet UI API via window.GrowSimUI'
);

check(
  app.includes('const uiApi = window.GrowSimUI;')
  && app.includes('const requiredUiEventSheetFns = [')
  && app.includes('GrowSimUI API unvollständig'),
  'app.js validates GrowSimUI event-sheet API before rebinding'
);

check(
  app.includes('renderEventSheet = uiApi.renderEventSheet;')
  && app.includes('closeSheet = uiApi.closeSheet;')
  && app.includes('dismissActiveEvent = uiApi.dismissActiveEvent;')
  && app.includes('openSheet = uiApi.openSheet;'),
  'app.js delegates event-sheet UI behavior to ui.js functions'
);

check(
  app.includes("ownership.eventSheetUi = 'ui_module';") && app.includes('window.__gsDomainOwnership = ownership;'),
  'runtime ownership map records ui.js as event-sheet owner'
);

if (!process.exitCode) {
  console.log('Event-sheet ownership verification passed.');
}
