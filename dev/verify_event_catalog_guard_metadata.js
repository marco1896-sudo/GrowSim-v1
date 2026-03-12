'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');

const CATALOG_SOURCES = [
  { key: 'v1', file: 'data/events.json', optional: false },
  { key: 'foundation', file: 'data/events.foundation.json', optional: true },
  { key: 'v2', file: 'data/events.v2.json', optional: true }
];

const VALID_TONES = new Set(['positive', 'neutral', 'negative']);
// Canonical phase vocabulary is taken from the current runtime catalogs.
const VALID_PHASES = new Set(['seedling', 'vegetative', 'flowering', 'harvest']);

function loadCatalog(source) {
  const absolutePath = path.join(REPO_ROOT, source.file);
  const rawText = fs.readFileSync(absolutePath, 'utf8');

  let payload;
  try {
    payload = JSON.parse(rawText);
  } catch (error) {
    return {
      source,
      absolutePath,
      parseError: error.message
    };
  }

  const events = Array.isArray(payload) ? payload : payload.events;
  if (!Array.isArray(events)) {
    return {
      source,
      absolutePath,
      parseError: 'Catalog JSON does not expose an array at root or .events'
    };
  }

  return {
    source,
    absolutePath,
    events
  };
}

function checkEventMetadata(eventDef, catalogKey) {
  const issues = [];
  const eventId = String((eventDef && eventDef.id) || '<missing-id>');

  const tonePresent = Object.prototype.hasOwnProperty.call(eventDef, 'tone');
  const toneRaw = tonePresent ? String(eventDef.tone).trim().toLowerCase() : '';
  if (!tonePresent || !toneRaw) {
    issues.push({
      level: 'warning',
      code: 'tone.defaulted',
      eventId,
      message: `${catalogKey}:${eventId} missing tone; resolver defaults to neutral`
    });
  } else if (!VALID_TONES.has(toneRaw)) {
    issues.push({
      level: 'error',
      code: 'tone.invalid',
      eventId,
      message: `${catalogKey}:${eventId} has invalid tone="${toneRaw}" (valid: positive|neutral|negative)`
    });
  }

  const hasAllowedPhases = Object.prototype.hasOwnProperty.call(eventDef, 'allowedPhases');
  if (!hasAllowedPhases) {
    issues.push({
      level: 'warning',
      code: 'allowedPhases.defaulted',
      eventId,
      message: `${catalogKey}:${eventId} missing allowedPhases; phase guard becomes allow-all`
    });
  } else if (!Array.isArray(eventDef.allowedPhases)) {
    issues.push({
      level: 'error',
      code: 'allowedPhases.shape',
      eventId,
      message: `${catalogKey}:${eventId} allowedPhases must be an array`
    });
  } else if (eventDef.allowedPhases.length === 0) {
    issues.push({
      level: 'warning',
      code: 'allowedPhases.empty',
      eventId,
      message: `${catalogKey}:${eventId} has empty allowedPhases; phase guard becomes allow-all`
    });
  } else {
    const normalizedPhases = eventDef.allowedPhases.map((phase) => String(phase).trim().toLowerCase());
    const invalidPhases = normalizedPhases.filter((phase) => !VALID_PHASES.has(phase));
    if (invalidPhases.length > 0) {
      issues.push({
        level: 'error',
        code: 'allowedPhases.invalid',
        eventId,
        message: `${catalogKey}:${eventId} has invalid phase values: ${JSON.stringify(invalidPhases)}`
      });
    }
  }

  if (!Object.prototype.hasOwnProperty.call(eventDef, 'category')) {
    issues.push({
      level: 'info',
      code: 'category.inferred',
      eventId,
      message: `${catalogKey}:${eventId} missing category; runtime will infer/fallback`
    });
  }

  const options = Array.isArray(eventDef.options)
    ? eventDef.options
    : (Array.isArray(eventDef.choices) ? eventDef.choices : []);
  const hasFollowUpMarkers = options.some((option) => {
    if (!option || typeof option !== 'object') return false;
    return Boolean(option.followUp) || (Array.isArray(option.followUps) && option.followUps.length > 0);
  });

  if (eventDef.isFollowUp === true && !hasFollowUpMarkers) {
    issues.push({
      level: 'info',
      code: 'followup.marker_review',
      eventId,
      message: `${catalogKey}:${eventId} marked isFollowUp=true but no option followUp marker found`
    });
  }

  return issues;
}

function summarizeByLevel(issues) {
  return issues.reduce((acc, issue) => {
    acc[issue.level] = (acc[issue.level] || 0) + 1;
    return acc;
  }, { error: 0, warning: 0, info: 0 });
}

function main() {
  const allIssues = [];
  const parseFailures = [];
  const cleanEvents = [];
  const defaultedEvents = [];

  for (const source of CATALOG_SOURCES) {
    const loaded = loadCatalog(source);
    if (loaded.parseError) {
      parseFailures.push(`[ERROR] ${source.file}: ${loaded.parseError}`);
      continue;
    }

    for (const eventDef of loaded.events) {
      const issues = checkEventMetadata(eventDef || {}, source.key);
      const hasError = issues.some((issue) => issue.level === 'error');
      const hasWarning = issues.some((issue) => issue.level === 'warning');
      const eventId = String((eventDef && eventDef.id) || '<missing-id>');

      if (!hasError && !hasWarning) {
        cleanEvents.push(`${source.key}:${eventId}`);
      }

      if (issues.some((issue) => issue.code === 'tone.defaulted' || issue.code.startsWith('allowedPhases.defaulted') || issue.code === 'allowedPhases.empty')) {
        defaultedEvents.push(`${source.key}:${eventId}`);
      }

      allIssues.push(...issues);
    }
  }

  const summary = summarizeByLevel(allIssues);
  const hardErrorCount = summary.error + parseFailures.length;

  console.log('Event Catalog Guard Metadata Verification');
  console.log('=======================================');
  console.log(`Catalog sources checked: ${CATALOG_SOURCES.map((entry) => entry.file).join(', ')}`);
  console.log(`Canonical phase vocabulary: ${Array.from(VALID_PHASES).join(', ')}`);
  console.log(`Valid tone vocabulary: ${Array.from(VALID_TONES).join(', ')}`);
  console.log('');

  if (parseFailures.length > 0) {
    console.log('Hard errors (catalog parse/shape):');
    for (const item of parseFailures) {
      console.log(`  - ${item}`);
    }
    console.log('');
  }

  const orderedLevels = ['error', 'warning', 'info'];
  for (const level of orderedLevels) {
    const entries = allIssues.filter((issue) => issue.level === level);
    console.log(`${level.toUpperCase()} (${entries.length})`);
    for (const issue of entries) {
      console.log(`  - [${issue.code}] ${issue.message}`);
    }
    console.log('');
  }

  console.log(`Clean events (no errors/warnings): ${cleanEvents.length}`);
  if (cleanEvents.length) {
    console.log(`  ${cleanEvents.join(', ')}`);
  }
  console.log(`Events relying on defaults: ${defaultedEvents.length}`);
  if (defaultedEvents.length) {
    console.log(`  ${defaultedEvents.join(', ')}`);
  }
  console.log('');
  console.log(`Summary: errors=${hardErrorCount} warnings=${summary.warning} info=${summary.info}`);

  if (hardErrorCount > 0) {
    process.exitCode = 1;
  }
}

main();
