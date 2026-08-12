// mixes.js — единственное место в приложении, которое знает про
// data/mixes.json. Всё остальное работает через getMixes()/getMixById()
// и не заботится о том, как и откуда данные на самом деле загружены.

let cache = null;
let loadPromise = null;

// Версия дописывается в query — на GitHub Pages иначе можно словить
// закэшированную версию data/mixes.json после обновления файла.
// Бампать при каждом релизе, где меняются данные миксов.
const DATA_VERSION = '1.2.1';

// Собственный, независимый от сцен таймаут на саму загрузку: это общий
// кэшируемый ресурс приложения (initMixes() переиспользуется всеми
// будущими попытками, а не создаётся заново на каждую сцену), поэтому
// его нельзя обрывать через AbortSignal одной конкретной сцены — иначе
// одна нетерпеливая попытка сломает загрузку данных для всех остальных.
// Вместо этого — собственный жёсткий предел на саму сетевую операцию.
const FETCH_TIMEOUT = 6000;

async function loadMixes() {
  const abortCtrl = new AbortController();
  const timer = setTimeout(() => abortCtrl.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(`data/mixes.json?v=${DATA_VERSION}`, {
      cache: 'no-cache',
      signal: abortCtrl.signal,
    });
    if (!res.ok) throw new Error('Не удалось загрузить data/mixes.json: ' + res.status);
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('data/mixes.json пуст или повреждён');
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
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

export function hasMixes() {
  return getMixes().length > 0;
}

export function getMixById(id) {
  return getMixes().find((m) => m.id === id) || null;
}
