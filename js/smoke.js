function startSmokeVideos() {
  const videos = document.querySelectorAll('.ambient-smoke-video, .orb-smoke-front-video');

  videos.forEach((video) => {
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');

    const attempt = video.play();
    if (attempt && typeof attempt.catch === 'function') {
      attempt.catch(() => {});
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startSmokeVideos, { once: true });
} else {
  startSmokeVideos();
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) startSmokeVideos();
});

window.addEventListener('pageshow', startSmokeVideos);
window.addEventListener('pointerdown', startSmokeVideos, { passive: true });
window.addEventListener('touchstart', startSmokeVideos, { passive: true });
