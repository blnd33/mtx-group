/* =====================================================================
   MTX GROUP — Store registry & tenant switching

   The suite runs two completely independent shops from one install.
   Everything a shop owns — products, sales, staff accounts, customers,
   suppliers, expenses, reports, settings — lives in its OWN IndexedDB
   database, so nothing ever leaks between them. Switching store closes
   the current database handle and opens the other one.

   To add a third shop later: append an entry here and drop its logo in
   /assets. Nothing else in the codebase needs to change.
   ===================================================================== */
const STORES = [
  {
    id: 'melora',
    db: 'mtx_melora',
    name: 'Melora',
    legal: 'Melora',
    tagline: 'Beauty & Cosmetics',
    blurb: 'Skincare, fragrance and colour — the full Melora catalogue.',
    logo: 'assets/melora-logo.png',
    icon: 'assets/melora-icon-512.png',
    /* Sign-in screen copy. Written for this shop's trade — the second half of
       `title` carries the accent colour. Every claim below maps to a module
       that actually exists. */
    hero: {
      title: ['Every shade, bottle and brush —', 'counted, priced and sold.'],
      points: [
        ['🧴', 'Skincare, makeup and fragrance in one catalogue'],
        ['🏷', 'Barcode checkout built for a busy counter'],
        ['💗', 'Customer accounts, loyalty points and balances'],
        ['📈', 'Daily takings, profit and low-stock alerts']
      ]
    },
    /* Accent palette lifted from the Melora identity (plum + petal pink) */
    theme: {
      '--primary': '#7A2E58',
      '--primary-2': '#A24377',
      '--primary-soft': '#FBF0F5',
      '--accent': '#E8A5C4',
      '--on-primary': '#FFFFFF',
      '--brand-grad': 'linear-gradient(120deg, #5E2144 0%, #7A2E58 45%, #C77BA1 100%)',
      '--brand-glow': 'rgba(122,46,88,.42)',
      '--ring': '0 0 0 3px rgba(122,46,88,.20)'
    },
    themeDark: {
      '--primary': '#C77BA1',
      '--primary-2': '#E8A5C4',
      '--primary-soft': '#2A1420',
      '--on-primary': '#2A0F1E'
    }
  },
  {
    id: 'bangeen',
    db: 'mtx_bangeen',
    name: 'Bangeen Crystal',
    legal: 'Bangeen Crystal',
    tagline: 'Crystal & Glassware',
    blurb: 'Crystal, glassware and giftware — the Bangeen showroom.',
    logo: 'assets/bangeen-logo.jpg',
    icon: 'assets/bangeen-logo.jpg',
    hero: {
      title: ['Chandeliers, stemware and gifts —', 'every piece accounted for.'],
      points: [
        ['💎', 'Chandeliers, glassware and giftware in one catalogue'],
        ['🏷', 'Retail and wholesale prices on the same product'],
        ['🧾', 'Accounts for showroom buyers and trade customers'],
        ['📈', 'Daily takings, profit and low-stock alerts']
      ]
    },
    /* Accent palette lifted from the Bangeen identity (antique gold) */
    theme: {
      '--primary': '#A87D2E',
      '--primary-2': '#C7A052',
      '--primary-soft': '#FBF5E9',
      '--accent': '#DCBE7A',
      '--on-primary': '#FFFFFF',
      '--brand-grad': 'linear-gradient(120deg, #7C5A18 0%, #A87D2E 45%, #DCBE7A 100%)',
      '--brand-glow': 'rgba(168,125,46,.42)',
      '--ring': '0 0 0 3px rgba(168,125,46,.22)'
    },
    themeDark: {
      '--primary': '#D3AE60',
      '--primary-2': '#DCBE7A',
      '--primary-soft': '#241D0E',
      '--on-primary': '#221A08'
    }
  }
];

const Tenant = (() => {
  const KEY = 'mtx.store';
  let current = null;

  const api = {
    list: () => STORES,
    find: (id) => STORES.find((s) => s.id === id) || null,

    /* The shop the app is currently signed into (null on the picker screen). */
    get: () => current,
    get id() { return current ? current.id : null; },
    dbName: () => (current ? current.db : 'mtx_none'),

    /* Remembered across reloads so a refresh doesn't kick you back to the
       picker mid-shift. Cleared by "Switch store". */
    remembered() {
      try { return api.find(localStorage.getItem(KEY)); } catch (e) { return null; }
    },

    /* Deep link by subdomain: melora.mtx-group.net / bangeen.mtx-group.net
       (or melora.localhost etc. in dev) drop straight into that store's own
       sign-in screen instead of the two-store picker. Any other hostname —
       the bare domain, "localhost", an IP, the packaged desktop app — falls
       through to the normal picker with both stores. */
    hostStore() {
      try {
        const first = location.hostname.split('.')[0].toLowerCase();
        return STORES.some((s) => s.id === first) ? first : null;
      } catch (e) { return null; }
    },

    async set(id) {
      const s = api.find(id);
      if (!s) throw new Error('Unknown store: ' + id);
      if (current && current.id === s.id) return s;
      DB.close();                 // drop the previous shop's handle
      if (window.Store) Store.bust();
      current = s;
      try { localStorage.setItem(KEY, s.id); } catch (e) { /* private mode */ }
      document.documentElement.setAttribute('data-store', s.id);
      api.paint();
      return s;
    },

    clear() {
      DB.close();
      if (window.Store) Store.bust();
      current = null;
      try { localStorage.removeItem(KEY); } catch (e) { /* private mode */ }
      document.documentElement.removeAttribute('data-store');
      api.paint();
    },

    /* Push the active shop's accent palette onto :root as inline custom
       properties. Because every component already reads --primary and
       friends, the whole UI re-tints itself with no per-store CSS. */
    paint() {
      const root = document.documentElement;
      const dark = root.getAttribute('data-theme') === 'dark';
      const keys = new Set();
      STORES.forEach((s) => {
        Object.keys(s.theme).forEach((k) => keys.add(k));
        Object.keys(s.themeDark).forEach((k) => keys.add(k));
      });
      keys.forEach((k) => root.style.removeProperty(k));
      if (!current) return;
      const vars = { ...current.theme, ...(dark ? current.themeDark : {}) };
      Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
    }
  };
  return api;
})();

window.STORES = STORES;
window.Tenant = Tenant;
