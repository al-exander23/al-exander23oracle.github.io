// v2.0 visual shell helper.
// Keeps the existing single orb click entry point as the only scene trigger.
const nextMixBtn = document.getElementById('nextMixBtn');
const orbWrap = document.getElementById('orbWrap');

if (nextMixBtn && orbWrap) {
  nextMixBtn.addEventListener('click', () => {
    orbWrap.click();
  });
}
