// ALX Oracle v4.0 — visual phase controller only.
// It reads the existing stable screen output and mirrors its phase onto orbWrap.
// No business logic, storage, oracle selection or SceneController ownership lives here.

const orbWrap = document.getElementById('orbWrap');
const screenContent = document.getElementById('screenContent');
const nextMixBtn = document.getElementById('nextMixBtn');

function syncVisualPhase() {
  if (!orbWrap || !screenContent) return;
  orbWrap.classList.remove('phase-idle', 'phase-phrase', 'phase-reveal');

  if (screenContent.querySelector('.oracle-phrase')) {
    orbWrap.classList.add('phase-phrase');
    return;
  }
  if (screenContent.querySelector('.mix-name')) {
    orbWrap.classList.add('phase-reveal');
    return;
  }
  orbWrap.classList.add('phase-idle');
}

if (screenContent) {
  const observer = new MutationObserver(() => requestAnimationFrame(syncVisualPhase));
  observer.observe(screenContent, { childList: true, subtree: true });
}
syncVisualPhase();

// Reuse the orb's one existing entry point. This preserves the single scene lock.
if (nextMixBtn && orbWrap) {
  nextMixBtn.addEventListener('click', () => orbWrap.click());
}

// Card presentation only: wrap freshly-rendered result into a reference-style media layout.
const FLAVOR_EMOJI = [
  ['клуб', '🍓'], ['арбуз', '🍉'], ['дын', '🍈'], ['банан', '🍌'], ['ананас', '🍍'],
  ['перс', '🍑'], ['манго', '🥭'], ['яблок', '🍏'], ['груш', '🍐'], ['виноград', '🍇'],
  ['виш', '🍒'], ['лимон', '🍋'], ['лайм', '🍋'], ['апельс', '🍊'], ['мандар', '🍊'],
  ['кокос', '🥥'], ['мят', '🌿'], ['коф', '☕'], ['шокол', '🍫'], ['йогурт', '🥛'], ['молок', '🥛']
];

function pickEmoji(text) {
  const value = String(text || '').toLowerCase();
  const found = FLAVOR_EMOJI.find(([needle]) => value.includes(needle));
  return found ? found[1] : '✦';
}

function decorateCard() {
  const card = document.getElementById('mixCard');
  if (!card || !card.classList.contains('show') || card.querySelector('.mix-card-layout')) return;
  const nodes = Array.from(card.childNodes);
  if (!nodes.length) return;

  const content = document.createElement('div');
  content.className = 'mix-card-content';
  nodes.forEach((node) => content.appendChild(node));

  const visual = document.createElement('div');
  visual.className = 'mix-card-visual';
  visual.setAttribute('aria-hidden', 'true');
  visual.textContent = pickEmoji(content.textContent);

  const layout = document.createElement('div');
  layout.className = 'mix-card-layout';
  layout.append(visual, content);
  card.appendChild(layout);
}

const card = document.getElementById('mixCard');
if (card) {
  const cardObserver = new MutationObserver(() => requestAnimationFrame(decorateCard));
  cardObserver.observe(card, { childList: true, subtree: false, attributes: true, attributeFilter: ['class'] });
}
decorateCard();
