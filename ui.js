'use strict';

function showBootError(error) {
  const stack = error && error.stack ? error.stack : String(error && error.message ? error.message : error);
  console.error(stack);

  const existing = document.getElementById('bootErrorBanner');
  if (existing) {
    existing.remove();
  }

  const banner = document.createElement('aside');
  banner.id = 'bootErrorBanner';
  banner.className = 'boot-error-banner';
  banner.innerHTML = `
    <strong>Fehler beim Starten</strong>
    <p>${escapeHtml(String(error && error.message ? error.message : 'Unbekannter Fehler'))}</p>
    <div class="boot-error-actions">
      <button type="button" id="bootReloadBtn" class="action-btn action-primary">Neu laden</button>
      <span>Cache-Hinweis: Wenn es weiterhin hängt, Safari → Website-Daten löschen.</span>
    </div>
  `;
  document.body.appendChild(banner);
  const reloadBtn = document.getElementById('bootReloadBtn');
  if (reloadBtn) {
    reloadBtn.addEventListener('click', () => window.location.reload());
  }
}

function cacheUi() {
  ui.phaseCard = document.getElementById('phaseCard');
  ui.phaseCardTitle = document.getElementById('phaseCardTitle');
  ui.phaseCardCycle = document.getElementById('phaseCardCycle');
  ui.phaseCardAge = document.getElementById('phaseCardAge');
  ui.phaseCardSubtitle = document.getElementById('phaseCardSubtitle');
  ui.phaseProgressFill = document.getElementById('phaseProgressFill');
  ui.phaseProgressMarker = document.getElementById('phaseProgressMarker');
  ui.phaseProgress = ui.phaseCard ? ui.phaseCard.querySelector('.phase-progress') : null;
  ui.healthRing = document.getElementById('healthRing');
  ui.stressRing = document.getElementById('stressRing');
  ui.waterRing = document.getElementById('waterRing');
  ui.nutritionRing = document.getElementById('nutritionRing');
  ui.growthRing = document.getElementById('growthRing');
  ui.riskRing = document.getElementById('riskRing');

  ui.healthValue = document.getElementById('healthValue');
  ui.stressValue = document.getElementById('stressValue');
  ui.waterValue = document.getElementById('waterValue');
  ui.nutritionValue = document.getElementById('nutritionValue');
  ui.growthValue = document.getElementById('growthValue');
  ui.riskValue = document.getElementById('riskValue');

  ui.plantImage = document.getElementById('plantImage');
  ui.nextEventValue = document.getElementById('nextEventValue');
  ui.growthImpulseValue = document.getElementById('growthImpulseValue');
  ui.simTimeValue = document.getElementById('simTimeValue');
  ui.boostUsageText = document.getElementById('boostUsageText');

  ui.overlayBurn = document.getElementById('overlayBurn');
  ui.overlayDefMg = document.getElementById('overlayDefMg');
  ui.overlayDefN = document.getElementById('overlayDefN');
  ui.overlayMoldWarning = document.getElementById('overlayMoldWarning');
  ui.overlayPestMites = document.getElementById('overlayPestMites');
  ui.overlayPestThrips = document.getElementById('overlayPestThrips');

  ui.careActionBtn = document.getElementById('careActionBtn');
  ui.analyzeActionBtn = document.getElementById('analyzeActionBtn');
  ui.boostActionBtn = document.getElementById('boostActionBtn');
  ui.skipNightActionBtn = document.getElementById('skipNightActionBtn');
  ui.openDiagnosisBtn = document.getElementById('openDiagnosisBtn');
  ui.menuToggleBtn = document.getElementById('menuToggleBtn');

  ui.backdrop = document.getElementById('sheetBackdrop');
  ui.careSheet = document.getElementById('careSheet');
  ui.eventSheet = document.getElementById('eventSheet');
  ui.dashboardSheet = document.getElementById('dashboardSheet');
  ui.diagnosisSheet = document.getElementById('diagnosisSheet');
  ui.statDetailSheet = document.getElementById('statDetailSheet');
  ui.statDetailTitle = document.getElementById('statDetailTitle');
  ui.statDetailValue = document.getElementById('statDetailValue');
  ui.statDetailStatus = document.getElementById('statDetailStatus');
  ui.statDetailExplanation = document.getElementById('statDetailExplanation');
  ui.statDetailRecommendation = document.getElementById('statDetailRecommendation');
  ui.statDetailPrimaryBtn = document.getElementById('statDetailPrimaryBtn');
  ui.menuBackdrop = document.getElementById('menuBackdrop');
  ui.gameMenu = document.getElementById('gameMenu');
  ui.menuCloseBtn = document.getElementById('menuCloseBtn');
  ui.menuHeaderCloseBtn = document.getElementById('menuHeaderCloseBtn');
  ui.menuNewRunBtn = document.getElementById('menuNewRunBtn');
  ui.menuRescueBtn = document.getElementById('menuRescueBtn');
  ui.menuRescueSubtext = document.getElementById('menuRescueSubtext');
  ui.menuStatsBtn = document.getElementById('menuStatsBtn');
  ui.menuPushBtn = document.getElementById('menuPushBtn');
  ui.menuPushStatus = document.getElementById('menuPushStatus');
  ui.menuLanguageBtn = document.getElementById('menuLanguageBtn');
  ui.menuSupportBtn = document.getElementById('menuSupportBtn');
  ui.menuAboutBtn = document.getElementById('menuAboutBtn');
  ui.menuAchievementsBtn = document.getElementById('menuAchievementsBtn');
  ui.menuLeaderboardBtn = document.getElementById('menuLeaderboardBtn');
  ui.menuDialog = document.getElementById('menuDialog');
  ui.menuDialogTitle = document.getElementById('menuDialogTitle');
  ui.menuDialogText = document.getElementById('menuDialogText');
  ui.menuDialogCancelBtn = document.getElementById('menuDialogCancelBtn');
  ui.menuDialogConfirmBtn = document.getElementById('menuDialogConfirmBtn');

  ui.careCategoryList = document.getElementById('careCategoryList');
  ui.careActionList = document.getElementById('careActionList');
  ui.careFeedback = document.getElementById('careFeedback');
  ui.eventStateBadge = document.getElementById('eventStateBadge');
  ui.eventTitle = document.getElementById('eventTitle');
  ui.eventText = document.getElementById('eventText');
  ui.eventMeta = document.getElementById('eventMeta');
  ui.eventOptionList = document.getElementById('eventOptionList');
  ui.analysisTabOverview = document.getElementById('analysisTabOverview');
  ui.analysisTabDiagnosis = document.getElementById('analysisTabDiagnosis');
  ui.analysisTabTimeline = document.getElementById('analysisTabTimeline');
  ui.analysisPanelOverview = document.getElementById('analysisPanelOverview');
  ui.analysisPanelDiagnosis = document.getElementById('analysisPanelDiagnosis');
  ui.analysisPanelTimeline = document.getElementById('analysisPanelTimeline');
  ui.analysisResetBtn = document.getElementById('analysisResetBtn');
  ui.pushToggleBtn = document.getElementById('pushToggleBtn');
  ui.pushToggleStatus = document.getElementById('pushToggleStatus');
  ui.pushToggleFeedback = document.getElementById('pushToggleFeedback');
  ui.notifTypeEvents = document.getElementById('notifTypeEvents');
  ui.notifTypeCritical = document.getElementById('notifTypeCritical');
  ui.notifTypeReminder = document.getElementById('notifTypeReminder');

  ui.landing = document.getElementById('landing');
  ui.startRunBtn = document.getElementById('startRunBtn');
  ui.setupMode = document.getElementById('setupMode');
  ui.setupLight = document.getElementById('setupLight');
  ui.setupMedium = document.getElementById('setupMedium');
  ui.setupPotSize = document.getElementById('setupPotSize');
  ui.setupGenetics = document.getElementById('setupGenetics');

  ui.deathOverlay = document.getElementById('deathOverlay');
  ui.deathDriverList = document.getElementById('deathDriverList');
  ui.deathHistoryList = document.getElementById('deathHistoryList');
  ui.deathResetBtn = document.getElementById('deathResetBtn');
  ui.deathAnalyzeBtn = document.getElementById('deathAnalyzeBtn');
  ui.deathRescueBtn = document.getElementById('deathRescueBtn');
  ui.deathRescueSubtext = document.getElementById('deathRescueSubtext');
  ui.deathRescueFeedback = document.getElementById('deathRescueFeedback');
}

function bindUi() {
  if (visibilityHandlerBound) {
    return;
  }
  ui.careActionBtn.addEventListener('click', () => withDebouncedAction('care', ui.careActionBtn, () => openSheet('care')));
  ui.analyzeActionBtn.addEventListener('click', () => withDebouncedAction('analyze', ui.analyzeActionBtn, () => openSheet('dashboard')));
  ui.boostActionBtn.addEventListener('click', () => withDebouncedAction('boost', ui.boostActionBtn, onBoostAction));
  if (ui.skipNightActionBtn) {
    ui.skipNightActionBtn.addEventListener('click', () => withDebouncedAction('skipNight', ui.skipNightActionBtn, onSkipNightAction));
  }
  ui.openDiagnosisBtn.addEventListener('click', () => openSheet('diagnosis'));

  const statRingBindings = [
    { node: ui.waterRing, key: 'water' },
    { node: ui.nutritionRing, key: 'nutrition' },
    { node: ui.growthRing, key: 'growth' },
    { node: ui.riskRing, key: 'risk' }
  ];
  for (const binding of statRingBindings) {
    if (!binding.node) {
      continue;
    }
    binding.node.addEventListener('click', () => onStatRingPress(binding.key));
    binding.node.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onStatRingPress(binding.key);
      }
    });
  }

  if (ui.statDetailPrimaryBtn) {
    ui.statDetailPrimaryBtn.addEventListener('click', onStatDetailPrimaryAction);
  }

  ui.startRunBtn.addEventListener('click', onStartRun);
  ui.analysisResetBtn.addEventListener('click', onAnalysisResetClick);
  ui.pushToggleBtn.addEventListener('click', onPushToggleClick);
  ui.notifTypeEvents.addEventListener('change', onNotificationTypeToggle);
  ui.notifTypeCritical.addEventListener('change', onNotificationTypeToggle);
  ui.notifTypeReminder.addEventListener('change', onNotificationTypeToggle);
  ui.deathResetBtn.addEventListener('click', onDeathResetClick);
  ui.deathAnalyzeBtn.addEventListener('click', onDeathAnalyzeClick);
  ui.deathRescueBtn.addEventListener('click', onDeathRescueClick);
  ui.menuToggleBtn.addEventListener('click', onMenuToggleClick);
  ui.menuCloseBtn.addEventListener('click', closeMenu);
  ui.menuHeaderCloseBtn.addEventListener('click', closeMenu);
  ui.menuBackdrop.addEventListener('click', closeMenu);
  ui.menuNewRunBtn.addEventListener('click', onMenuNewRunClick);
  ui.menuRescueBtn.addEventListener('click', onDeathRescueClick);
  ui.menuStatsBtn.addEventListener('click', () => {
    closeMenu();
    openSheet('dashboard');
  });
  ui.menuPushBtn.addEventListener('click', onPushToggleClick);
  ui.menuLanguageBtn.addEventListener('click', () => openMenuPlaceholder('Sprache', 'Sprachauswahl folgt in einem späteren Update.'));
  ui.menuSupportBtn.addEventListener('click', () => openMenuPlaceholder('Projekt unterstützen', 'Support-Optionen folgen in einem späteren Update.'));
  ui.menuAboutBtn.addEventListener('click', () => openMenuPlaceholder('Über das Spiel', 'Grow Simulator MVP · Weitere Infos folgen.'));
  ui.menuAchievementsBtn.addEventListener('click', () => openMenuPlaceholder('Achievements', 'Achievements sind bald verfügbar.'));
  ui.menuLeaderboardBtn.addEventListener('click', () => openMenuPlaceholder('Rangliste', 'Die Rangliste ist bald verfügbar.'));
  ui.menuDialogCancelBtn.addEventListener('click', closeMenuDialog);
  ui.backdrop.addEventListener('click', closeSheet);

  const analysisTabs = [ui.analysisTabOverview, ui.analysisTabDiagnosis, ui.analysisTabTimeline].filter(Boolean);
  if (!analysisTabs.length) {
    warnMissingUiOnce('analysisTabs');
  }
  for (const tab of analysisTabs) {
    tab.addEventListener('click', () => {
      state.ui.analysis.activeTab = tab.dataset.analysisTab || 'overview';
      renderAnalysisPanel(true);
    });
  }

  const closeButtons = document.querySelectorAll('[data-close-sheet]');
  for (const button of closeButtons) {
    button.addEventListener('click', closeSheet);
  }

  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('focus', onWindowFocus);
  window.addEventListener('pageshow', onPageShow);
  visibilityHandlerBound = true;
}

function ensureRequiredUi() {
  const requiredKeys = [
    'phaseCard', 'phaseCardTitle', 'phaseCardCycle', 'phaseCardSubtitle', 'phaseProgressFill', 'phaseProgressMarker', 'phaseProgress',
    'healthRing', 'stressRing', 'waterRing', 'nutritionRing', 'growthRing', 'riskRing',
    'healthValue', 'stressValue', 'waterValue', 'nutritionValue', 'growthValue', 'riskValue',
    'plantImage', 'nextEventValue', 'growthImpulseValue', 'simTimeValue', 'boostUsageText',
    'overlayBurn', 'overlayDefMg', 'overlayDefN', 'overlayMoldWarning', 'overlayPestMites', 'overlayPestThrips',
    'careActionBtn', 'analyzeActionBtn', 'boostActionBtn', 'skipNightActionBtn', 'openDiagnosisBtn', 'menuToggleBtn',
    'backdrop', 'careSheet', 'eventSheet', 'dashboardSheet', 'diagnosisSheet', 'statDetailSheet',
    'statDetailTitle', 'statDetailValue', 'statDetailStatus', 'statDetailExplanation', 'statDetailRecommendation', 'statDetailPrimaryBtn',
    'menuBackdrop', 'gameMenu', 'menuCloseBtn', 'menuHeaderCloseBtn', 'menuNewRunBtn', 'menuRescueBtn', 'menuRescueSubtext',
    'menuStatsBtn', 'menuPushBtn', 'menuPushStatus', 'menuLanguageBtn', 'menuSupportBtn', 'menuAboutBtn',
    'menuAchievementsBtn', 'menuLeaderboardBtn', 'menuDialog', 'menuDialogTitle', 'menuDialogText', 'menuDialogCancelBtn', 'menuDialogConfirmBtn',
    'careCategoryList', 'careActionList', 'careFeedback', 'eventStateBadge', 'eventTitle', 'eventText', 'eventMeta', 'eventOptionList',
    'analysisTabOverview', 'analysisTabDiagnosis', 'analysisTabTimeline', 'analysisPanelOverview', 'analysisPanelDiagnosis', 'analysisPanelTimeline',
    'analysisResetBtn', 'pushToggleBtn', 'pushToggleStatus', 'pushToggleFeedback',
    'notifTypeEvents', 'notifTypeCritical', 'notifTypeReminder',
    'analysisResetBtn', 'pushToggleBtn', 'pushToggleStatus',
    'landing', 'startRunBtn', 'setupMode', 'setupLight', 'setupMedium', 'setupPotSize', 'setupGenetics',
    'deathOverlay', 'deathDriverList', 'deathHistoryList', 'deathResetBtn', 'deathAnalyzeBtn'
  ];

  const missing = requiredKeys.filter((key) => !ui[key]);
  if (missing.length) {
    console.error('GrowSim konnte nicht initialisiert werden. Fehlende UI-Elemente:', missing);
    return false;
  }

  return true;
}

function renderAll() {
  syncDeathState();
  renderHud();
  renderSheets();
  renderGameMenu();
  renderCareSheet();
  renderEventSheet();
  renderAnalysisPanel(true);
  renderLanding();
  renderDeathOverlay();
}

function renderHud() {
  const dead = isPlantDead();
  const phaseCard = getPhaseCardViewModel();
  const boostText = `Werbeunterstützt · ${state.boost.boostUsedToday}/${state.boost.boostMaxPerDay} heute`;

  if (ui.phaseCardTitle && ui.phaseCardTitle.textContent !== phaseCard.title) {
    ui.phaseCardTitle.textContent = phaseCard.title;
  }
  if (ui.phaseCardCycle && ui.phaseCardCycle.textContent !== phaseCard.cycleIcon) {
    ui.phaseCardCycle.textContent = phaseCard.cycleIcon;
  }
  if (ui.phaseCardCycle) {
    ui.phaseCardCycle.setAttribute('aria-label', state.simulation.isDaytime ? 'Tag' : 'Nacht');
  }
  if (ui.phaseCardAge && ui.phaseCardAge.textContent !== phaseCard.ageLabel) {
    ui.phaseCardAge.textContent = phaseCard.ageLabel;
  }
  if (ui.phaseCardSubtitle && ui.phaseCardSubtitle.textContent !== phaseCard.subtitle) {
    ui.phaseCardSubtitle.textContent = phaseCard.subtitle;
  }
  if (ui.phaseProgressFill) {
    ui.phaseProgressFill.style.setProperty('--phase-progress', String(phaseCard.progressPercent));
  }
  if (ui.phaseCard) {
    ui.phaseCard.classList.toggle('phase-card--complete', phaseCard.progressPercent >= 100);
  }
  if (ui.phaseProgress) {
    ui.phaseProgress.setAttribute('aria-valuenow', String(phaseCard.progressPercent));
  }
  if (ui.phaseProgressMarker) {
    ui.phaseProgressMarker.classList.toggle('hidden', !phaseCard.nextLabel || phaseCard.progressPercent >= 100);
  }
  if (ui.phaseCard) {
    ui.phaseCard.setAttribute('aria-label', `Phase ${phaseCard.title}. ${phaseCard.ageLabel}. ${phaseCard.subtitle}.`);
  }

  if (ui.boostUsageText.textContent !== boostText) {
    ui.boostUsageText.textContent = boostText;
  }

  setRing(ui.healthRing, ui.healthValue, state.status.health);
  setRing(ui.stressRing, ui.stressValue, state.status.stress);
  setRing(ui.waterRing, ui.waterValue, state.status.water);
  setRing(ui.nutritionRing, ui.nutritionValue, state.status.nutrition);
  setRing(ui.growthRing, ui.growthValue, state.status.growth);
  setRing(ui.riskRing, ui.riskValue, state.status.risk);

  if (ui.plantImage && ui.plantImage.dataset.stageName !== state.plant.stageKey) {
    ui.plantImage.src = plantAssetPath(state.plant.stageKey);
    ui.plantImage.dataset.stageName = state.plant.stageKey;
  }

  const eventInMs = state.events.scheduler.nextEventRealTimeMs - state.simulation.nowMs;
  ui.nextEventValue.textContent = formatCountdown(eventInMs);
  ui.growthImpulseValue.textContent = state.simulation.growthImpulse.toFixed(2);
  ui.simTimeValue.textContent = formatSimClock(state.simulation.simTimeMs);

  ui.careActionBtn.disabled = dead;
  ui.boostActionBtn.disabled = dead;
  ui.openDiagnosisBtn.disabled = dead;

  renderOverlayVisibility();
}

const UI_STAT_RING_UPDATE_IDS = new Set(['waterRing', 'nutritionRing', 'growthRing', 'riskRing']);
const UI_STAT_UPDATE_ANIMATION_MS = 340;

function triggerStatUpdateFeedback(ringNode, textNode) {
  if (!ringNode || !textNode) {
    return;
  }

  ringNode.classList.remove('stat-ring--updated');
  textNode.classList.remove('stat-value--updated');

  void ringNode.offsetWidth;

  ringNode.classList.add('stat-ring--updated');
  textNode.classList.add('stat-value--updated');

  clearTimeout(ringNode._statUpdateTimerId);
  ringNode._statUpdateTimerId = setTimeout(() => {
    ringNode.classList.remove('stat-ring--updated');
    textNode.classList.remove('stat-value--updated');
  }, UI_STAT_UPDATE_ANIMATION_MS);
}

function setRing(ringNode, textNode, value) {
  const rounded = Math.round(value);
  const roundedText = String(rounded);
  const previousValueText = ringNode.dataset.value;
  const valueChanged = previousValueText !== roundedText;

  if (valueChanged) {
    ringNode.style.setProperty('--value', roundedText);
    ringNode.dataset.value = roundedText;

    if (UI_STAT_RING_UPDATE_IDS.has(ringNode.id) && previousValueText !== undefined) {
      triggerStatUpdateFeedback(ringNode, textNode);
    }
  }
  if (textNode.textContent !== roundedText) {
    textNode.textContent = roundedText;
  }
}

function renderOverlayVisibility() {
  const nodes = {
    overlay_burn: ui.overlayBurn,
    overlay_def_mg: ui.overlayDefMg,
    overlay_def_n: ui.overlayDefN,
    overlay_mold_warning: ui.overlayMoldWarning,
    overlay_pest_mites: ui.overlayPestMites,
    overlay_pest_thrips: ui.overlayPestThrips
  };

  for (const [overlayId, node] of Object.entries(nodes)) {
    const visible = state.ui.visibleOverlayIds.includes(overlayId);
    node.classList.toggle('hidden', !visible);
  }
}

function renderSheets() {
  const activeSheet = state.ui.openSheet;
  const showBackdrop = activeSheet !== null;

  ui.backdrop.classList.toggle('hidden', !showBackdrop);
  ui.backdrop.setAttribute('aria-hidden', String(!showBackdrop));

  toggleSheet(ui.careSheet, activeSheet === 'care');
  toggleSheet(ui.eventSheet, activeSheet === 'event');
  toggleSheet(ui.dashboardSheet, activeSheet === 'dashboard');
  toggleSheet(ui.diagnosisSheet, activeSheet === 'diagnosis');
}

function renderGameMenu() {
  if (!ui.menuBackdrop || !ui.gameMenu || !ui.menuToggleBtn) {
    return;
  }

  const menuOpen = state.ui.menuOpen === true;
  const dialogOpen = state.ui.menuDialogOpen === true;

  ui.menuBackdrop.classList.toggle('hidden', !menuOpen);
  ui.menuBackdrop.setAttribute('aria-hidden', String(!menuOpen));
  ui.gameMenu.classList.toggle('hidden', !menuOpen);
  ui.gameMenu.setAttribute('aria-hidden', String(!menuOpen));
  ui.menuToggleBtn.setAttribute('aria-expanded', String(menuOpen));

  if (ui.menuDialog) {
    ui.menuDialog.classList.toggle('hidden', !dialogOpen);
    ui.menuDialog.setAttribute('aria-hidden', String(!dialogOpen));
  }

  renderMenuDynamicRows();
}

function renderMenuDynamicRows() {
  if (!ui.menuRescueBtn || !ui.menuRescueSubtext || !ui.menuPushBtn || !ui.menuPushStatus) {
    return;
  }

  const meta = getCanonicalMeta(state);
  const rescueUsed = Boolean(meta.rescue.used);
  const rescueBlocked = rescueAdPending || rescueUsed;
  ui.menuRescueBtn.disabled = rescueBlocked;
  ui.menuRescueSubtext.textContent = rescueUsed
    ? '1× pro Run bereits genutzt.'
    : (meta.rescue.lastResult || '1× pro Run verfügbar.');

  const notifications = getCanonicalNotificationsSettings(state);
  const enabled = notifications.enabled === true;
  ui.menuPushBtn.setAttribute('aria-pressed', String(enabled));
  ui.menuPushStatus.textContent = notifications.lastMessage
    ? String(notifications.lastMessage)
    : (enabled ? 'Aktiviert' : 'Deaktiviert');
}

function toggleSheet(sheetNode, visible) {
  sheetNode.classList.toggle('hidden', !visible);
  sheetNode.setAttribute('aria-hidden', String(!visible));
}

function renderCareSheet(force = false) {
  if (!force && state.ui.openSheet !== 'care') {
    return;
  }

  const catalog = Array.isArray(state.actions.catalog) ? state.actions.catalog : [];
  const categoryOrder = ['watering', 'fertilizing', 'training', 'environment'];
  const categoryLabels = {
    watering: 'Bewässerung',
    fertilizing: 'Düngung',
    training: 'Training',
    environment: 'Umgebung'
  };

  const availableCategories = categoryOrder.filter((category) => catalog.some((action) => action.category === category));
  if (!availableCategories.length) {
    ui.careCategoryList.replaceChildren();
    ui.careActionList.replaceChildren();
    setCareFeedback('error', 'Keine Aktionen geladen.');
    return;
  }

  if (!state.ui.care || !availableCategories.includes(state.ui.care.selectedCategory)) {
    state.ui.care = state.ui.care || {};
    state.ui.care.selectedCategory = availableCategories[0];
  }

  renderCareCategoryButtons(availableCategories, categoryLabels);
  renderCareActionButtons(state.ui.care.selectedCategory);
  renderCareFeedback();
}

function renderCareCategoryButtons(categories, labels) {
  const signature = categories.join('|') + `|selected:${state.ui.care.selectedCategory}`;
  if (ui.careCategoryList.dataset.signature === signature) {
    return;
  }

  ui.careCategoryList.dataset.signature = signature;
  ui.careCategoryList.replaceChildren();

  for (const category of categories) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'care-category-btn';
    if (state.ui.care.selectedCategory === category) {
      btn.classList.add('is-active');
    }
    btn.textContent = labels[category] || category;
    btn.addEventListener('click', () => {
      state.ui.care.selectedCategory = category;
      setCareFeedback('info', `${labels[category] || category} ausgewählt.`);
      renderCareSheet(true);
    });
    ui.careCategoryList.appendChild(btn);
  }
}

function renderCareActionButtons(category) {
  const actions = state.actions.catalog
    .filter((action) => action.category === category)
    .sort((a, b) => intensityRank(a.intensity) - intensityRank(b.intensity));

  const signature = actions.map((action) => {
    const cooldownUntil = Number(state.actions.cooldowns[action.id] || 0);
    return `${action.id}:${cooldownUntil}`;
  }).join('|');

  if (ui.careActionList.dataset.signature === signature) {
    return;
  }

  ui.careActionList.dataset.signature = signature;
  ui.careActionList.replaceChildren();

  for (const action of actions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'care-action-btn';

    const cooldownLeft = Math.max(0, Number(state.actions.cooldowns[action.id] || 0) - Date.now());
    const cooldownText = cooldownLeft > 0
      ? `Abklingzeit ${Math.ceil(cooldownLeft / 60000)}m`
      : `Abklingzeit ${Math.round(action.cooldownRealMinutes || 0)}m`;

    button.innerHTML = `<div><strong>${action.label}</strong><div class="care-action-meta">${labelForIntensity(action.intensity)}</div></div><span class="care-action-meta">${cooldownText}</span>`;

    button.addEventListener('click', () => {
      const result = applyAction(action.id);
      if (result.ok) {
        setCareFeedback('success', `${action.label} ausgeführt.`);
      } else {
        setCareFeedback('error', explainActionFailure(result.reason));
      }
      renderCareSheet(true);
      renderHud();
    });

    ui.careActionList.appendChild(button);
  }
}

function renderCareFeedback() {
  const feedback = (state.ui.care && state.ui.care.feedback) || { kind: 'info', text: 'Bereit.' };
  ui.careFeedback.textContent = feedback.text;
  ui.careFeedback.classList.toggle('is-success', feedback.kind === 'success');
  ui.careFeedback.classList.toggle('is-error', feedback.kind === 'error');
}

function setCareFeedback(kind, text) {
  state.ui.care = state.ui.care || {};
  state.ui.care.feedback = { kind, text };
  renderCareFeedback();
}

function labelForIntensity(intensity) {
  if (intensity === 'low') return 'Niedrig';
  if (intensity === 'high') return 'Hoch';
  return 'Mittel';
}

function intensityRank(intensity) {
  if (intensity === 'low') return 0;
  if (intensity === 'medium') return 1;
  if (intensity === 'high') return 2;
  return 3;
}

function explainActionFailure(reason) {
  const value = String(reason || 'action_failed');
  if (value.startsWith('cooldown_active:')) {
    return `Aktion blockiert: ${value.replace('cooldown_active:', 'Abklingzeit noch ')}`;
  }
  if (value.startsWith('prereq_min_failed:') || value.startsWith('prereq_max_failed:')) {
    return `Voraussetzung nicht erfüllt (${value.split(':')[1] || 'unbekannt'}).`;
  }
  if (value.startsWith('outside_time_window:')) {
    return 'Aktion nur tagsüber verfügbar.';
  }
  if (value.startsWith('stage_too_low:')) {
    return 'Aktion für diese Phase noch nicht freigeschaltet.';
  }
  if (value === 'dead_run_ended') {
    return 'Aktion nicht möglich: Die Pflanze ist eingegangen.';
  }
  return `Aktion blockiert (${value}).`;
}

function renderEventSheet() {
  if (state.ui.openSheet !== 'event' && state.events.machineState !== 'activeEvent') {
    return;
  }

  ui.eventStateBadge.textContent = `Status: ${translateEventState(state.events.machineState)}`;

  if (state.events.machineState === 'activeEvent') {
    ui.eventTitle.textContent = state.events.activeEventTitle;
    ui.eventText.textContent = state.events.activeEventText;
    ui.eventMeta.textContent = `Schweregrad: ${state.events.activeSeverity} | Stichwörter: ${state.events.activeTags.join(', ') || '-'}`;

    const optionSignature = `${state.events.activeEventId}|${state.events.activeOptions.map((option) => `${option.id}:${option.label}`).join('|')}`;
    if (ui.eventOptionList.dataset.signature !== optionSignature) {
      ui.eventOptionList.dataset.signature = optionSignature;
      ui.eventOptionList.replaceChildren();
      for (const option of state.events.activeOptions) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'event-option-btn';
        button.textContent = option.label;
        button.addEventListener('click', () => onEventOptionClick(option.id));
        ui.eventOptionList.appendChild(button);
      }
    }
    return;
  }

  if (state.events.machineState === 'cooldown') {
    const cooldownLeft = state.events.cooldownUntilMs - state.simulation.nowMs;
    ui.eventTitle.textContent = 'Abklingzeit aktiv';
    ui.eventText.textContent = 'Das Ereignissystem befindet sich in der Abklingzeit.';
    ui.eventMeta.textContent = `Abklingzeit: ${formatCountdown(cooldownLeft)}`;
  } else {
    ui.eventTitle.textContent = 'Kein aktives Ereignis';
    ui.eventText.textContent = 'Ein Ereignis erscheint, sobald der nächste Wurf erfolgreich ist.';
    ui.eventMeta.textContent = `Nächster Wurf: ${formatCountdown(state.events.scheduler.nextEventRealTimeMs - state.simulation.nowMs)}`;
  }

  if (ui.eventOptionList.childElementCount > 0) {
    ui.eventOptionList.dataset.signature = '';
    ui.eventOptionList.replaceChildren();
  }
}

function warnMissingUiOnce(key) {
  if (warnedUiKeys.has(key)) {
    return;
  }
  warnedUiKeys.add(key);
  console.warn(`Missing analysis UI element: ${key}`);
}

function renderAnalysisPanel(force = false) {
  if (!force && state.ui.openSheet !== 'dashboard') {
    return;
  }

  if (!ui.analysisTabOverview || !ui.analysisTabDiagnosis || !ui.analysisTabTimeline || !ui.analysisPanelOverview || !ui.analysisPanelDiagnosis || !ui.analysisPanelTimeline) {
    warnMissingUiOnce('analysis-panel');
    return;
  }

  renderPushToggle();

  const activeTab = (state.ui.analysis && state.ui.analysis.activeTab) ? state.ui.analysis.activeTab : 'overview';
  const tabMap = {
    overview: ui.analysisPanelOverview,
    diagnosis: ui.analysisPanelDiagnosis,
    timeline: ui.analysisPanelTimeline
  };

  ui.analysisTabOverview.classList.toggle('is-active', activeTab === 'overview');
  ui.analysisTabDiagnosis.classList.toggle('is-active', activeTab === 'diagnosis');
  ui.analysisTabTimeline.classList.toggle('is-active', activeTab === 'timeline');

  for (const [tabId, panel] of Object.entries(tabMap)) {
    panel.classList.toggle('hidden', tabId !== activeTab);
  }

  renderAnalysisOverview();
  renderAnalysisDiagnosis();
  renderAnalysisTimeline();
}

function renderPushToggle() {
  if (!ui.pushToggleBtn || !ui.pushToggleStatus || !ui.pushToggleFeedback || !ui.notifTypeEvents || !ui.notifTypeCritical || !ui.notifTypeReminder) {
    return;
  }

  const notifications = getCanonicalNotificationsSettings(state);
  const enabled = notifications.enabled === true;
  ui.pushToggleBtn.textContent = enabled ? 'AN' : 'AUS';
  ui.pushToggleBtn.setAttribute('aria-pressed', String(enabled));
  ui.pushToggleStatus.textContent = enabled ? 'Aktiv' : 'Deaktiviert';

  ui.notifTypeEvents.checked = notifications.types.events === true;
  ui.notifTypeCritical.checked = notifications.types.critical === true;
  ui.notifTypeReminder.checked = notifications.types.reminder === true;

  ui.notifTypeEvents.disabled = !enabled;
  ui.notifTypeCritical.disabled = !enabled;
  ui.notifTypeReminder.disabled = !enabled;

  ui.pushToggleFeedback.textContent = notifications.lastMessage ? String(notifications.lastMessage) : '';
}

function renderAnalysisOverview() {
  if (!ui.analysisPanelOverview) {
    warnMissingUiOnce('analysisPanelOverview');
    return;
  }

  const stageIndex = Number(state.plant && state.plant.stageIndex) || 1;
  const stageDef = STAGE_DEFS[clampInt(stageIndex, 0, STAGE_DEFS.length - 1)];
  const stageDisplay = clampInt(stageIndex + 1, 1, STAGE_DEFS.length);
  const stageLabel = stageDef ? stageDef.label : '-';
  const qualityTier = (state.plant && state.plant.lifecycle && state.plant.lifecycle.qualityTier) || 'normal';
  const dayNight = (state.simulation && state.simulation.isDaytime) ? 'Tag' : 'Nacht';
  const simDay = Number(state.simulation && state.simulation.simDay) || 0;
  const status = state.status || {};
  const qualityTierText = qualityTierLabel(qualityTier);

  ui.analysisPanelOverview.innerHTML = `
    <div class="gs-analysis-metric"><strong>Stufe ${stageDisplay}: ${stageLabel}</strong><br>Qualität: ${escapeHtml(String(qualityTierText))}</div>
    <div class="gs-analysis-metric"><strong>${dayNight}</strong><br>Sim-Tag ${simDay}</div>
    <div class="gs-analysis-metric-grid">
      <div class="gs-analysis-metric">Wasser<br><strong>${round2(Number(status.water) || 0)}</strong></div>
      <div class="gs-analysis-metric">Nährstoffe<br><strong>${round2(Number(status.nutrition) || 0)}</strong></div>
      <div class="gs-analysis-metric">Gesundheit<br><strong>${round2(Number(status.health) || 0)}</strong></div>
      <div class="gs-analysis-metric">Stress<br><strong>${round2(Number(status.stress) || 0)}</strong></div>
      <div class="gs-analysis-metric">Risiko<br><strong>${round2(Number(status.risk) || 0)}</strong></div>
      <div class="gs-analysis-metric">Wachstum<br><strong>${round2(Number(status.growth) || 0)}</strong></div>
    </div>
  `;
}

function renderAnalysisDiagnosis() {
  if (!ui.analysisPanelDiagnosis) {
    warnMissingUiOnce('analysisPanelDiagnosis');
    return;
  }

  const drivers = diagnosisDrivers();
  const top = drivers.slice(0, 3);
  const recommendation = recommendedCareCategory(top[0]);
  const recommendationLabel = categoryLabel(recommendation);

  ui.analysisPanelDiagnosis.replaceChildren();

  for (const item of top) {
    const node = document.createElement('div');
    node.className = 'gs-analysis-driver';
    node.innerHTML = `<strong>${escapeHtml(item.label)}</strong><br>${escapeHtml(item.reason)}`;
    ui.analysisPanelDiagnosis.appendChild(node);
  }

  const rec = document.createElement('div');
  rec.className = 'gs-analysis-driver';
  rec.innerHTML = `<strong>Empfohlene nächste Pflege:</strong> ${escapeHtml(recommendationLabel)}`;
  ui.analysisPanelDiagnosis.appendChild(rec);
}

function diagnosisDrivers() {
  const d = [];
  const s = state.status || {};
  const stageIndex = Number(state.plant && state.plant.stageIndex) || 1;

  if ((Number(s.water) || 0) < 35) d.push({ score: 100 - s.water, label: 'Wassermangel', reason: 'Zu trocken erhöht den Stress' });
  if ((Number(s.water) || 0) > 80) d.push({ score: s.water, label: 'Überwässerung', reason: 'Zu viel Wasser erhöht das Risiko' });
  if ((Number(s.nutrition) || 0) < 35) d.push({ score: 95 - s.nutrition, label: 'Nährstoffmangel', reason: 'Unterversorgung bremst das Wachstum' });
  if ((Number(s.nutrition) || 0) > 80) d.push({ score: s.nutrition, label: 'Nährstoffüberschuss', reason: 'Erhöhtes Risiko für Nährstoffbrand' });
  if ((Number(s.stress) || 0) > 60) d.push({ score: s.stress + 10, label: 'Hoher Stress', reason: 'Hoher Stress blockiert das beste Ergebnis' });
  if ((Number(s.risk) || 0) > 60) d.push({ score: s.risk + 8, label: 'Hohes Risiko', reason: 'Hohes Risiko erhöht negative Ereignisse' });

  if (stageIndex <= 3 && (Number(s.health) || 0) < 65) {
    d.push({ score: 70 - (Number(s.health) || 0), label: 'Frühe-Phase-Empfindlichkeit', reason: 'Frühe Phasen brauchen stabile Wasser- und Nährstoffwerte' });
  }

  if (!d.length) {
    d.push({ score: 1, label: 'Stabiler Zustand', reason: 'Kein größeres Defizit erkannt' });
  }

  return d.sort((a, b) => b.score - a.score);
}

function recommendedCareCategory(primaryDriver) {
  if (!primaryDriver) return 'environment';
  const map = {
    Wassermangel: 'watering',
    Überwässerung: 'environment',
    Nährstoffmangel: 'fertilizing',
    Nährstoffüberschuss: 'environment',
    'Hoher Stress': 'environment',
    'Hohes Risiko': 'environment',
    'Stabiler Zustand': 'training'
  };
  return map[primaryDriver.label] || 'environment';
}

function qualityTierLabel(tier) {
  if (tier === 'perfect') return 'Perfekt';
  if (tier === 'degraded') return 'Geschwächt';
  return 'Normal';
}

function categoryLabel(category) {
  const map = {
    watering: 'Bewässerung',
    fertilizing: 'Düngung',
    training: 'Training',
    environment: 'Umgebung',
    water: 'Wasser',
    nutrition: 'Nährstoffe',
    pest: 'Schädlinge',
    disease: 'Krankheit',
    generic: 'Allgemein'
  };
  return map[String(category || 'generic')] || String(category || 'Allgemein');
}

function renderAnalysisTimeline() {
  if (!ui.analysisPanelTimeline) {
    warnMissingUiOnce('analysisPanelTimeline');
    return;
  }

  const actions = Array.isArray(state.history && state.history.actions) ? state.history.actions : [];
  const events = Array.isArray(state.history && state.history.events) ? state.history.events : [];
  const system = Array.isArray(state.history && state.history.system) ? state.history.system : [];
  const simNow = Number(state.simulation && state.simulation.simTimeMs) || 0;

  const merged = [];
  for (const item of actions) {
    merged.push({
      kind: 'action',
      atRealTimeMs: Number(item.atRealTimeMs || item.realTime || 0),
      atSimTimeMs: Number(item.atSimTimeMs || item.simTime || simNow),
      data: item
    });
  }
  for (const item of events) {
    merged.push({
      kind: 'event',
      atRealTimeMs: Number(item.atRealTimeMs || item.realTime || 0),
      atSimTimeMs: Number(item.atSimTimeMs || item.simTime || simNow),
      data: item
    });
  }
  for (const item of system) {
    const stamp = item && item.timestamp && typeof item.timestamp === 'object' ? item.timestamp : null;
    merged.push({
      kind: 'system',
      atRealTimeMs: Number(item.atRealTimeMs || (stamp && stamp.realMs) || item.realTime || 0),
      atSimTimeMs: Number(item.atSimTimeMs || (stamp && stamp.simMs) || item.simTime || simNow),
      data: item
    });
  }

  merged.sort((a, b) => (b.atRealTimeMs || b.atSimTimeMs) - (a.atRealTimeMs || a.atSimTimeMs));
  const latest = merged.slice(0, 10);

  ui.analysisPanelTimeline.replaceChildren();

  if (!latest.length) {
    const empty = document.createElement('div');
    empty.className = 'gs-analysis-timeline-item';
    empty.textContent = 'Noch keine Aktivitäten';
    ui.analysisPanelTimeline.appendChild(empty);
    return;
  }

  for (const row of latest) {
    const simStamp = simStampFromMs(row.atSimTimeMs);
    const node = document.createElement('div');
    node.className = 'gs-analysis-timeline-item';

    if (row.kind === 'action') {
      const d = row.data || {};
      node.innerHTML = `<div class="gs-analysis-timeline-meta">${simStamp} · Aktion</div><strong>${escapeHtml(String(d.label || d.id || 'Aktion'))}</strong><br>${formatDeltaSummary(d.deltaSummary || {})}`;
    } else if (row.kind === 'event') {
      const d = row.data || {};
      const note = d.learningNote ? `<details><summary>Lernhinweis</summary>${escapeHtml(String(d.learningNote))}</details>` : '';
      const analysis = d.analysis && typeof d.analysis === 'object' ? d.analysis : null;
      const outcome = analysis
        ? `<br><em>${escapeHtml(String(analysis.actionText || ''))}</em><br>${escapeHtml(String(analysis.causeText || ''))}<br>${escapeHtml(String(analysis.resultText || ''))}<br><strong>Nächster Fokus:</strong> ${escapeHtml(String(analysis.guidanceText || ''))}`
        : '';
      node.innerHTML = `<div class="gs-analysis-timeline-meta">${simStamp} · Ereignis (${escapeHtml(categoryLabel(String(d.category || 'generic')))})</div><strong>${escapeHtml(String(d.optionLabel || d.optionId || d.eventId || 'Ereignis'))}</strong><br>${formatDeltaSummary(d.effectsApplied || d.deltaSummary || {})}${outcome}${note}`;
    } else {
      const d = row.data || {};
      const typeLabel = String(d.type || 'system');
      const label = d.label || d.id || 'System';
      const wasDeadNote = typeof d.wasDead === 'boolean'
        ? (d.wasDead ? ' · Reanimation' : ' · Stabilisierung')
        : '';
      node.innerHTML = `<div class="gs-analysis-timeline-meta">${simStamp} · System (${escapeHtml(typeLabel === 'rescue' ? 'Notfallrettung' : 'System')})</div><strong>${escapeHtml(String(label))}</strong>${wasDeadNote}<br>${formatDeltaSummary(d.effectsApplied || (d.details && d.details.effectsApplied) || {})}`;
    }

    ui.analysisPanelTimeline.appendChild(node);
  }
}

function simStampFromMs(simMs) {
  const base = Number(state.simulation.startRealTimeMs || simMs || 0);
  const raw = Number(simMs || base);
  const delta = Math.max(0, raw - base);
  const totalDay = Math.floor(delta / (24 * 60 * 60 * 1000));
  const hh = Math.floor((delta % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  return `Tag ${totalDay} · ${String(hh).padStart(2, '0')}:00`;
}

function formatDeltaSummary(delta) {
  const parts = [];
  for (const [k, v] of Object.entries(delta || {})) {
    if (!Number.isFinite(Number(v)) || Number(v) === 0) {
      continue;
    }
    const n = round2(Number(v));
    parts.push(`${k}: ${n > 0 ? '+' : ''}${n}`);
  }
  return parts.length ? parts.join(' · ') : 'Keine Nettoänderung';
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function openSheet(name) {
  if (isPlantDead() && name !== 'dashboard') {
    return;
  }
  if (state.ui.menuOpen) {
    closeMenu();
  }
  state.ui.openSheet = name;
  renderSheets();

  if (name === 'dashboard') {
    renderAnalysisPanel(true);
  } else if (name === 'event') {
    renderEventSheet();
  } else if (name === 'care') {
    renderCareSheet(true);
  }
}

function onMenuToggleClick() {
  if (state.ui.menuOpen) {
    closeMenu();
    return;
  }
  openMenu();
}

function openMenu() {
  state.ui.openSheet = null;
  renderSheets();
  state.ui.menuOpen = true;
  renderGameMenu();
}

function closeMenu() {
  if (state.ui.menuDialogOpen) {
    closeMenuDialog();
  }
  state.ui.menuOpen = false;
  renderGameMenu();
}

function openMenuPlaceholder(title, text) {
  openMenuDialog({
    title,
    message: text,
    cancelLabel: 'Schließen',
    confirmLabel: '',
    onConfirm: null
  });
}

function onMenuNewRunClick() {
  openMenuDialog({
    title: 'Neuen Run starten?',
    message: 'Deine aktuelle Pflanze wird beendet.',
    cancelLabel: 'Abbrechen',
    confirmLabel: 'Neuer Run',
    onConfirm: async () => {
      closeMenu();
      await resetRun();
    }
  });
}

function openMenuDialog({ title, message, cancelLabel = 'Abbrechen', confirmLabel = 'OK', onConfirm = null }) {
  if (!ui.menuDialogTitle || !ui.menuDialogText || !ui.menuDialogCancelBtn || !ui.menuDialogConfirmBtn) {
    return;
  }

  ui.menuDialogTitle.textContent = title;
  ui.menuDialogText.textContent = message;
  ui.menuDialogCancelBtn.textContent = cancelLabel;
  ui.menuDialogConfirmBtn.textContent = confirmLabel;

  menuDialogConfirmHandler = typeof onConfirm === 'function' ? onConfirm : null;
  ui.menuDialogConfirmBtn.classList.toggle('hidden', menuDialogConfirmHandler === null || !confirmLabel);
  ui.menuDialogConfirmBtn.onclick = null;
  if (menuDialogConfirmHandler) {
    ui.menuDialogConfirmBtn.onclick = async () => {
      const handler = menuDialogConfirmHandler;
      closeMenuDialog();
      await handler();
    };
  }

  state.ui.menuDialogOpen = true;
  renderGameMenu();
}

function closeMenuDialog() {
  state.ui.menuDialogOpen = false;
  menuDialogConfirmHandler = null;
  if (ui.menuDialogConfirmBtn) {
    ui.menuDialogConfirmBtn.onclick = null;
  }
  renderGameMenu();
}

function hasSetup() {
  return Boolean(state.setup && Number.isFinite(Number(state.setup.createdAtReal)));
}

function renderLanding() {
  const visible = !hasSetup();
  ui.landing.classList.toggle('hidden', !visible);
  ui.landing.setAttribute('aria-hidden', String(!visible));
}

function renderDeathOverlay() {
  if (!ui.deathOverlay || !ui.deathDriverList || !ui.deathHistoryList) {
    return;
  }

  const visible = Boolean(state.ui.deathOverlayOpen && isPlantDead());
  ui.deathOverlay.classList.toggle('hidden', !visible);
  ui.deathOverlay.setAttribute('aria-hidden', String(!visible));

  if (!visible) {
    return;
  }

  const topDrivers = diagnosisDrivers().slice(0, 3);
  ui.deathDriverList.replaceChildren();
  for (const item of topDrivers) {
    const row = document.createElement('li');
    row.innerHTML = `<strong>${escapeHtml(String(item.label || 'Unklare Ursache'))}</strong><br>${escapeHtml(String(item.reason || 'Kein Detail verfügbar'))}`;
    ui.deathDriverList.appendChild(row);
  }

  const recent = collectRecentHistoryEntries(3);
  ui.deathHistoryList.replaceChildren();
  if (!recent.length) {
    const empty = document.createElement('li');
    empty.textContent = 'Keine Aktionen oder Ereignisse protokolliert.';
    ui.deathHistoryList.appendChild(empty);
  } else {
    for (const row of recent) {
      const item = document.createElement('li');
      item.innerHTML = formatRecentHistoryHtml(row);
      ui.deathHistoryList.appendChild(item);
    }
  }

  if (ui.deathRescueBtn && ui.deathRescueSubtext && ui.deathRescueFeedback) {
    const meta = getCanonicalMeta(state);
    const rescueUsed = Boolean(meta.rescue.used);
    ui.deathRescueBtn.disabled = rescueAdPending || rescueUsed;
    ui.deathRescueBtn.textContent = rescueUsed
      ? 'Rettungsaktion bereits genutzt'
      : 'Rettungsaktion nutzen';
    ui.deathRescueSubtext.textContent = rescueUsed
      ? '1× pro Run bereits verbraucht.'
      : '1× pro Run';
    ui.deathRescueFeedback.textContent = meta.rescue.lastResult ? String(meta.rescue.lastResult) : '';
  }
}

function collectRecentHistoryEntries(limit = 3) {
  const actions = Array.isArray(state.history && state.history.actions) ? state.history.actions : [];
  const events = Array.isArray(state.history && state.history.events) ? state.history.events : [];
  const merged = [];

  for (const action of actions) {
    merged.push({
      kind: 'action',
      atRealTimeMs: Number(action.atRealTimeMs || action.realTime || 0),
      atSimTimeMs: Number(action.atSimTimeMs || action.simTime || state.simulation.simTimeMs),
      data: action
    });
  }

  for (const eventItem of events) {
    merged.push({
      kind: 'event',
      atRealTimeMs: Number(eventItem.atRealTimeMs || eventItem.realTime || 0),
      atSimTimeMs: Number(eventItem.atSimTimeMs || eventItem.simTime || state.simulation.simTimeMs),
      data: eventItem
    });
  }

  merged.sort((a, b) => (b.atRealTimeMs || b.atSimTimeMs) - (a.atRealTimeMs || a.atSimTimeMs));
  return merged.slice(0, limit);
}

function formatRecentHistoryHtml(row) {
  const simStamp = simStampFromMs(row.atSimTimeMs);
  const data = row.data || {};
  if (row.kind === 'action') {
    const label = escapeHtml(String(data.label || data.id || 'Aktion'));
    return `<span class="timeline-meta">${simStamp} · Aktion</span><br><strong>${label}</strong>`;
  }

  const category = escapeHtml(categoryLabel(data.category || 'generic'));
  const label = escapeHtml(String(data.optionLabel || data.optionId || data.eventId || 'Ereignis'));
  return `<span class="timeline-meta">${simStamp} · Ereignis (${category})</span><br><strong>${label}</strong>`;
}

function onStartRun() {
  const nowMs = Date.now();
  state.setup = {
    mode: ui.setupMode.value || 'indoor',
    light: ui.setupLight.value || 'medium',
    medium: ui.setupMedium.value || 'soil',
    potSize: ui.setupPotSize.value || 'medium',
    genetics: ui.setupGenetics.value || 'auto',
    createdAtReal: nowMs
  };

  state.simulation.startRealTimeMs = nowMs;
  state.simulation.lastTickRealTimeMs = nowMs;
  state.simulation.simEpochMs = alignToSimStartHour(nowMs, SIM_START_HOUR);
  state.simulation.simTimeMs = state.simulation.simEpochMs;
  state.status.growth = 0;
  state.plant.stageIndex = 0;
  state.plant.stageProgress = 0;
  state.plant.phase = getCurrentStage(0).current.phase;
  state.plant.stageKey = stageAssetKeyForIndex(0);
  state.plant.lastValidStageKey = state.plant.stageKey;

  syncCanonicalStateShape();
  renderLanding();
  schedulePersistState(true);
  addLog('system', 'Einstellungen gespeichert, Durchlauf gestartet', state.setup);
}

async function onDeathResetClick() {
  openMenuDialog({
    title: 'Neuen Run starten?',
    message: 'Der aktuelle Durchlauf wird beendet und ein neuer Run gestartet.',
    cancelLabel: 'Abbrechen',
    confirmLabel: 'Neuen Run starten',
    onConfirm: async () => {
      await resetRun();
    }
  });
}

function onDeathAnalyzeClick() {
  state.ui.deathOverlayOpen = false;
  state.ui.deathOverlayAcknowledged = true;
  openSheet('dashboard');
  renderDeathOverlay();
}

async function onDeathRescueClick() {
  const meta = getCanonicalMeta(state);
  if (rescueAdPending) {
    return;
  }

  if (meta.rescue.used) {
    meta.rescue.lastResult = 'Rettungsaktion ist nur 1× pro Run verfügbar.';
    renderDeathOverlay();
    schedulePersistState(true);
    return;
  }

  const beforeHealth = Number(state.status.health) || 0;
  const deadNow = isPlantDead();
  if (!deadNow && beforeHealth >= 20) {
    meta.rescue.lastResult = 'Notfallrettung ist aktuell nicht erforderlich.';
    renderDeathOverlay();
    schedulePersistState(true);
    return;
  }

  rescueAdPending = false;

  const rescueResult = applyRescueEffects();
  if (!rescueResult.ok) {
    meta.rescue.lastResult = 'Notfallrettung ist aktuell nicht erforderlich.';
    renderDeathOverlay();
    schedulePersistState(true);
    return;
  }

  const nowMs = Date.now();
  meta.rescue.used = true;
  meta.rescue.usedAtRealMs = nowMs;
  meta.rescue.lastResult = 'Rettungsaktion angewendet. Die Pflanze stabilisiert sich.';

  const timestamp = {
    realMs: nowMs,
    simMs: Number(state.simulation.simTimeMs || 0),
    simStamp: simStampFromMs(Number(state.simulation.simTimeMs || 0))
  };
  const history = getCanonicalHistory(state);
  history.system.push({
    type: 'rescue',
    label: 'Notfallrettung',
    effectsApplied: rescueResult.effectsApplied,
    wasDead: rescueResult.wasDead,
    timestamp,
    atRealTimeMs: timestamp.realMs,
    atSimTimeMs: timestamp.simMs
  });
  if (history.system.length > MAX_HISTORY_LOG) {
    history.system = history.system.slice(-MAX_HISTORY_LOG);
  }

  updateVisibleOverlays();
  syncCanonicalStateShape();
  renderAll();
  schedulePersistState(true);
}

async function onPushToggleClick() {
  const notifications = getCanonicalNotificationsSettings(state);
  const currentlyEnabled = notifications.enabled === true;

  if (currentlyEnabled) {
    notifications.enabled = false;
    state.settings.pushNotificationsEnabled = false;
    notifications.lastMessage = 'Benachrichtigungen deaktiviert.';
    renderPushToggle();
    renderGameMenu();
    schedulePersistState(true);
    return;
  }

  if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) {
    notifications.enabled = false;
    state.settings.pushNotificationsEnabled = false;
    notifications.lastMessage = 'Benachrichtigungen werden in diesem Browser nicht unterstützt.';
    renderPushToggle();
    renderGameMenu();
    schedulePersistState(true);
    return;
  }

  let permission = Notification.permission;
  if (permission !== 'granted') {
    permission = await Notification.requestPermission();
  }

  if (permission !== 'granted') {
    notifications.enabled = false;
    state.settings.pushNotificationsEnabled = false;
    notifications.lastMessage = 'Berechtigung nicht erteilt. Bitte Benachrichtigungen im Browser erlauben.';
    renderPushToggle();
    renderGameMenu();
    schedulePersistState(true);
    return;
  }

  if (!navigator.serviceWorker.controller) {
    notifications.enabled = false;
    state.settings.pushNotificationsEnabled = false;
    notifications.lastMessage = 'Service Worker noch nicht aktiv – bitte einmal normal neu laden.';
    renderPushToggle();
    renderGameMenu();
    schedulePersistState(true);
    return;
  }

  notifications.enabled = true;
  state.settings.pushNotificationsEnabled = true;
  notifications.lastMessage = 'Benachrichtigungen aktiviert.';
  renderPushToggle();
  renderGameMenu();
  schedulePersistState(true);
}

function onNotificationTypeToggle() {
  const notifications = getCanonicalNotificationsSettings(state);
  notifications.types.events = Boolean(ui.notifTypeEvents && ui.notifTypeEvents.checked);
  notifications.types.critical = Boolean(ui.notifTypeCritical && ui.notifTypeCritical.checked);
  notifications.types.reminder = Boolean(ui.notifTypeReminder && ui.notifTypeReminder.checked);
  renderPushToggle();
  schedulePersistState(true);
}

async function onAnalysisResetClick() {
  const confirmed = window.confirm('Aktuellen Run wirklich zurücksetzen? Dieser Schritt löscht den gespeicherten Fortschritt.');
  if (!confirmed) {
    return;
  }
  await resetRun();
}

async function resetRun() {
  await clearPersistentStorage();

  resetStateToDefaults();
  ensureStateIntegrity(Date.now());
  syncRuntimeClocks(Date.now());
  syncCanonicalStateShape();
  rescueAdPending = false;
  const notifications = getCanonicalNotificationsSettings(state);
  notifications.runtime.lastNotifiedEventId = null;
  notifications.runtime.lastCriticalAtRealMs = 0;
  notifications.runtime.lastReminderAtRealMs = 0;
  wasCriticalHealth = false;
  if (state.meta && state.meta.rescue) {
    state.meta.rescue.used = false;
    state.meta.rescue.usedAtRealMs = null;
    state.meta.rescue.lastResult = null;
  }

  state.ui.openSheet = null;
  state.ui.deathOverlayOpen = false;
  state.ui.deathOverlayAcknowledged = false;
  for (const key of Object.keys(actionDebounceUntil)) {
    delete actionDebounceUntil[key];
  }

  renderAll();
  schedulePersistState(true);
}

async function clearPersistentStorage() {
  try {
    localStorage.removeItem(LS_STATE_KEY);
  } catch (_error) {
    // non-fatal
  }
  try {
    localStorage.removeItem(PUSH_SUB_KEY);
  } catch (_error) {
    // non-fatal
  }

  if (typeof indexedDB === 'undefined') {
    return;
  }

  try {
    const db = await openDb();
    await dbDelete(db, DB_KEY);
    db.close();
  } catch (_error) {
    // non-fatal
  }
}

function withDebouncedAction(actionKey, buttonNode, callback) {
  const nowMs = Date.now();
  if ((actionDebounceUntil[actionKey] || 0) > nowMs) {
    return;
  }

  actionDebounceUntil[actionKey] = nowMs + CONFIG.actionDebounceMs;
  if (buttonNode) {
    buttonNode.disabled = true;
    window.setTimeout(() => {
      buttonNode.disabled = false;
    }, CONFIG.actionDebounceMs);
  }
  callback();
}

function closeSheet() {
  if (state.events.machineState === 'activeEvent') {
    dismissActiveEvent();
    return;
  }
  state.ui.openSheet = null;
  renderSheets();
}

function dismissActiveEvent() {
  if (state.events.machineState !== 'activeEvent') {
    return;
  }

  const penalty = { health: -1, stress: 2, risk: 2 };
  const eventId = state.events.activeEventId;

  applyChoiceEffects(penalty);
  state.events.lastChoiceId = '__dismiss__';
  state.events.scheduler.lastChoiceId = '__dismiss__';
  state.events.machineState = 'resolved';

  addLog('choice', `Ereignis geschlossen ohne Auswahl: ${eventId}`, {
    choiceId: '__dismiss__',
    effects: penalty
  });

  runEventStateMachine(state.simulation.nowMs);
  state.ui.openSheet = null;
  renderAll();
  schedulePersistState(true);
}

function onVisibilityChange() {
  if (document.visibilityState === 'hidden') {
    schedulePersistState(true);
    stopLoop();
    return;
  }

  if (document.visibilityState === 'visible') {
    syncSimulationFromElapsedTime(Date.now());
    startLoopOnce();
    renderAll();
    schedulePersistState();
    if (!loopRunning) {
      showRuntimeHaltBanner();
    }
  }
}

function onWindowFocus() {
  if (document.visibilityState !== 'visible') {
    return;
  }
  syncSimulationFromElapsedTime(Date.now());
  renderAll();
  schedulePersistState();
}

function onPageShow() {
  if (document.visibilityState !== 'visible') {
    return;
  }
  syncSimulationFromElapsedTime(Date.now());
  startLoopOnce();
  renderAll();
  schedulePersistState();
}

function showRuntimeHaltBanner() {
  const existing = document.getElementById('runtimeHaltBanner');
  if (existing) {
    return;
  }
  const banner = document.createElement('div');
  banner.id = 'runtimeHaltBanner';
  banner.className = 'boot-error-banner';
  banner.innerHTML = '<strong>Simulation angehalten – bitte neu laden.</strong>';
  document.body.appendChild(banner);
}

function translateEventState(machineState) {
  switch (machineState) {
    case 'idle':
      return 'inaktiv';
    case 'activeEvent':
      return 'aktives Ereignis';
    case 'resolved':
      return 'aufgelöst';
    case 'cooldown':
      return 'Abklingzeit';
    default:
      return machineState;
  }
}

function formatCountdown(ms) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return '00:00';
  }

  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function plantAssetPath(stageName) {
  const safeStageKey = normalizeStageKey(stageName);
  const stageIndex = clampInt(Number(safeStageKey.replace('stage_', '')), 1, 12);
  const frameIndex = clampInt(Math.round((stageIndex / 12) * 45) + 1, 1, 46);
  return appPath(`assets/plant_growth/plant_growth_sprite.png#frame_${String(frameIndex).padStart(3, '0')}`);
}

function applyBackgroundAsset() {
  const bg = state.ui.selectedBackground === 'bg_dark_02.jpg'
    ? appPath('assets/backgrounds/bg_dark_02.jpg')
    : appPath('assets/backgrounds/bg_dark_01.jpg');

  document.body.style.backgroundImage = `linear-gradient(135deg, rgba(7, 10, 17, 0.93) 0%, rgba(9, 14, 24, 0.88) 100%), url('${bg}')`;
}

async function createStorageAdapter() {
  if (typeof indexedDB === 'undefined') {
    return localStorageAdapter();
  }

  try {
    const db = await openDb();
    return {
      async get() {
        return dbGet(db, DB_KEY);
      },
      async set(snapshot) {
        await dbSet(db, DB_KEY, snapshot);
      }
    };
  } catch (_error) {
    return localStorageAdapter();
  }
}
