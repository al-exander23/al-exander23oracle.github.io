// ALX Oracle v5.3 — visual motion controller only.
// No oracle selection, storage, SceneController or protected text ownership lives here.

const stage = document.getElementById('stage');
const orbWrap = document.getElementById('orbWrap');
const screen = document.getElementById('screen');

function makeLayer(className, count = 0) {
  const el = document.createElement('div');
  el.className = className;
  el.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < count; i++) el.appendChild(document.createElement('span'));
  return el;
}

function buildBackdrop() {
  if (!stage || stage.querySelector('.v53-backdrop')) return;

  const backdrop = makeLayer('v53-backdrop');
  const img = document.createElement('img');
  img.className = 'v53-backdrop-image';
  img.alt = '';
  img.draggable = false;
  img.src = 'assets/v5/ambient.webp?v=5.3.0';
  img.addEventListener('load', () => {
    document.documentElement.classList.add('v53-bg-ready');
  }, { once: true });
  backdrop.appendChild(img);

  const ambientSmoke = makeLayer('v53-ambient-smoke', 4);
  stage.prepend(ambientSmoke);
  stage.prepend(backdrop);
}

function buildHeroSmoke() {
  if (!orbWrap || orbWrap.querySelector('.v53-hero-smoke')) return;
  const smoke = makeLayer('v53-hero-smoke', 9);

  const hero = document.getElementById('v5HeroArt');
  if (hero && hero.nextSibling) orbWrap.insertBefore(smoke, hero.nextSibling);
  else orbWrap.prepend(smoke);
}

function buildOrbInterior() {
  if (!orbWrap || orbWrap.querySelector('.v53-orb-interior')) return;

  const interior = makeLayer('v53-orb-interior');
  const vortexA = makeLayer('v53-orb-vortex', 5);
  const vortexB = makeLayer('v53-orb-vortex v53-orb-vortex--reverse', 5);
  interior.append(vortexA, vortexB);

  const frontHaze = makeLayer('v53-front-haze');
  const touch = makeLayer('v53-orb-touch');

  if (screen) {
    orbWrap.insertBefore(interior, screen);
    if (screen.nextSibling) {
      orbWrap.insertBefore(frontHaze, screen.nextSibling);
      orbWrap.insertBefore(touch, screen.nextSibling);
    } else {
      orbWrap.append(frontHaze, touch);
    }
  } else {
    orbWrap.append(interior, frontHaze, touch);
  }
}

function installTouchPulse() {
  if (!orbWrap) return;
  let timer = null;

  const pulse = () => {
    orbWrap.classList.remove('v53-touching');
    void orbWrap.offsetWidth;
    orbWrap.classList.add('v53-touching');
    clearTimeout(timer);
    timer = setTimeout(() => orbWrap.classList.remove('v53-touching'), 760);
  };

  orbWrap.addEventListener('pointerdown', pulse, { passive: true });
}

buildBackdrop();
buildHeroSmoke();
buildOrbInterior();
installTouchPulse();

requestAnimationFrame(() => {
  requestAnimationFrame(() => document.documentElement.classList.add('v53-ready'));
});
