// 1. В самом верху файла заменить:
// import { isFavorite, toggleFavorite, getFavorites, getHistory } from './profile.js';
import { isFavorite, toggleFavorite, getFavorites, getHistory } from './storage.js';

// ...

// 2. Внутри функции renderCard, в обработчике favBtn.addEventListener заменить:
// const nowFav = toggleFavorite(mix.id);
  favBtn.addEventListener('click', () => {
    const nowFav = toggleFavorite(mix);
    favBtn.classList.toggle('active', nowFav);
    // ... остальной код слушателя без изменений
  });

// ...

// 3. Полностью заменить функцию openSheet (в самом низу файла):
export function openSheet(kind) {
  const overlay = document.getElementById('sheetOverlay');
  const titleEl = document.getElementById('sheetTitle');
  const listEl = document.getElementById('sheetList');

  // storage.js возвращает массивы объектов миксов
  const mixes = kind === 'favorites' ? getFavorites() : getHistory();
  
  // Извлекаем уникальные ID для рендера через getMixById
  const uniqueIds = [...new Set(mixes.map((m) => m.id))];

  titleEl.firstChild.textContent = kind === 'favorites' ? 'Избранные миксы' : 'История';

  if (!uniqueIds.length) {
    listEl.innerHTML = `<div class="sheet-empty">${
      kind === 'favorites'
        ? 'Пока пусто. Нажми ♡ на карточке микса, чтобы сохранить его сюда.'
        : 'Пока пусто. Встряхни шар, и здесь появится история.'
    }</div>`;
  } else {
    listEl.innerHTML = uniqueIds
      .map((id) => getMixById(id))
      .filter(Boolean)
      .map(
        (m) => `
        <div class="sheet-item" data-id="${m.id}">
          <span class="sheet-item-name">${m.name}</span>
          ${kind === 'favorites' ? '<button class="sheet-item-remove" data-remove="' + m.id + '">Убрать</button>' : ''}
        </div>`
      )
      .join('');

    if (kind === 'favorites') {
      listEl.querySelectorAll('[data-remove]').forEach((btn) => {
        btn.addEventListener('click', () => {
          // Передаем полный объект для корректного удаления в storage.js
          toggleFavorite(getMixById(btn.getAttribute('data-remove')));
          openSheet('favorites');
        });
      });
    }
  }

  overlay.classList.add('show');
}