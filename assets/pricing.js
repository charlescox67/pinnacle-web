/* Pinnacle — pricing page interactions
 * SECURITY: no inline handlers, no innerHTML, no globals.
 */
(function () {
  'use strict';

  const PERIODS = new Set(['monthly', 'yearly']);

  function setBilling(period) {
    if (!PERIODS.has(period)) return;
    const toggle = document.querySelector('[data-billing-toggle]');
    if (!toggle) return;
    toggle.querySelectorAll('button').forEach(b => {
      b.classList.toggle('on', b.dataset.period === period);
    });
    document.querySelectorAll('[data-monthly][data-yearly]').forEach(node => {
      const raw = period === 'yearly' ? node.dataset.yearly : node.dataset.monthly;
      const n = parseFloat(raw);
      node.textContent = Number.isFinite(n) ? `$${n.toFixed(2)}` : '$—';
    });
  }

  function init() {
    const toggle = document.querySelector('[data-billing-toggle]');
    if (toggle) {
      toggle.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-period]');
        if (!btn || !toggle.contains(btn)) return;
        setBilling(btn.dataset.period);
      });
    }

    const faq = document.querySelector('[data-faq-list]');
    if (faq) {
      faq.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-faq-toggle]');
        if (!btn || !faq.contains(btn)) return;
        const item = btn.closest('.faq-item');
        if (!item) return;
        const open = item.classList.toggle('open');
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
