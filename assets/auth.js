/* Pinnacle — auth client
 * SECURITY
 *  - Same-origin fetch with credentials:'include' so HttpOnly session cookie sticks.
 *  - Server returns generic errors; we display generic text — no enumeration leak from UI.
 *  - No tokens stored in JS / localStorage / sessionStorage. Sessions live in HttpOnly cookies.
 *  - Form action attribute matches fetch URL — if JS fails, native form post still goes to same origin.
 *  - Submit button disabled during request to prevent double-submits.
 */
(function () {
  'use strict';

  function trim(s) { return typeof s === 'string' ? s.trim() : ''; }

  async function postJson(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    let data = null;
    try { data = await res.json(); } catch { /* ignore */ }
    return { ok: res.ok, status: res.status, data };
  }

  function bind(formId, endpoint) {
    const form = document.getElementById(formId);
    if (!form) return;
    const msg = form.querySelector('[data-form-msg]');
    const submit = form.querySelector('button[type="submit"]');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (msg) msg.textContent = '';

      const fd = new FormData(form);
      const email = trim(fd.get('email')).toLowerCase();
      const password = String(fd.get('password') || '');

      if (!email || !email.includes('@') || password.length < 12) {
        if (msg) msg.textContent = 'Please enter a valid email and a 12+ character password.';
        return;
      }

      submit.disabled = true;
      submit.dataset.label = submit.dataset.label || submit.textContent;
      submit.textContent = 'Working…';

      try {
        const { ok, status, data } = await postJson(endpoint, { email, password });
        if (ok) {
          location.assign('terminal/index.html');
          return;
        }
        if (status === 429) {
          if (msg) msg.textContent = 'Too many attempts — please wait a moment.';
        } else if (status === 409 && (data?.error === 'email_taken')) {
          if (msg) msg.textContent = 'Could not create account. Please try again.';
        } else if (status === 400 && data?.error === 'weak_password') {
          if (msg) msg.textContent = 'Password must be at least 12 characters and contain letters and numbers.';
        } else {
          if (msg) msg.textContent = 'Sign-in failed. Please check your details and try again.';
        }
      } catch {
        if (msg) msg.textContent = 'Network error. Please retry.';
      } finally {
        submit.disabled = false;
        submit.textContent = submit.dataset.label;
      }
    });
  }

  function init() {
    bind('login-form',  '/api/auth/login');
    bind('signup-form', '/api/auth/signup');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
