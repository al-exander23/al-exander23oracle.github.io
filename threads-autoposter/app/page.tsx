export default function Home() {
  return (
    <main>
      <h1>ALX Threads Autoposter</h1>
      <p>Durable-планировщик публикаций для @alxoracle на официальном Threads API.</p>
      <ul>
        <li>каждый пост — отдельный Vercel Workflow;</li>
        <li>ожидание до времени публикации не расходует compute;</li>
        <li>перед публикацией проверяется правильный Threads-профиль;</li>
        <li>точное совпадение текста проверяется перед каждой попыткой — защита от дублей;</li>
        <li>429/5xx считаются временными ошибками и автоматически повторяются;</li>
        <li>возвращается Media ID, а Workflow run остаётся в Vercel Observability.</li>
      </ul>
      <p>API: <code>POST /api/schedule</code>, <code>POST /api/schedule/batch</code>, <code>GET /api/health</code>.</p>
    </main>
  );
}
