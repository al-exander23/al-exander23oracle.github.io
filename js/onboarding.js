// onboarding.js — first-run guide for the current ALX Oracle experience.
// Pure presentation layer: it does not change Oracle, profile or payment logic.

const DONE_KEY = 'alx_oracle_onboarding_v1';
const HISTORY_KEY = 'alx_oracle_history';
const OVERLAY_ID = 'alxOnboarding';
const HELP_ID = 'onboardingHelpBtn';

const STEPS = [
  {
    target: '#orbWrap',
    kicker: '01 · ЧТО ЭТО',
    icon: 'ALX',
    title: 'Оракул, а не каталог',
    text: 'ALX Oracle не просит листать сотни рецептов. Ты задаёшь направление, а Оракул сам раскрывает конкретный микс, состав и пропорции.',
    chips: ['выбери направление', 'доверь выбор шару'],
  },
  {
    target: '#orbWrap',
    kicker: '02 · ГЛАВНОЕ ДЕЙСТВИЕ',
    icon: '✦',
    title: 'Коснись шара',
    text: 'Нажми на шар — или встряхни телефон. После короткой сцены Оракул покажет один готовый микс с точными пропорциями.',
    chips: ['тап по шару', 'встряхивание', 'готовый рецепт'],
  },
  {
    target: '#alxBottomNav',
    kicker: '03 · НАВИГАЦИЯ',
    icon: 'ALX',
    title: 'Четыре понятных раздела',
    text: 'Основные функции всегда находятся внизу. Никаких скрытых значков: каждый раздел подписан словами.',
    legend: [
      ['Главная', 'шар и текущий подбор'],
      ['Избранное', 'сохранённые миксы'],
      ['Мой ALX', 'профиль, история и настройки'],
      ['PRO', 'закрытые направления Оракула'],
    ],
  },
  {
    target: '#alxAccessStrip',
    kicker: '04 · FREE И PRO',
    icon: 'PRO',
    title: 'Сначала можно бесплатно',
    text: 'FREE даёт 5 подборов в день. ALX PRO снимает дневной лимит и открывает закрытые направления, которые можно выбирать перед запуском шара.',
    chips: ['FREE · 5 в день', 'PRO · без лимита', 'PRO · направления'],
  },
  {
    target: '#alxBottomNav',
    kicker: '05 · PRO НАПРАВЛЕНИЯ',
    icon: 'PRO',
    title: 'Ты выбираешь настроение — Оракул выбирает микс',
    text: 'В PRO доступны ALX Originals, Parfum Lab, LIMITED 2026, ALX Signature, Для двоих, После полуночи и Эксперимент. Выбери направление, вернись на Главную и коснись шара.',
    chips: ['ALX Originals', 'Parfum Lab', 'LIMITED 2026', '+ ещё 4 направления'],
  },
  {
    target: '#alxBottomNav',
    kicker: '06 · МОЙ ALX',
    icon: 'ALX',
    title: 'Оракул запоминает твой вкус',
    text: 'В «Мой ALX» находятся профиль вкуса, история, Микс дня, достижения, уведомления и управление PRO. Сохраняй удачные миксы — персонализация станет точнее.',
    chips: ['профиль вкуса', 'история', 'Микс дня', 'достижения'],
  },
  {
    target: '#orbWrap',
    kicker: '07 · ГОТОВО',
    icon: '✦',
    title: 'Теперь спроси Оракула',
    text: 'На Главной просто коснись шара. Если захочешь изменить характер подбора — открой PRO, выбери направление и снова возвращайся к шару.',
    chips: ['направление', 'шар', 'конкретный микс'],
  },
];

let stepIndex = 0;
let currentTarget = null;
let manualOpen = false;

function safelyParse(raw, fallback) {
  try { return JSON.parse(raw); } catch (error) { return fallback; }
}

function hasMeaningfulHistory() {
  try {
    const history = safelyParse(localStorage.getItem(HISTORY_KEY), []);
    return Array.isArray(history) && history.length > 0;
  } catch (error) {
    return false;
  }
}

function isDone() {
  try { return localStorage.getItem(DONE_KEY) === 'done'; } catch (error) { return false; }
}

function markDone() {
  try { localStorage.setItem(DONE_KEY, 'done'); } catch (error) { /* non-fatal */ }
}

function ensureHelpButton() {
  if (document.getElementById(HELP_ID)) return;
  const toolbar = document.getElementById('topToolbar');
  if (!toolbar) return;

  const button = document.createElement('button');
  button.id = HELP_ID;
  button.className = 'icon-btn onboarding-help-btn';
  button.type = 'button';
  button.textContent = '?';
  button.setAttribute('aria-label', 'Как пользоваться ALX Oracle');
  button.addEventListener('click', () => openOnboarding(true));
  toolbar.appendChild(button);
}

function ensureOverlay() {
  let overlay = document.getElementById(OVERLAY_ID);
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.className = 'alx-onboarding';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.innerHTML = `
    <div class="alx-tour-backdrop" aria-hidden="true"></div>
    <section class="alx-tour-card is-bottom" role="dialog" aria-modal="true" aria-labelledby="alxTourTitle">
      <div class="alx-tour-topline">
        <span class="alx-tour-kicker" id="alxTourKicker"></span>
        <button class="alx-tour-skip" id="alxTourSkip" type="button">Пропустить</button>
      </div>
      <div class="alx-tour-hero">
        <div class="alx-tour-icon" id="alxTourIcon">✦</div>
        <div>
          <h2 id="alxTourTitle"></h2>
          <p id="alxTourText"></p>
        </div>
      </div>
      <div class="alx-tour-legend" id="alxTourLegend"></div>
      <div class="alx-tour-chips" id="alxTourChips"></div>
      <div class="alx-tour-footer">
        <div class="alx-tour-progress" id="alxTourProgress" aria-label="Прогресс инструкции"></div>
        <button class="alx-tour-next" id="alxTourNext" type="button">Далее</button>
      </div>
    </section>`;
  document.body.appendChild(overlay);

  overlay.querySelector('#alxTourSkip')?.addEventListener('click', () => closeOnboarding(true));
  overlay.querySelector('#alxTourNext')?.addEventListener('click', () => {
    if (stepIndex >= STEPS.length - 1) {
      closeOnboarding(true);
      return;
    }
    stepIndex += 1;
    renderStep();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && overlay.classList.contains('show')) closeOnboarding(true);
  });

  window.addEventListener('resize', () => {
    if (overlay.classList.contains('show')) placeCard();
  });

  return overlay;
}

function clearFocus() {
  currentTarget?.classList.remove('alx-tour-focus');
  currentTarget = null;
}

function resolveTarget(selector) {
  const exact = document.querySelector(selector);
  if (exact) return exact;
  return document.getElementById('orbWrap') || document.getElementById('stage');
}

function placeCard() {
  const overlay = document.getElementById(OVERLAY_ID);
  const card = overlay?.querySelector('.alx-tour-card');
  if (!card || !currentTarget) return;

  const rect = currentTarget.getBoundingClientRect();
  const midpoint = rect.top + rect.height / 2;
  const targetLow = midpoint > window.innerHeight * 0.58;
  card.classList.toggle('is-top', targetLow);
  card.classList.toggle('is-bottom', !targetLow);
}

function revealTarget(target) {
  const rect = target.getBoundingClientRect();
  const fixedTarget = target.id === 'topToolbar' || target.id === 'alxBottomNav';
  if (fixedTarget) return;

  if (rect.bottom > window.innerHeight - 170 || rect.top < 60) {
    try {
      target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      setTimeout(placeCard, 260);
    } catch (error) { /* old webview */ }
  }
}

function renderProgress(container) {
  container.innerHTML = STEPS.map((_, index) => `
    <span class="alx-tour-dot${index === stepIndex ? ' active' : ''}${index < stepIndex ? ' done' : ''}"></span>
  `).join('');
}

function renderStep() {
  const overlay = ensureOverlay();
  const step = STEPS[stepIndex];
  clearFocus();

  currentTarget = resolveTarget(step.target);
  currentTarget?.classList.add('alx-tour-focus');

  overlay.querySelector('#alxTourKicker').textContent = step.kicker;
  overlay.querySelector('#alxTourIcon').textContent = step.icon;
  overlay.querySelector('#alxTourTitle').textContent = step.title;
  overlay.querySelector('#alxTourText').textContent = step.text;

  const legend = overlay.querySelector('#alxTourLegend');
  legend.innerHTML = (step.legend || []).map(([icon, label]) => `
    <div class="alx-tour-legend-item"><b>${icon}</b><span>${label}</span></div>
  `).join('');
  legend.hidden = !step.legend?.length;

  const chips = overlay.querySelector('#alxTourChips');
  chips.innerHTML = (step.chips || []).map((item) => `<span>${item}</span>`).join('');
  chips.hidden = !step.chips?.length;

  renderProgress(overlay.querySelector('#alxTourProgress'));
  const next = overlay.querySelector('#alxTourNext');
  next.textContent = stepIndex === STEPS.length - 1 ? 'Попробовать' : 'Далее';

  revealTarget(currentTarget);
  requestAnimationFrame(placeCard);
}

function openOnboarding(manual = false) {
  manualOpen = manual;
  stepIndex = 0;
  const overlay = ensureOverlay();
  overlay.classList.add('show');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('alx-tour-open');
  renderStep();
}

function closeOnboarding(remember = true) {
  const overlay = document.getElementById(OVERLAY_ID);
  overlay?.classList.remove('show');
  overlay?.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('alx-tour-open');
  clearFocus();
  if (remember) markDone();
  if (!manualOpen) {
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (error) { window.scrollTo(0, 0); }
  }
  manualOpen = false;
}

function init() {
  ensureHelpButton();
  ensureOverlay();

  if (!isDone() && !hasMeaningfulHistory()) {
    setTimeout(() => openOnboarding(false), 850);
  }
}

init();
