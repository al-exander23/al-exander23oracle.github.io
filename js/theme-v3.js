// ALX Oracle v3 — presentation-only DOM polish.
// Keeps existing event handlers and business logic intact; it only wraps rendered card nodes.
const FLAVOR_EMOJI = [
  ['клуб', '🍓'], ['арбуз', '🍉'], ['дын', '🍈'], ['банан', '🍌'], ['ананас', '🍍'],
  ['перс', '🍑'], ['абрик', '🍑'], ['манго', '🥭'], ['яблок', '🍏'], ['груш', '🍐'],
  ['виноград', '🍇'], ['виш', '🍒'], ['череш', '🍒'], ['лимон', '🍋'], ['лайм', '🍋'],
  ['апельс', '🍊'], ['мандар', '🍊'], ['грейп', '🍊'], ['кокос', '🥥'], ['мят', '🌿'],
  ['коф', '☕'], ['шокол', '🍫'], ['ванил', '🌼'], ['йогурт', '🥛'], ['молок', '🥛'],
  ['лед', '❄️'], ['лёд', '❄️']
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
  const observer = new MutationObserver(() => requestAnimationFrame(decorateCard));
  observer.observe(card, { childList: true, subtree: false, attributes: true, attributeFilter: ['class'] });
}

decorateCard();
