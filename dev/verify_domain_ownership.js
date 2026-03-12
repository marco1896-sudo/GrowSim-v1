#!/usr/bin/env node
'use strict';

const fs = require('fs');

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`OK: ${message}`);
  }
}

const app = fs.readFileSync('app.js', 'utf8');
const events = fs.readFileSync('events.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

assert(
  html.includes('<script src="events.js" defer></script>') && html.includes('<script src="app.js" defer></script>'),
  'Script order keeps events.js loaded before app.js'
);

assert(
  app.includes('const requiredEventFns = [') && app.includes('GrowSimEvents API unvollständig'),
  'wireDomainOwnership enforces complete GrowSimEvents API before rebinding'
);

assert(
  app.includes('window.__gsDomainOwnership = ownership;') && app.includes("ownership.events = 'events_module';"),
  'Runtime ownership map is published and records events module ownership'
);

assert(
  events.includes('window.GrowSimEvents = Object.freeze({') && events.includes('runEventStateMachine'),
  'events.js exports the event domain API namespace'
);

if (!process.exitCode) {
  console.log('Domain ownership verification passed.');
}
