'use strict';

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = {
    base: null,
    candidate: null
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--base') {
      args.base = path.resolve(process.cwd(), argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === '--candidate') {
      args.candidate = path.resolve(process.cwd(), argv[i + 1]);
      i += 1;
    }
  }

  if (!args.base || !args.candidate) {
    throw new Error('Usage: node dev/compare_replay_trace.js --base <traceA.json> --candidate <traceB.json>');
  }
  return args;
}

function loadTrace(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sameList(a, b) {
  return JSON.stringify(Array.isArray(a) ? a : []) === JSON.stringify(Array.isArray(b) ? b : []);
}

function compareTraces(baseTrace, candidateTrace) {
  const baseTicks = Array.isArray(baseTrace.ticks) ? baseTrace.ticks : [];
  const candidateTicks = Array.isArray(candidateTrace.ticks) ? candidateTrace.ticks : [];
  const maxTicks = Math.max(baseTicks.length, candidateTicks.length);

  const changedSelections = [];
  const changedGuardFiltering = [];
  const changedEventOrdering = [];

  for (let i = 0; i < maxTicks; i += 1) {
    const tickNo = i + 1;
    const left = baseTicks[i] || null;
    const right = candidateTicks[i] || null;

    if (!left || !right) {
      changedSelections.push({
        tick: tickNo,
        baseSelected: left ? left.selectedEvent : null,
        candidateSelected: right ? right.selectedEvent : null,
        reason: 'missing_tick'
      });
      continue;
    }

    if (left.selectedEvent !== right.selectedEvent) {
      changedSelections.push({
        tick: tickNo,
        baseSelected: left.selectedEvent,
        candidateSelected: right.selectedEvent
      });
    }

    const guardDiff = {};
    for (const key of ['afterPhaseGuard', 'afterRepeatGuard', 'afterFrustrationGuard']) {
      if (!sameList(left[key], right[key])) {
        guardDiff[key] = {
          base: left[key],
          candidate: right[key]
        };
      }
    }
    if (Object.keys(guardDiff).length) {
      changedGuardFiltering.push({ tick: tickNo, ...guardDiff });
    }

    if (!sameList(left.candidates, right.candidates)) {
      const leftSet = new Set(left.candidates || []);
      const rightSet = new Set(right.candidates || []);
      const sameMembers = leftSet.size === rightSet.size
        && Array.from(leftSet).every((eventId) => rightSet.has(eventId));

      if (sameMembers) {
        changedEventOrdering.push({
          tick: tickNo,
          baseCandidates: left.candidates,
          candidateCandidates: right.candidates
        });
      }
    }
  }

  return {
    baseSeed: baseTrace.seed,
    candidateSeed: candidateTrace.seed,
    baseTicks: baseTicks.length,
    candidateTicks: candidateTicks.length,
    changedSelections,
    changedGuardFiltering,
    changedEventOrdering
  };
}

(function main() {
  const args = parseArgs(process.argv);
  const baseTrace = loadTrace(args.base);
  const candidateTrace = loadTrace(args.candidate);
  const diff = compareTraces(baseTrace, candidateTrace);

  console.log(JSON.stringify(diff, null, 2));

  const hasDifferences = diff.changedSelections.length
    || diff.changedGuardFiltering.length
    || diff.changedEventOrdering.length
    || diff.baseTicks !== diff.candidateTicks;

  process.exit(hasDifferences ? 1 : 0);
})();
