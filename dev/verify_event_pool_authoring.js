'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');

const CATALOG_SOURCES = [
  { key: 'v1', file: 'data/events.json', optional: false },
  { key: 'foundation', file: 'data/events.foundation.json', optional: true },
  { key: 'v2', file: 'data/events.v2.json', optional: true }
];

const WARNING_CATEGORIES = new Set(['disease', 'pest', 'water', 'nutrition', 'environment']);
const VALID_TONES = new Set(['positive', 'neutral', 'negative']);

function readCatalog(source) {
  const absolutePath = path.join(REPO_ROOT, source.file);
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  } catch (error) {
    return {
      source,
      parseError: error.message,
      events: []
    };
  }

  const events = Array.isArray(payload) ? payload : payload.events;
  if (!Array.isArray(events)) {
    return {
      source,
      parseError: 'Catalog JSON must expose an array at root or .events',
      events: []
    };
  }

  return { source, parseError: null, events };
}

function normalizePhases(rawAllowedPhases) {
  if (!Array.isArray(rawAllowedPhases)) return [];
  return rawAllowedPhases.map((phase) => String(phase).trim().toLowerCase()).filter(Boolean);
}

function inferPool(eventDef) {
  const explicitPool = String((eventDef && eventDef.pool) || '').trim().toLowerCase();
  if (explicitPool) {
    return {
      pool: explicitPool,
      mode: 'explicit',
      reason: 'explicit_pool'
    };
  }

  const tags = Array.isArray(eventDef && eventDef.tags)
    ? eventDef.tags.map((tag) => String(tag).trim().toLowerCase())
    : [];
  const tone = String((eventDef && eventDef.tone) || 'neutral').trim().toLowerCase();
  const category = String((eventDef && eventDef.category) || '').trim().toLowerCase();
  const isFollowUp = eventDef && eventDef.isFollowUp === true;

  const hasRareHint = tags.includes('rare');
  const hasRewardHint = tags.includes('reward') || tone === 'positive' || category === 'positive';
  const hasWarningHint = tone === 'negative' || WARNING_CATEGORIES.has(category);

  if (hasRareHint) {
    return { pool: 'rare', mode: 'inferred', reason: 'tag:rare', ambiguous: false };
  }
  if (isFollowUp) {
    return { pool: 'recovery', mode: 'inferred', reason: 'isFollowUp', ambiguous: false };
  }
  if (hasRewardHint) {
    return {
      pool: 'reward',
      mode: 'inferred',
      reason: hasWarningHint ? 'reward_hint_conflicts_warning_hint' : 'reward_hint',
      ambiguous: hasWarningHint
    };
  }
  if (hasWarningHint) {
    return { pool: 'warning', mode: 'inferred', reason: 'warning_hint', ambiguous: false };
  }

  return {
    pool: 'stress',
    mode: 'inferred',
    reason: 'default_fallback',
    ambiguous: true
  };
}

function addIssue(list, level, code, message, eventRef) {
  list.push({ level, code, message, eventRef: eventRef || null });
}

function formatEventRef(item) {
  return `${item.sourceKey}:${item.eventId}`;
}

function topExamples(items, limit = 8) {
  return items.slice(0, limit).join(', ');
}

function summarizeByLevel(issues) {
  return issues.reduce((acc, issue) => {
    acc[issue.level] = (acc[issue.level] || 0) + 1;
    return acc;
  }, { error: 0, warning: 0, info: 0 });
}

function main() {
  const issues = [];
  const loadedSources = [];
  const parsedSources = [];
  const allEvents = [];

  for (const source of CATALOG_SOURCES) {
    const loaded = readCatalog(source);
    loadedSources.push(loaded);

    if (loaded.parseError) {
      const level = source.optional ? 'warning' : 'error';
      addIssue(
        issues,
        level,
        'catalog.parse_error',
        `${source.file} could not be parsed (${loaded.parseError}). Runtime skips this source.`,
        null
      );
      continue;
    }

    parsedSources.push(source);

    for (const eventDef of loaded.events) {
      const eventId = String((eventDef && eventDef.id) || '<missing-id>');
      const item = {
        sourceKey: source.key,
        sourceFile: source.file,
        eventId,
        eventDef: eventDef || {}
      };
      allEvents.push(item);
    }
  }

  const phaseSet = new Set();
  for (const item of allEvents) {
    for (const phase of normalizePhases(item.eventDef.allowedPhases)) {
      phaseSet.add(phase);
    }
  }
  const phases = Array.from(phaseSet).sort();

  const explicitPoolRefs = [];
  const inferredPoolRefs = [];
  const ambiguousInferredRefs = [];
  const rareEvents = [];
  const rareByPhase = Object.fromEntries(phases.map((phase) => [phase, 0]));
  let rareUnscopedCount = 0;

  const missingToneRefs = [];
  const missingCategoryRefs = [];
  const missingAllowedPhasesRefs = [];
  const invalidToneRefs = [];
  const followUpWeakHintRefs = [];

  for (const item of allEvents) {
    const eventDef = item.eventDef;
    const inferred = inferPool(eventDef);
    const allowedPhases = normalizePhases(eventDef.allowedPhases);
    const ref = formatEventRef(item);

    if (inferred.mode === 'explicit') {
      explicitPoolRefs.push(`${ref}(${inferred.pool})`);
    } else {
      inferredPoolRefs.push(`${ref}(${inferred.pool}:${inferred.reason})`);
      if (inferred.ambiguous) {
        ambiguousInferredRefs.push(`${ref}(${inferred.reason})`);
      }
    }

    if (inferred.pool === 'rare') {
      rareEvents.push(ref);
      if (allowedPhases.length === 0) {
        rareUnscopedCount += 1;
        for (const phase of phases) {
          rareByPhase[phase] += 1;
        }
      } else {
        for (const phase of allowedPhases) {
          if (!Object.prototype.hasOwnProperty.call(rareByPhase, phase)) {
            rareByPhase[phase] = 0;
          }
          rareByPhase[phase] += 1;
        }
      }
    }

    const hasToneField = Object.prototype.hasOwnProperty.call(eventDef, 'tone');
    const toneValue = String((eventDef && eventDef.tone) || '').trim().toLowerCase();
    if (!hasToneField || !toneValue) {
      missingToneRefs.push(ref);
    } else if (!VALID_TONES.has(toneValue)) {
      invalidToneRefs.push(`${ref}(${toneValue})`);
    }

    const hasCategory = Object.prototype.hasOwnProperty.call(eventDef, 'category');
    const categoryValue = String((eventDef && eventDef.category) || '').trim();
    if (!hasCategory || !categoryValue) {
      missingCategoryRefs.push(ref);
    }

    if (!Array.isArray(eventDef.allowedPhases) || allowedPhases.length === 0) {
      missingAllowedPhasesRefs.push(ref);
      if (inferred.pool === 'rare' || eventDef.isFollowUp === true) {
        addIssue(
          issues,
          'warning',
          'allowedPhases.unscoped_sensitive',
          `${ref} is ${inferred.pool === 'rare' ? 'rare-pooled' : 'follow-up'} but has allow-all phase scope`,
          ref
        );
      }
    }

    if (eventDef.isFollowUp === true) {
      const hasPoolHint = Boolean(String((eventDef && eventDef.pool) || '').trim())
        || Boolean(String((eventDef && eventDef.tone) || '').trim())
        || Boolean(String((eventDef && eventDef.category) || '').trim())
        || (Array.isArray(eventDef.tags) && eventDef.tags.length > 0);
      if (!hasPoolHint) {
        followUpWeakHintRefs.push(ref);
      }
    }
  }

  if (invalidToneRefs.length > 0) {
    addIssue(
      issues,
      'error',
      'tone.invalid',
      `Invalid tone values found (${invalidToneRefs.length}): ${topExamples(invalidToneRefs)}`,
      null
    );
  }

  if (ambiguousInferredRefs.length > 0) {
    addIssue(
      issues,
      'warning',
      'pool.inferred_ambiguous',
      `Ambiguous inferred pool events (${ambiguousInferredRefs.length}): ${topExamples(ambiguousInferredRefs)}`,
      null
    );
  }

  if (missingToneRefs.length > 0) {
    addIssue(
      issues,
      'warning',
      'tone.missing',
      `Missing tone on ${missingToneRefs.length} events: ${topExamples(missingToneRefs)}`,
      null
    );
  }

  if (missingCategoryRefs.length > 0) {
    addIssue(
      issues,
      'warning',
      'category.missing',
      `Missing category on ${missingCategoryRefs.length} events: ${topExamples(missingCategoryRefs)}`,
      null
    );
  }

  if (missingAllowedPhasesRefs.length > 0) {
    addIssue(
      issues,
      'info',
      'allowedPhases.unscoped',
      `Events with allow-all phase scope (${missingAllowedPhasesRefs.length}): ${topExamples(missingAllowedPhasesRefs)}`,
      null
    );
  }

  if (followUpWeakHintRefs.length > 0) {
    addIssue(
      issues,
      'warning',
      'followup.weak_hints',
      `Follow-up events with weak metadata hints (${followUpWeakHintRefs.length}): ${topExamples(followUpWeakHintRefs)}`,
      null
    );
  }

  const zeroRarePhases = phases.filter((phase) => Number(rareByPhase[phase] || 0) === 0);
  if (zeroRarePhases.length > 0) {
    addIssue(
      issues,
      'info',
      'rare.phase_zero',
      `Phases with zero rare-pool events: ${zeroRarePhases.join(', ')}`,
      null
    );
  }

  const densities = phases.map((phase) => ({ phase, count: Number(rareByPhase[phase] || 0) }));
  const maxDensity = densities.reduce((max, row) => Math.max(max, row.count), 0);
  const minDensity = densities.reduce((min, row) => Math.min(min, row.count), densities.length ? densities[0].count : 0);
  if (densities.length > 1 && maxDensity >= 3 && minDensity > 0 && maxDensity / minDensity >= 3) {
    const densePhase = densities.find((row) => row.count === maxDensity);
    addIssue(
      issues,
      'warning',
      'rare.phase_density_skew',
      `Rare distribution is skewed (max/min >= 3). Densest phase: ${densePhase.phase} (${densePhase.count}).`,
      null
    );
  }

  const summaryByLevel = summarizeByLevel(issues);

  console.log('Event Pool Authoring Quality Check');
  console.log('=================================');
  console.log(`Runtime source files considered: ${CATALOG_SOURCES.map((entry) => entry.file).join(', ')}`);
  console.log(`Active runtime sources (parsed): ${parsedSources.map((entry) => entry.file).join(', ') || 'none'}`);
  console.log(`Runtime sources skipped due to parse/shape issues: ${loadedSources.filter((x) => x.parseError).length}`);
  console.log(`Runtime events analyzed: ${allEvents.length}`);
  console.log(`Observed phase vocabulary from runtime catalogs: ${phases.join(', ') || 'none'}`);
  console.log('');

  console.log('Pool coverage summary');
  console.log('---------------------');
  console.log(`Explicit pool events: ${explicitPoolRefs.length}`);
  console.log(`Inferred pool events: ${inferredPoolRefs.length}`);
  console.log(`Ambiguous inferred events: ${ambiguousInferredRefs.length}`);
  if (ambiguousInferredRefs.length > 0) {
    console.log(`  examples: ${topExamples(ambiguousInferredRefs)}`);
  }
  console.log('');

  console.log('Inferred-pool summary');
  console.log('---------------------');
  const byPool = inferredPoolRefs.reduce((acc, ref) => {
    const m = ref.match(/\(([^:]+):/);
    const pool = m ? m[1] : 'unknown';
    acc[pool] = (acc[pool] || 0) + 1;
    return acc;
  }, {});
  const poolNames = Object.keys(byPool).sort();
  for (const pool of poolNames) {
    console.log(`- ${pool}: ${byPool[pool]}`);
  }
  if (!poolNames.length) {
    console.log('- none');
  }
  console.log('');

  console.log('Rare distribution by phase');
  console.log('--------------------------');
  console.log(`Rare events total: ${rareEvents.length}`);
  console.log(`Rare events with unscoped phases (allow-all): ${rareUnscopedCount}`);
  for (const phase of phases) {
    console.log(`- ${phase}: ${Number(rareByPhase[phase] || 0)}`);
  }
  if (!phases.length) {
    console.log('- none');
  }
  console.log('');

  console.log('Metadata warning summary');
  console.log('------------------------');
  console.log(`Missing tone: ${missingToneRefs.length}`);
  console.log(`Missing category: ${missingCategoryRefs.length}`);
  console.log(`Allow-all phase scope (missing/empty allowedPhases): ${missingAllowedPhasesRefs.length}`);
  console.log(`Follow-up weak-hint candidates: ${followUpWeakHintRefs.length}`);
  console.log('');

  const order = ['error', 'warning', 'info'];
  for (const level of order) {
    const items = issues.filter((issue) => issue.level === level);
    console.log(`${level.toUpperCase()} (${items.length})`);
    for (const issue of items) {
      console.log(`- [${issue.code}] ${issue.message}`);
    }
    console.log('');
  }

  const hardErrors = summaryByLevel.error;
  console.log(`Summary: errors=${summaryByLevel.error} warnings=${summaryByLevel.warning} info=${summaryByLevel.info}`);
  if (hardErrors > 0) {
    process.exitCode = 1;
  }
}

main();
