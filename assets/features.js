/* Features page — scroll spy for category nav. No inline handlers. */
(function () {
  'use strict';
  function init() {
    const links = document.querySelectorAll('.cat-nav a');
    const sections = document.querySelectorAll('.cat');
    if (!links.length || !sections.length) return;

    let ticking = false;
    function update() {
      let cur = '';
      sections.forEach(s => {
        if (s.getBoundingClientRect().top < 200) cur = s.id;
      });
      links.forEach(l => {
        l.classList.toggle('active', l.getAttribute('href') === '#' + cur);
      });
      ticking = false;
    }
    window.addEventListener('scroll', () => {
      if (!ticking) { window.requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else { init(); }
})();
