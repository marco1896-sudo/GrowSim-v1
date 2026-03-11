'use strict';

(function initEventAnalysis(globalScope) {
  const DEFAULT_TONE = 'neutral';

  function ensureAnalysisStore(eventsState) {
    const events = eventsState && typeof eventsState === 'object' ? eventsState : {};
    if (!events.foundation || typeof events.foundation !== 'object') {
      events.foundation = {};
    }
    if (!Array.isArray(events.foundation.analysis)) {
      events.foundation.analysis = [];
    }
    return events.foundation.analysis;
  }

  function inferRelatedChainId(memoryState) {
    const pendingChains = memoryState && memoryState.pendingChains && typeof memoryState.pendingChains === 'object'
      ? memoryState.pendingChains
      : {};
    const ids = Object.keys(pendingChains);
    return ids.length ? ids[ids.length - 1] : null;
  }

  function templatesFor(eventId, optionId) {
    const byEventOption = {
      drooping_leaves_warning: {
        reduce_watering_now: {
          tone: 'recovery',
          actionText: 'Du hast die Bewässerung reduziert und die Drainage priorisiert.',
          causeText: 'Die Pflanze zeigte bereits typische Anzeichen für Überwässerung.',
          resultText: 'Der Wurzelbereich kann wieder besser atmen, wodurch Stress und Folge-Risiken sinken.',
          guidanceText: 'Beobachte in den nächsten Zyklen Blattspannung und gieße nur bei klarer Trockenheit nach.'
        },
        ignore_signals: {
          tone: 'warning',
          actionText: 'Du hast Warnzeichen ignoriert und das bisherige Gießmuster fortgeführt.',
          causeText: 'Das Substrat war bereits feucht, sodass zusätzlicher Wasserdruck die Wurzelzone belastet.',
          resultText: 'Die Gefahr von Wurzelstress steigt, was als Folgeereignis nachziehen kann.',
          guidanceText: 'Prüfe jetzt aktiv Feuchte und Drainage, um eine Stresskette im Wurzelbereich zu stoppen.'
        }
      },
      root_stress_followup: {
        recover_root_zone: {
          tone: 'recovery',
          actionText: 'Du hast den Wurzelbereich stabilisiert und eine Bewässerungspause eingeleitet.',
          causeText: 'Nach anhaltender Nässe brauchen Wurzeln Sauerstoff und Zeit zur Regeneration.',
          resultText: 'Akuter Wurzelstress wird abgebaut und die Pflanze erhält ein Erholungsfenster.',
          guidanceText: 'Nutze das Recovery-Fenster für kontrollierte, kleinere Gießimpulse statt Vollsättigung.'
        }
      },
      stable_growth_reward: {
        keep_current_plan: {
          tone: 'positive',
          actionText: 'Du hast den stabilen Pflegeplan bewusst beibehalten.',
          causeText: 'Konstante Wasser-, Nährstoff- und Stresswerte schaffen verlässliche Wachstumsbedingungen.',
          resultText: 'Die Pflanze bleibt im positiven Rhythmus und kann Qualität sowie Wachstum sicher ausbauen.',
          guidanceText: 'Halte die Routine bei und beobachte nur Abweichungen statt unnötig einzugreifen.'
        }
      }
    };

    if (byEventOption[eventId] && byEventOption[eventId][optionId]) {
      return byEventOption[eventId][optionId];
    }

    return {
      tone: DEFAULT_TONE,
      actionText: 'Du hast eine Ereignis-Option ausgeführt.',
      causeText: 'Die Entscheidung beeinflusst den aktuellen Pflanzenzustand direkt.',
      resultText: 'Die nächsten Ereignisse orientieren sich an den gesetzten Ursachen und Folgen.',
      guidanceText: 'Beobachte die nächsten Hinweise im Ereignisverlauf und passe gezielt an.'
    };
  }

  function generateOutcomeAnalysis(context) {
    const c = context && typeof context === 'object' ? context : {};
    const eventId = String(c.eventId || 'unknown_event');
    const optionId = String(c.optionId || 'unknown_option');
    const template = templatesFor(eventId, optionId);
    const relatedFlags = Array.isArray(c.relatedFlags) ? c.relatedFlags.slice() : [];

    return {
      analysisId: `analysis:${eventId}:${optionId}:${Number(c.atRealTimeMs || Date.now())}`,
      eventId,
      optionId,
      atRealTimeMs: Number(c.atRealTimeMs || Date.now()),
      atSimTimeMs: Number(c.atSimTimeMs || 0),
      tick: Number(c.tick || 0),
      tone: template.tone,
      actionText: template.actionText,
      causeText: template.causeText,
      resultText: template.resultText,
      guidanceText: template.guidanceText,
      relatedFlags,
      relatedChainId: c.relatedChainId ? String(c.relatedChainId) : null,
      normalizedState: c.normalizedState && typeof c.normalizedState === 'object'
        ? {
          water: Number(c.normalizedState.water || 0),
          nutrients: Number(c.normalizedState.nutrients || 0),
          stress: Number(c.normalizedState.stress || 0),
          vitality: Number(c.normalizedState.vitality || 0),
          phase: String(c.normalizedState.phase || 'seedling')
        }
        : null
    };
  }

  function addAnalysisEntry(eventsState, entry) {
    const store = ensureAnalysisStore(eventsState);
    store.push(entry);
    if (store.length > 40) {
      store.splice(0, store.length - 40);
    }
    return entry;
  }

  function getLatestAnalysis(eventsState) {
    const store = ensureAnalysisStore(eventsState);
    return store.length ? store[store.length - 1] : null;
  }

  function generateAndStoreAnalysis(eventsState, context) {
    const memoryState = eventsState && eventsState.foundation && eventsState.foundation.memory
      ? eventsState.foundation.memory
      : null;
    const relatedChainId = context && context.relatedChainId
      ? context.relatedChainId
      : inferRelatedChainId(memoryState);

    const entry = generateOutcomeAnalysis({
      ...(context || {}),
      relatedChainId
    });

    return addAnalysisEntry(eventsState, entry);
  }

  const api = Object.freeze({
    ensureAnalysisStore,
    generateOutcomeAnalysis,
    addAnalysisEntry,
    getLatestAnalysis,
    generateAndStoreAnalysis
  });

  globalScope.GrowSimEventAnalysis = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
