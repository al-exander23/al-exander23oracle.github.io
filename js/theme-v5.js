// ALX Oracle v5 — reference-driven visual controller.
// Presentation only. Business logic and SceneController ownership stay unchanged.

const PARTS = [1, 2, 3, 4, 5, 6].map((n) => `assets/v5/hero.${n}.b64?v=5.0.0`);
const heroImg = document.getElementById('v5HeroArt');
const orbWrap = document.getElementById('orbWrap');
const screenContent = document.getElementById('screenContent');
const nextMixBtn = document.getElementById('nextMixBtn');

async function loadReferenceHero() {
  if (!heroImg) return;
  try {
    const chunks = await Promise.all(PARTS.map(async (url) => {
      const res = await fetch(url, { cache: 'force-cache' });
      if (!res.ok) throw new Error(`hero part ${res.status}`);
      return (await res.text()).trim();
    }));
    const binary = atob(chunks.join(''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blobUrl = URL.createObjectURL(new Blob([bytes], { type: 'image/webp' }));
    heroImg.addEventListener('load', () => {
      document.documentElement.classList.add('v5-art-ready');
      URL.revokeObjectURL(blobUrl);
    }, { once: true });
    heroImg.src = blobUrl;
  } catch (error) {
    console.warn('[ALX v5] Reference art failed to load, CSS fallback remains active:', error);
  }
}

function syncVisualPhase() {
  if (!orbWrap || !screenContent) return;
  orbWrap.classList.remove('phase-idle', 'phase-phrase', 'phase-reveal');
  if (screenContent.querySelector('.oracle-phrase')) {
    orbWrap.classList.add('phase-phrase');
  } else if (screenContent.querySelector('.mix-name')) {
    orbWrap.classList.add('phase-reveal');
  } else {
    orbWrap.classList.add('phase-idle');
  }
}

if (screenContent) {
  const observer = new MutationObserver(() => requestAnimationFrame(syncVisualPhase));
  observer.observe(screenContent, { childList: true, subtree: true });
}
syncVisualPhase();

// Reuse the one existing click entry point and its scene lock.
if (nextMixBtn && orbWrap) {
  nextMixBtn.addEventListener('click', () => orbWrap.click());
}

loadReferenceHero();
