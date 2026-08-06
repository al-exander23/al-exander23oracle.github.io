// mixes.js — единственное место в приложении, которое знает про
// data/mixes.json. Всё остальное работает через getMixes()/getMixById()
// и не заботится о том, как и откуда данные на самом деле загружены.

let cache = null;
let loadPromise = null;

async function loadMixes() {
  const res = await fetch('data/mixes.json', { cache: 'force-cache' });
  if (!res.ok) throw new Error('Не удалось загрузить data/mixes.json: ' + res.status);
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('data/mixes.json пуст или повреждён');
  }
  return data;
}

export function initMixes() {
  if (!loadPromise) {
    loadPromise = loadMixes()
      .then((data) => { cache = data; return cache; })
      .catch((err) => {
        console.error('[mixes.js]', err);
        cache = [];
        return cache;
      });
  }
  return loadPromise;
}

export function getMixes() {
  return cache || [];
}

export function getMixById(id) {
  return getMixes().find((m) => m.id === id) || null;
}
