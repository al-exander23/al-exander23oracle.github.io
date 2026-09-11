// ALX Oracle v5.2 — continuous ambience + smoke controller.
// Presentation only. Oracle selection, SceneController, #screen lifecycle and storage stay untouched.

const stage = document.getElementById('stage');
const orbWrap = document.getElementById('orbWrap');
const PARTS = [1, 2, 3, 4, 5, 6].map((n) => `assets/v5/hero.${n}.b64?v=5.2.0`);

function makeSmokeContainer(className, count) {
  const el = document.createElement('div');
  el.className = className;
  el.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < count; i++) el.appendChild(document.createElement('span'));
  return el;
}

async function decodeReferenceArt() {
  const chunks = await Promise.all(PARTS.map(async (url) => {
    const response = await fetch(url, { cache: 'force-cache' });
    if (!response.ok) throw new Error(`reference part ${response.status}`);
    return (await response.text()).trim();
  }));

  const binary = atob(chunks.join(''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: 'image/webp' }));
}

async function buildContinuousBackground() {
  if (!stage || stage.querySelector('.v52-stage-bg')) return;

  const bg = document.createElement('div');
  bg.className = 'v52-stage-bg';
  bg.setAttribute('aria-hidden', 'true');

  const img = document.createElement('img');
  img.className = 'v52-stage-bg-art';
  img.alt = '';
  img.draggable = false;
  bg.appendChild(img);
  stage.prepend(bg);

  try {
    const blobUrl = await decodeReferenceArt();
    img.addEventListener('load', () => {
      document.documentElement.classList.add('v52-ambient-ready');
      URL.revokeObjectURL(blobUrl);
    }, { once: true });
    img.src = blobUrl;
  } catch (error) {
    console.warn('[ALX v5.2] Ambient reference background unavailable; gradient fallback remains active:', error);
  }
}

function buildLivingSmoke() {
  if (stage && !stage.querySelector('.v52-smoke-world')) {
    stage.insertBefore(makeSmokeContainer('v52-smoke-world', 8), stage.children[1] || null);
  }

  if (orbWrap && !orbWrap.querySelector('.v52-orb-smoke-shell')) {
    const aura = document.createElement('div');
    aura.className = 'v52-orb-aura';
    aura.setAttribute('aria-hidden', 'true');

    const smoke = makeSmokeContainer('v52-orb-smoke-shell', 8);
    const screen = document.getElementById('screen');
    if (screen) {
      orbWrap.insertBefore(aura, screen);
      orbWrap.insertBefore(smoke, screen);
    } else {
      orbWrap.append(aura, smoke);
    }
  }
}

buildContinuousBackground();
buildLivingSmoke();
