// ALX Oracle v3.1 — presentation-only scene details.
// Does not touch SceneController, #screen ownership, result lifecycle or personalization.
const room = document.querySelector('.oracle-room');
if (room && !room.querySelector('.room-arch')) {
  room.insertAdjacentHTML('beforeend', `
    <span class="room-arch room-arch--l"></span>
    <span class="room-arch room-arch--r"></span>
    <span class="room-books" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
    <span class="room-vessel" aria-hidden="true"></span>
  `);
}

// Keep the card thumbnail visually connected to the currently rendered recipe.
const EMOJI = [
  ['клуб','🍓'],['арбуз','🍉'],['дын','🍈'],['банан','🍌'],['ананас','🍍'],['манго','🥭'],
  ['перс','🍑'],['абрик','🍑'],['яблок','🍏'],['груш','🍐'],['виноград','🍇'],['виш','🍒'],
  ['лимон','🍋'],['лайм','🍋'],['апельс','🍊'],['мандар','🍊'],['кокос','🥥'],['мят','🌿'],
  ['коф','☕'],['шокол','🍫'],['йогурт','🥛'],['молок','🥛'],['лед','❄️'],['лёд','❄️']
];

function refreshVisual() {
  const card = document.getElementById('mixCard');
  const visual = card?.querySelector('.mix-card-visual');
  if (!visual) return;
  const text = card.textContent.toLowerCase();
  const icons = EMOJI.filter(([key]) => text.includes(key)).slice(0, 3).map(([, icon]) => icon);
  visual.textContent = icons.length ? icons.join(' ') : '✦';
}

const card = document.getElementById('mixCard');
if (card) {
  new MutationObserver(() => requestAnimationFrame(refreshVisual)).observe(card, { childList:true, subtree:true, attributes:true });
  refreshVisual();
}
