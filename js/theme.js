/**
 * EBSU Smart Identity Platform — Theme Manager (js/theme.js)
 *
 * Implements 3-choice cycling: System (default) -> Light -> Dark -> System
 * Safe localStorage persistence, zero flash on reload, SVG icons, and
 * automatic Turnstile / meta-theme synchronization.
 */

(function () {
  'use strict';

  var THEMES = ['system', 'light', 'dark'];
  var listeners = [];

  // Plain SVG Line Icons (No emoji, fully accessible)
  var SVG_ICONS = {
    sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"></path></svg>',
    moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>',
    monitor: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>'
  };

  function getSavedPreference() {
    try {
      var saved = localStorage.getItem('theme');
      if (saved && THEMES.indexOf(saved) !== -1) {
        return saved;
      }
    } catch (e) {
      // LocalStorage blocked (private mode/sandboxed iframe)
    }
    return 'system';
  }

  function savePreference(val) {
    try {
      localStorage.setItem('theme', val);
    } catch (e) {}
  }

  function getSystemScheme() {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  }

  function resolveTheme(pref) {
    return pref === 'system' ? getSystemScheme() : pref;
  }

  function updateMetaThemeColor(resolved) {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', '#0B2B26');
  }

  function updateAllToggleButtons(pref, resolved) {
    var buttons = document.querySelectorAll('.theme-toggle-btn');
    buttons.forEach(function (btn) {
      var iconSvg = pref === 'system' ? SVG_ICONS.monitor : (pref === 'dark' ? SVG_ICONS.moon : SVG_ICONS.sun);
      var labelText = pref === 'system' ? 'System' : (pref === 'dark' ? 'Dark' : 'Light');
      var ariaDesc = 'Current theme: ' + labelText + ' (' + resolved + ' mode active). Click to cycle theme.';

      btn.setAttribute('aria-label', ariaDesc);
      btn.setAttribute('title', ariaDesc);
      btn.innerHTML = iconSvg + '<span class="theme-toggle-label" style="font-size:11px;">' + labelText + '</span>';
    });
  }

  var ThemeManager = {
    getPreference: function () {
      return getSavedPreference();
    },

    getResolvedTheme: function () {
      return resolveTheme(getSavedPreference());
    },

    setTheme: function (newPref, animate) {
      if (THEMES.indexOf(newPref) === -1) newPref = 'system';
      savePreference(newPref);

      var resolved = resolveTheme(newPref);

      if (animate !== false) {
        document.documentElement.classList.add('theme-transitioning');
      }

      document.documentElement.setAttribute('data-theme', resolved);
      document.documentElement.setAttribute('data-theme-preference', newPref);
      updateMetaThemeColor(resolved);
      updateAllToggleButtons(newPref, resolved);

      if (animate !== false) {
        setTimeout(function () {
          document.documentElement.classList.remove('theme-transitioning');
        }, 160);
      }

      listeners.forEach(function (fn) {
        try {
          fn({ preference: newPref, resolved: resolved });
        } catch (err) {
          console.warn('Theme listener error:', err);
        }
      });
    },

    cycle: function () {
      var current = getSavedPreference();
      var nextIdx = (THEMES.indexOf(current) + 1) % THEMES.length;
      this.setTheme(THEMES[nextIdx], true);
    },

    onThemeChange: function (fn) {
      if (typeof fn === 'function') {
        listeners.push(fn);
      }
    },

    init: function () {
      var pref = getSavedPreference();
      var resolved = resolveTheme(pref);

      document.documentElement.setAttribute('data-theme', resolved);
      document.documentElement.setAttribute('data-theme-preference', pref);
      updateMetaThemeColor(resolved);

      // Listen for OS theme changes when System is chosen
      if (window.matchMedia) {
        var mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        var onChange = function () {
          if (getSavedPreference() === 'system') {
            ThemeManager.setTheme('system', false);
          }
        };
        if (mediaQuery.addEventListener) {
          mediaQuery.addEventListener('change', onChange);
        } else if (mediaQuery.addListener) {
          mediaQuery.addListener(onChange);
        }
      }

      // Attach click listeners to all toggle buttons on DOM ready
      var attachButtons = function () {
        updateAllToggleButtons(pref, resolved);
        // A broken config.js must never stop the theme button from working.
        try { initDemoBanner(); } catch (err) { console.warn('Demo banner skipped:', err); }
        document.querySelectorAll('.theme-toggle-btn').forEach(function (btn) {
          if (!btn.dataset.themeBound) {
            btn.dataset.themeBound = 'true';
            btn.addEventListener('click', function (e) {
              e.preventDefault();
              ThemeManager.cycle();
            });
          }
        });
      };

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', attachButtons);
      } else {
        attachButtons();
      }
    }
  };

  // ── Permanent Demo Environment Banner ─────────────────────────────────────
  function initDemoBanner() {
    if (typeof window === 'undefined' || !window.location) return;
    var h = window.location.hostname;
    var isPrivate = (
      h === 'localhost' ||
      h === '127.0.0.1' ||
      h === '::1' ||
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(h) ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h) ||
      /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(h)
    );
    var cfg = (typeof EBSU_CONFIG !== 'undefined') ? EBSU_CONFIG : (typeof window !== 'undefined' ? window.EBSU_CONFIG : null);
    var isDemoMode = Boolean(cfg && cfg.DEMO_MODE === true);

    if (isPrivate && isDemoMode) {
      if (document.getElementById('ebsu-demo-env-banner')) return;
      var banner = document.createElement('div');
      banner.id = 'ebsu-demo-env-banner';
      // A small fixed badge: it never pushes or squeezes the page layout.
      banner.setAttribute('role', 'status');
      banner.style.cssText = 'position:fixed; right:12px; bottom:12px; z-index:9999999; background:#7A5200; color:#FFFFFF; font-family:"Source Sans 3",-apple-system,"Segoe UI",sans-serif; font-size:12px; font-weight:700; line-height:1.3; padding:6px 10px; border-radius:4px; box-shadow:0 2px 8px rgba(0,0,0,0.25); pointer-events:none; max-width:calc(100vw - 24px);';
      banner.textContent = 'Demo mode, this computer only';
      if (document.body) {
        document.body.insertBefore(banner, document.body.firstChild);
      }
    }
  }

  ThemeManager.init();
  window.ThemeManager = ThemeManager;
})();

