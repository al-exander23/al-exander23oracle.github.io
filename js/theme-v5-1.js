// ALX Oracle v5.1 — animated crystal optics.
// Presentation only: no oracle selection, scene lock, typing lifecycle or storage changes.

const orbWrap = document.getElementById('orbWrap');
const PARTS = [1, 2, 3, 4, 5, 6].map((n) => `assets/v5/hero.${n}.b64?v=5.1.0`);

function makeLayer(className) {
  const el = document.createElement('div');
  el.className = className;
  el.setAttribute('aria-hidden', 'true');
  return el;
}

async function buildAnimatedLens() {
  if (!orbWrap || orbWrap.querySelector('.v5-orb-motion')) return;

  const motion = makeLayer('v5-orb-motion');
  const lensImg = document.createElement('img');
  lensImg.className = 'v5-orb-motion-image';
  lensImg.alt = '';
  lensImg.draggable = false;
  lensImg.setAttribute('aria-hidden', 'true');
  motion.appendChild(lensImg);

  const caustics = makeLayer('v5-orb-caustics');
  const liveRim = makeLayer('v5-orb-live-rim');
  const glint = makeLayer('v5-orb-glint');

  orbWrap.append(motion, caustics, liveRim, glint);

  try {
    const chunks = await Promise.all(PARTS.map(async (url) => {
      const response = await fetch(url, { cache: 'force-cache' });
      if (!response.ok) throw new Error(`orb reference part ${response.status}`);
      return (await response.text()).trim();
    }));

    const binary = atob(chunks.join(''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const blobUrl = URL.createObjectURL(new Blob([bytes], { type: 'image/webp' }));
    lensImg.addEventListener('load', () => {
      motion.classList.add('is-ready');
      URL.revokeObjectURL(blobUrl);
    }, { once: true });
    lensImg.src = blobUrl;
  } catch (error) {
    console.warn('[ALX v5.1] Animated orb crop failed to load; optical overlays remain active:', error);
  }
}

function bindOpticalFeedback() {
  if (!orbWrap) return;
  let timer = null;

  const pulse = () => {
    orbWrap.classList.add('v5-orb-hit');
    clearTimeout(timer);
    timer = setTimeout(() => orbWrap.classList.remove('v5-orb-hit'), 260);
  };

  // Visual feedback only. The actual oracle still starts exclusively from the existing click handler.
  orbWrap.addEventListener('pointerdown', pulse, { passive: true });
}

buildAnimatedLens();
bindOpticalFeedback();
