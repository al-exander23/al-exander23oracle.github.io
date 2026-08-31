// В самом верху файла заменить:
// import { addToHistory } from './profile.js';
import { saveToHistory } from './storage.js';

// ... (остальной код без изменений) ...

// В функции stageResult (примерно 242 строка) заменить:
// addToHistory(mix.id);
function stageResult(mix) {
  renderCard(els.mixCardEl, mix);
  els.onResult(mix);
  saveToHistory(mix); 
}