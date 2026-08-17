# Changelog

## Production recovery v2.0

Базой релиза является production commit `981c6078cf92e71ec70de05c6f4a0a369e75547d`. Текстовый путь PHRASE/REVEAL упрощён до plain DOM text, а запуск сцены защищён единым busy guard и аварийным watchdog. В production bundle отсутствуют диагностические панели, probe scripts, debug URL hooks и forensic snapshots.

Сохранены визуальный стиль Oracle, шар, дым, частицы, карточка, история, избранное и Telegram UX. Acceptance 10/10 на iPhone Telegram Mobile требует отдельной реальной проверки после публикации.
