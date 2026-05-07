/* Pinnacle — shared chrome (nav + footer)
 * SECURITY
 *  - No innerHTML; createElement + textContent only.
 *  - Active route is allowlisted; pathname never reflected to DOM.
 *  - rel=noopener noreferrer on every dynamic anchor.
 *  - IIFE — no global leakage.
 */
(function () {
  'use strict';

  const ROUTES = Object.freeze({
    'index.html':    'home',
    '':              'home',
    'product.html':  'product',
    'features.html': 'features',
    'pricing.html':  'pricing',
    'about.html':    'about',
    'docs.html':     'docs',
    'contact.html':  'contact',
    'login.html':    'login',
    'signup.html':   'signup',
    'legal.html':    'legal',
  });

  function currentKey() {
    const raw = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    const clean = raw.replace(/[?#].*$/, '');
    return ROUTES[clean] || 'home';
  }

  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null) continue;
        if (k === 'class')      node.className = String(v);
        else if (k === 'text')  node.textContent = String(v);
        else                    node.setAttribute(k, String(v));
      }
    }
    for (const c of children) {
      if (c == null || c === false) continue;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
  }

  function link(href, text, opts = {}) {
    return el('a', {
      href,
      class: opts.class || null,
      'data-route': opts.routeKey || null,
      rel: 'noopener noreferrer',
    }, text);
  }

  function brand() {
    return el('a', { href: 'index.html', class: 'brand', rel: 'noopener noreferrer' },
      el('span', { class: 'brand-mark' }),
      el('span', { text: 'PINNACLE' })
    );
  }

  function buildNav(activeKey) {
    const items = [
      ['product.html',  'Product',  'product'],
      ['features.html', 'Features', 'features'],
      ['pricing.html',  'Pricing',  'pricing'],
      ['about.html',    'About',    'about'],
      ['docs.html',     'Docs',     'docs'],
    ].map(([href, label, key]) => {
      const a = link(href, label, { routeKey: key });
      if (key === activeKey) a.classList.add('active');
      return a;
    });

    return el('nav', { class: 'nav' },
      el('div', { class: 'container nav-inner' },
        brand(),
        el('div', { class: 'nav-links' }, ...items),
        el('div', { class: 'row', style: 'gap:12px' },
          link('login.html', 'Sign in', { class: 'btn btn-link' }),
          link('terminal/index.html', 'Open Terminal', { class: 'btn btn-primary' })
        )
      )
    );
  }

  function buildFooter() {
    const col = (heading, items) => el('div', null,
      el('h5', { text: heading }),
      el('ul', null, ...items.map(([h, l]) => el('li', null, link(h, l))))
    );

    const tagline = el('p', {
      style: 'color:var(--fg-dim); font-size:14px; max-width:340px; margin-top:14px',
      text: 'Sports analytics intelligence. Aggregate odds, surface edge, explain every pick. Pinnacle does not accept wagers.'
    });

    const liveStrip = el('div', { class: 'row', style: 'margin-top:20px; gap:8px' },
      el('span', { class: 'pulse-dot' }),
      el('span', {
        class: 'mono',
        style: 'font-size:11px; color:var(--fg-dim); text-transform:uppercase; letter-spacing:0.12em',
        text: 'Live · 15+ books · 142ms'
      })
    );

    return el('footer', { class: 'footer' },
      el('div', { class: 'container' },
        el('div', { class: 'footer-grid' },
          el('div', null, brand(), tagline, liveStrip),
          col('Product', [
            ['product.html', 'Overview'],
            ['features.html', 'Features'],
            ['pricing.html', 'Pricing'],
            ['terminal/index.html', 'Terminal'],
          ]),
          col('Company', [
            ['about.html', 'About'],
            ['about.html#careers', 'Careers'],
            ['contact.html', 'Contact'],
            ['docs.html#changelog', 'Changelog'],
          ]),
          col('Legal', [
            ['legal.html#terms', 'Terms'],
            ['legal.html#privacy', 'Privacy'],
            ['legal.html#responsible', 'Responsible Use'],
            ['legal.html#disclosure', 'Disclosures'],
          ]),
        ),
        el('div', { class: 'footer-bottom' },
          el('span', { text: '© 2026 Pinnacle Analytics, Inc.' }),
          el('span', { text: '21+ · No wagering. Data only.' })
        )
      )
    );
  }

  function mount() {
    const navMount = document.getElementById('site-nav');
    const footerMount = document.getElementById('site-footer');
    const active = currentKey();
    if (navMount)    navMount.replaceChildren(buildNav(active));
    if (footerMount) footerMount.replaceChildren(buildFooter());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }
})();
