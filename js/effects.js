// effects.js — вся «физика» визуальных эффектов в одном месте:
// вращение глобуса, печать текста оракула, дым, фоновые частицы.
// Ничего не знает про миксы и про то, что происходит в UI —
// только про DOM-элементы, которые ему передали.

// ---------------------------------------------------------------
// Вращающийся глобус: честная орто-проекция сферы (не скролл фона).
// Меридианы и материки едут по синусоиде и сжимаются (scaleX) у края —
// ровно так двигалась бы поверхность настоящей вращающейся сферы.
// ---------------------------------------------------------------
let activeRotatorInstance = null;

export function createGlobeRotator(orbSurfaceEl) {
  if (activeRotatorInstance) {
    console.warn('[ALX] createGlobeRotator() вызван повторно — возвращён уже существующий инстанс, второй RAF-луп не создан.');
    return activeRotatorInstance;
  }

  const reduceMotion = window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const IDLE_SPEED = reduceMotion ? 0 : 20;   // градусов в секунду в покое
  const BURST_SPEED = reduceMotion ? 0 : 260; // градусов в секунду во время ответа

  let speed = IDLE_SPEED;
  let targetSpeed = IDLE_SPEED;
  let angle = 0;
  let lastTs = null;
  let center = 125;
  let sphereR = 108;

  function measure() {
    const w = orbSurfaceEl.clientWidth || 250;
    center = w / 2;
    sphereR = (w / 2) * 0.86;
  }
  measure();
  window.addEventListener('resize', measure);

  const MERIDIAN_COUNT = 9;
  const meridians = [];
  for (let i = 0; i < MERIDIAN_COUNT; i++) {
    const el = document.createElement('div');
    el.className = 'meridian';
    orbSurfaceEl.appendChild(el);
    meridians.push({ el, lon: i * (360 / MERIDIAN_COUNT) });
  }

  const continentDefs = [
    { lon: 8, lat: -0.30, w: 46, h: 30, a: 0.42 },
    { lon: 52, lat: 0.12, w: 30, h: 46, a: 0.40 },
    { lon: 96, lat: -0.42, w: 26, h: 20, a: 0.34 },
    { lon: 140, lat: 0.34, w: 36, h: 22, a: 0.36 },
    { lon: 190, lat: -0.06, w: 22, h: 36, a: 0.30 },
    { lon: 232, lat: 0.40, w: 26, h: 16, a: 0.28 },
    { lon: 276, lat: -0.34, w: 20, h: 26, a: 0.30 },
    { lon: 322, lat: 0.16, w: 32, h: 24, a: 0.34 },
  ];
  const continents = continentDefs.map((c) => {
    const el = document.createElement('div');
    el.className = 'continent';
    el.style.width = c.w + 'px';
    el.style.height = c.h + 'px';
    el.style.background = `radial-gradient(ellipse, rgba(196,196,208,${c.a}) 0%, rgba(196,196,208,0) 75%)`;
    orbSurfaceEl.appendChild(el);
    return { ...c, el };
  });

  function updateSurface(angleDeg) {
    for (const m of meridians) {
      const rad = (m.lon + angleDeg) * Math.PI / 180;
      const s = Math.sin(rad), c = Math.cos(rad);
      const x = center + sphereR * s;
      const scaleX = Math.max(0.04, Math.abs(c));
      m.el.style.left = x + 'px';
      m.el.style.opacity = (Math.max(0, c) * 0.4).toFixed(3);
      m.el.style.transform = `translateX(-50%) scaleX(${scaleX.toFixed(3)})`;
    }
    for (const cc of continents) {
      const rad = (cc.lon + angleDeg) * Math.PI / 180;
      const s = Math.sin(rad), c = Math.cos(rad);
      const x = center + sphereR * s;
      const y = center + cc.lat * sphereR;
      const scaleX = Math.max(0.06, Math.abs(c));
      cc.el.style.left = x + 'px';
      cc.el.style.top = y + 'px';
      cc.el.style.opacity = Math.max(0, c).toFixed(3);
      cc.el.style.transform = `translate(-50%,-50%) scaleX(${scaleX.toFixed(3)})`;
    }
  }

  function tick(ts) {
    if (lastTs === null) lastTs = ts;
    const dt = Math.min(ts - lastTs, 50) / 1000;
    lastTs = ts;
    // экспоненциальное сглаживание скорости — ускорение/торможение без единого скачка
    speed += (targetSpeed - speed) * Math.min(dt * 2.2, 1);
    angle = (angle + speed * dt) % 360;
    updateSurface(angle);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  activeRotatorInstance = {
    setBurst() { targetSpeed = BURST_SPEED; },
    setIdle() { targetSpeed = IDLE_SPEED; },
  };
  return activeRotatorInstance;
}

// ---------------------------------------------------------------
// «Оракул пишет ответ» — мягкое посимвольное появление текста.
// Один контролируемый механизм: async/await + setTimeout, без
// параллельного requestAnimationFrame — раньше два механизма сразу
// усложняли отмену без явной причины.
// Буквы сгруппированы по словам (nowrap), поэтому перенос строки
// возможен только на пробеле/дефисе, а не посреди слова.
//
// Гарантии (проверены тестами): только один активный вызов на элемент;
// после Abort — ни одного изменения DOM; после завершения сцены текст
// больше не трогается; повторный вызов для уже печатающегося элемента
// игнорируется, а не запускает второй параллельный "поток" печати.
// ---------------------------------------------------------------
const activeTypingElements = new WeakSet();

function typeLog(...args) {
  if (typeof window !== 'undefined' && window.__ALX_DEBUG__) console.log('[ALX]', ...args);
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) { reject(new DOMException('Отменено', 'AbortError')); return; }
    const id = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener('abort', () => {
        clearTimeout(id);
        reject(new DOMException('Отменено', 'AbortError'));
      }, { once: true });
    }
  });
}

export async function typeText(el, text, signal) {
  if (activeTypingElements.has(el)) {
    console.warn('[ALX] typeText() вызван повторно для уже печатающегося элемента — игнорируется');
    return;
  }
  activeTypingElements.add(el);
  typeLog('TYPE START', JSON.stringify(text));

  try {
    el.replaceChildren();
    const spans = [];

    function makeCharSpan(ch) {
      const span = document.createElement('span');
      span.className = 'ch';
      span.textContent = ch;
      span.style.whiteSpace = 'pre';
      return span;
    }

    const tokens = text.split(/(\s+|-)/).filter((t) => t.length > 0);
    const wordFrag = document.createDocumentFragment();
    tokens.forEach((token) => {
      if (/^(\s+|-)$/.test(token)) {
        for (const ch of token) {
          const s = makeCharSpan(ch);
          wordFrag.appendChild(s);
          spans.push(s);
        }
      } else {
        const wordWrap = document.createElement('span');
        wordWrap.style.display = 'inline-block';
        wordWrap.style.whiteSpace = 'nowrap';
        for (const ch of token) {
          const s = makeCharSpan(ch);
          wordWrap.appendChild(s);
          spans.push(s);
        }
        wordFrag.appendChild(wordWrap);
      }
    });
    el.appendChild(wordFrag);

    // каждая итерация сама проверяет отмену — если сцену прервали,
    // печать останавливается немедленно и Promise корректно отклоняется
    for (const span of spans) {
      if (signal && signal.aborted) throw new DOMException('Отменено', 'AbortError');
      span.classList.add('show');
      await sleep(30, signal);
    }
    await sleep(180, signal);
    typeLog('TYPE COMPLETE');
  } catch (err) {
    typeLog('TYPE ABORT');
    throw err;
  } finally {
    activeTypingElements.delete(el);
  }
}

// ---------------------------------------------------------------
// Дым — лёгкие поднимающиеся сгустки света внутри шара во время «раздумья»
// ---------------------------------------------------------------
export function spawnSmoke(containerEl, count = 5) {
  containerEl.innerHTML = '';
  const puffs = [];
  for (let i = 0; i < count; i++) {
    const puff = document.createElement('div');
    puff.className = 'smoke-puff';
    const size = 24 + Math.random() * 26;
    puff.style.width = size + 'px';
    puff.style.height = size + 'px';
    puff.style.left = (20 + Math.random() * 60) + '%';
    puff.style.top = (55 + Math.random() * 25) + '%';
    puff.style.animationDelay = (Math.random() * 1.4) + 's';
    puff.style.animationDuration = (1.8 + Math.random() * 1) + 's';
    containerEl.appendChild(puff);
    puffs.push(puff);
  }
  return () => { containerEl.innerHTML = ''; };
}

// ---------------------------------------------------------------
// Фоновые частицы (золотая пыль)
// ---------------------------------------------------------------
export function spawnMotes(containerEl, count = 22) {
  const colors = ['var(--gold-soft)', 'var(--gold)'];
  for (let i = 0; i < count; i++) {
    const m = document.createElement('div');
    m.className = 'mote';
    const size = 2 + Math.random() * 3;
    m.style.width = size + 'px';
    m.style.height = size + 'px';
    m.style.left = Math.random() * 100 + '%';
    m.style.top = 10 + Math.random() * 80 + '%';
    m.style.background = colors[i % 2];
    m.style.animationDuration = (6 + Math.random() * 8) + 's';
    m.style.animationDelay = (Math.random() * 6) + 's';
    containerEl.appendChild(m);
  }
}
