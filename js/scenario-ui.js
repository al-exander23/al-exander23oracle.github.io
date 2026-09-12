// scenario-ui.js — UI ситуационного режима внутри уже существующего Taste Profile.
// Главный экран и визуал шара не меняет.

import { initMixes, getMixes } from './mixes.js';
import {
  SCENARIO_OPTIONS,
  COLLECTION_OPTIONS,
  getScenario,
  setScenario,
  resetScenario,
  describeScenario,
  getCollectionCounts,
  hasActiveScenario,
} from './scenario.js?v=1.13.0';
import {
  isProActive,
  isPremiumCollection,
  requestProPaywall,
} from './pro.js?v=1.13.0';

const SECTION_ID = 'scenarioOracleSection';
let renderQueued = false;

function optionButtons(group, options, selected) {
  return options.map((option) => `
    <button
      class="scenario-choice${selected === option.id ? ' active' : ''}"
      type="button"
      data-scenario-group="${group}"
      data-scenario-value="${option.id}"
      aria-pressed="${selected === option.id}"
    >${option.label}</button>`).join('');
}

function collectionButtons(selected, counts) {
  const proActive = isProActive();

  return COLLECTION_OPTIONS.map((collection) => {
    const premium = isPremiumCollection(collection.id);
    const locked = premium && !proActive;

    return `
      <button
        class="scenario-choice scenario-choice--collection${selected === collection.id ? ' active' : ''}${locked ? ' pro-locked' : ''}"
        type="button"
        data-scenario-collection="${collection.id}"
        data-scenario-premium="${premium}"
        aria-pressed="${selected === collection.id}"
        aria-label="${collection.label}${locked ? ', ALX PRO' : ''}"
      >
        <span>${collection.label}${locked ? ' <span class="pro-lock">PRO</span>' : ''}</span>
        <small>${counts[collection.id] || 0}</small>
      </button>`;
  }).join('');
}

function buildSection(mixes) {
  const scenario = getScenario();
  const counts = getCollectionCounts(mixes);
  const active = hasActiveScenario(scenario);

  const section = document.createElement('div');
  section.id = SECTION_ID;
  section.className = 'taste-section scenario-section';
  section.innerHTML = `
    <div class="taste-section-title taste-section-title--row">
      <span>Режим Оракула</span>
      <span class="scenario-state${active ? ' active' : ''}">${active ? 'активен' : 'обычный'}</span>
    </div>

    <div class="scenario-card">
      <div class="scenario-summary">${describeScenario(scenario)}</div>
      <div class="scenario-note">Настройки влияют на следующий обычный ответ шара. «Микс дня» остаётся отдельным выбором.</div>

      <div class="scenario-row">
        <div class="scenario-label">Настроение</div>
        <div class="scenario-scroll">${optionButtons('mood', SCENARIO_OPTIONS.mood, scenario.mood)}</div>
      </div>

      <div class="scenario-row">
        <div class="scenario-label">Компания</div>
        <div class="scenario-scroll">${optionButtons('company', SCENARIO_OPTIONS.company, scenario.company)}</div>
      </div>

      <div class="scenario-row">
        <div class="scenario-label">Время</div>
        <div class="scenario-scroll">${optionButtons('time', SCENARIO_OPTIONS.time, scenario.time)}</div>
      </div>

      <div class="scenario-row scenario-row--collection">
        <div class="scenario-label">Коллекция</div>
        <div class="scenario-scroll scenario-scroll--collections">${collectionButtons(scenario.collection, counts)}</div>
      </div>

      <button class="scenario-reset" id="scenarioReset" type="button" ${active ? '' : 'disabled'}>Сбросить режим</button>
    </div>`;

  section.querySelectorAll('[data-scenario-group]').forEach((button) => {
    button.addEventListener('click', () => {
      const group = button.dataset.scenarioGroup;
      const value = button.dataset.scenarioValue;
      setScenario({ [group]: value });
      renderScenarioSection();
    });
  });

  section.querySelectorAll('[data-scenario-collection]').forEach((button) => {
    button.addEventListener('click', () => {
      const collectionId = button.dataset.scenarioCollection;
      const premium = isPremiumCollection(collectionId);

      if (premium && !isProActive()) {
        const collection = COLLECTION_OPTIONS.find((item) => item.id === collectionId);
        requestProPaywall(collection?.label || 'PRO-коллекция');
        return;
      }

      setScenario({ collection: collectionId });
      renderScenarioSection();
    });
  });

  section.querySelector('#scenarioReset')?.addEventListener('click', () => {
    resetScenario();
    renderScenarioSection();
  });

  return section;
}

async function renderScenarioSection() {
  const content = document.getElementById('tasteContent');
  if (!content) return;

  await initMixes();
  const mixes = getMixes();
  const fresh = buildSection(mixes);
  const existing = document.getElementById(SECTION_ID);

  if (existing) {
    existing.replaceWith(fresh);
    return;
  }

  const daily = content.querySelector('.taste-daily-card');
  if (daily) {
    daily.insertAdjacentElement('afterend', fresh);
    return;
  }

  const level = content.querySelector('.taste-level-card');
  if (level) {
    level.insertAdjacentElement('afterend', fresh);
  } else {
    content.prepend(fresh);
  }
}

function queueRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    const overlay = document.getElementById('tasteOverlay');
    if (!overlay?.classList.contains('show')) return;
    renderScenarioSection().catch((error) => console.warn('[ALX Scenario UI]', error));
  });
}

function initScenarioUi() {
  const content = document.getElementById('tasteContent');
  const tasteBtn = document.getElementById('tasteBtnTop');
  if (!content || !tasteBtn) return;

  tasteBtn.addEventListener('click', () => setTimeout(queueRender, 0));
  window.addEventListener('alx-pro-change', queueRender);

  const observer = new MutationObserver(() => {
    const overlay = document.getElementById('tasteOverlay');
    if (overlay?.classList.contains('show') && !document.getElementById(SECTION_ID)) {
      queueRender();
    }
  });
  observer.observe(content, { childList: true });
}

initScenarioUi();
