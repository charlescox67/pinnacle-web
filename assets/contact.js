/* Pinnacle — contact form handler
 * SECURITY
 *  - Same-origin fetch with credentials:'include'.
 *  - Client-side validation is a UX convenience only; server enforces real rules.
 *  - No tokens stored anywhere. No globals. IIFE.
 */
(function () {
  'use strict';

  function trim(s) { return typeof s === 'string' ? s.trim() : ''; }

  function init() {
    const form = document.getElementById('contact-form');
    if (!form) return;

    const msgEl     = form.querySelector('[data-form-msg]');
    const successEl = form.querySelector('[data-form-success]');
    const submit    = form.querySelector('button[type="submit"]');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (msgEl)     msgEl.textContent = '';
      if (successEl) successEl.style.display = 'none';

      const fd      = new FormData(form);
      const name    = trim(fd.get('name'));
      const email   = trim(fd.get('email')).toLowerCase();
      const subject = trim(fd.get('subject'));
      const message = trim(fd.get('message'));

      if (!name) {
        if (msgEl) msgEl.textContent = 'Please enter your name.';
        return;
      }
      if (!email || !email.includes('@')) {
        if (msgEl) msgEl.textContent = 'Please enter a valid email address.';
        return;
      }
      if (message.length < 20) {
        if (msgEl) msgEl.textContent = 'Message must be at least 20 characters.';
        return;
      }

      submit.disabled = true;
      const label = submit.textContent;
      submit.textContent = 'Sending…';

      try {
        const res = await fetch('/api/contact', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, subject, message }),
        });

        if (res.ok) {
          form.reset();
          if (successEl) successEl.style.display = 'block';
        } else {
          const data = await res.json().catch(() => ({}));
          if (res.status === 429) {
            if (msgEl) msgEl.textContent = 'Too many messages — please wait a moment before trying again.';
          } else {
            if (msgEl) msgEl.textContent = data?.hint || 'Something went wrong. Please try again.';
          }
        }
      } catch {
        if (msgEl) msgEl.textContent = 'Network error. Please check your connection and retry.';
      } finally {
        submit.disabled = false;
        submit.textContent = label;
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
