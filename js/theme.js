/* Shared theme for the dev pages (Dev hub, both trackers, Warframe).

   Four base colors in, every CSS variable the pages need out. Load it as a
   plain <script> in <head>, before the page paints, so there is no color flash.

   Where the colors are saved:
   - On this device, in localStorage (key below). Every dev page on the same
     address reads the same key, so a change on one page shows on all of them,
     and open tabs follow along live.
   - For the owner, also in Firestore (warframe/progress.theme). Any other
     device that has no theme of its own picks that one up, which is how the
     colors follow you from your PC to your phone. The editor on the hub and
     Warframe pages does the writing (it needs the owner's sign-in); this file
     only reads it, over the public REST address, so the trackers can follow
     the saved theme without loading the whole Firebase kit twice.

   The old Warframe page used this same localStorage key, so colors saved
   there carry over. */
(function () {
  var DEF = { forest: '#1f5f3a', royal: '#5b2d9e', neonGreen: '#39ff14', neonPurple: '#b44cff' };
  var KEY = 'cb8eats-warframe-theme-v1';
  var DOC = 'https://firestore.googleapis.com/v1/projects/tarborolifebackend/databases/(default)/documents/warframe/progress';
  var NAMES = [
    ['forest', 'Forest green', 'Page and card backgrounds'],
    ['royal', 'Royal purple', 'Borders and panel tint'],
    ['neonGreen', 'Neon green', 'Main accent, progress, checks'],
    ['neonPurple', 'Neon purple', 'Second accent, gradients, max-rank dots']
  ];
  var PRESETS = [
    { name: 'Forest and neon', t: { forest: '#1f5f3a', royal: '#5b2d9e', neonGreen: '#39ff14', neonPurple: '#b44cff' } },
    { name: 'Deep forest', t: { forest: '#14452c', royal: '#3d2478', neonGreen: '#2fe06a', neonPurple: '#9a5cf0' } },
    { name: 'Max neon', t: { forest: '#0d4a2a', royal: '#6a1fd6', neonGreen: '#00ff66', neonPurple: '#e040ff' } }
  ];

  function isHex(h) { return typeof h === 'string' && /^#[0-9a-f]{6}$/i.test(h); }
  function rgb(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
  function toHex(a) {
    return '#' + a.map(function (v) {
      v = Math.max(0, Math.min(255, Math.round(v)));
      return (v < 16 ? '0' : '') + v.toString(16);
    }).join('');
  }
  function mix(a, b, t) {
    var x = rgb(a), y = rgb(b);
    return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
  }
  function lum(h) {
    var c = rgb(h).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function rgba(h, a) { var c = rgb(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function dark(h) { return lum(h) <= 0.35; }

  function derive(t) {
    var k = '#000000';
    var bg = mix(t.forest, k, 0.80);
    var bgAlt = mix(t.forest, k, 0.72);
    var border = mix(mix(t.royal, t.forest, 0.2), k, 0.30);
    return {
      '--bg': bg,
      '--bg-alt': bgAlt,
      '--card': mix(mix(t.forest, t.royal, 0.22), k, 0.62),
      '--card-hover': mix(mix(t.forest, t.royal, 0.32), k, 0.52),
      '--border': border,
      '--border-soft': mix(border, bgAlt, 0.5),
      '--accent': t.neonGreen,
      '--accent-bright': mix(t.neonGreen, '#ffffff', 0.18),
      '--accent-dim': mix(t.neonGreen, bg, 0.5),
      '--accent-2': t.neonPurple,
      '--glow': rgba(t.neonGreen, 0.35),
      '--wash-a': rgba(t.neonPurple, 0.14),
      '--wash-b': rgba(t.neonGreen, 0.12),
      '--on-accent': dark(t.neonGreen) ? '#ffffff' : '#06100a',
      '--on-grad': (lum(t.neonGreen) + lum(t.neonPurple)) / 2 > 0.3 ? '#06100a' : '#ffffff'
    };
  }
  function sanitize(o) {
    var r = {};
    Object.keys(DEF).forEach(function (k) { r[k] = (o && isHex(o[k])) ? o[k].toLowerCase() : DEF[k]; });
    return r;
  }
  function apply(t) {
    var v = derive(sanitize(t)), s = document.documentElement.style;
    Object.keys(v).forEach(function (k) { s.setProperty(k, v[k]); });
  }
  function readLocal() {
    try { var raw = localStorage.getItem(KEY); return raw ? sanitize(JSON.parse(raw)) : null; } catch (e) { return null; }
  }
  function writeLocal(t) { try { localStorage.setItem(KEY, JSON.stringify(sanitize(t))); } catch (e) {} }
  function clearLocal() { try { localStorage.removeItem(KEY); } catch (e) {} }

  /* ---------- which theme is in force ---------- */
  var remote = null;          // the owner's saved theme, once we have seen it
  var listeners = [];
  var remoteReq = null;

  function current() { return readLocal() || remote || DEF; }
  function notify() {
    var t = current();
    listeners.forEach(function (fn) { try { fn(t); } catch (e) {} });
  }
  function refresh() { apply(current()); notify(); }
  function onChange(fn) { listeners.push(fn); }

  // Called when the saved copy shows up (REST fetch below, or a live Firestore
  // snapshot on pages that have the Firebase kit loaded anyway).
  function setRemote(t) {
    remote = t ? sanitize(t) : null;
    if (!readLocal()) refresh();
  }

  // Read the owner's saved theme from the public Firestore address.
  function loadRemote(force) {
    if (remoteReq && !force) return remoteReq;
    remoteReq = fetch(DOC, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        var f = j && j.fields && j.fields.theme && j.fields.theme.mapValue && j.fields.theme.mapValue.fields;
        if (!f) return null;
        var t = {}, any = false;
        Object.keys(DEF).forEach(function (k) {
          if (f[k] && typeof f[k].stringValue === 'string') { t[k] = f[k].stringValue; any = true; }
        });
        if (!any) return null;
        setRemote(t);
        return remote;
      })
      .catch(function () { return null; });
    return remoteReq;
  }

  /* ---------- the editor (used by the hub and the Warframe page) ---------- */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  // opts.canSave()  -> true when the owner is signed in
  // opts.save(t)    -> promise that writes the theme to Firestore
  // opts.onError(e) -> called when save() fails
  function mountEditor(box, opts) {
    opts = opts || {};
    var canSave = opts.canSave || function () { return false; };
    var save = opts.save || function () { return Promise.resolve(); };
    box.textContent = '';

    var card = el('div', 'wfcard');
    card.appendChild(el('h2', null, 'Theme'));
    card.appendChild(el('p', 'muted', 'Four colors drive every dev page: the hub, both trackers and Warframe. Dark surfaces come from forest green and royal purple, and the accents come from the two neons. Pick them once and they carry across all of them.'));

    var sw = el('div', 'swatches'), inputs = {};
    NAMES.forEach(function (n) {
      var lab = el('label', 'swatch');
      var inp = document.createElement('input');
      inp.type = 'color'; inp.id = 'c-' + n[0]; inp.setAttribute('aria-label', n[1]);
      var nm = el('span', 'nm', n[1]);
      nm.appendChild(el('span', 'hint', n[2]));
      lab.appendChild(inp); lab.appendChild(nm); sw.appendChild(lab);
      inputs[n[0]] = inp;
    });
    card.appendChild(sw);

    var row = el('div', 'btnrow'); row.id = 'wf-presets';
    var note = el('p', 'savednote'); note.id = 'wf-themenote'; note.setAttribute('aria-live', 'polite');

    function fromInputs() {
      return sanitize({
        forest: inputs.forest.value, royal: inputs.royal.value,
        neonGreen: inputs.neonGreen.value, neonPurple: inputs.neonPurple.value
      });
    }
    function fill(t) { Object.keys(inputs).forEach(function (k) { inputs[k].value = t[k]; }); }

    var timer = null;
    function changed(t) {
      apply(t); writeLocal(t);
      clearTimeout(timer);
      if (canSave()) {
        note.textContent = 'Saved on this device. Saving for your other devices…';
        timer = setTimeout(function () {
          Promise.resolve().then(function () { return save(t); }).then(
            function () { note.textContent = 'Saved on this device and for every device you use.'; },
            function (e) {
              note.textContent = 'Saved on this device. The copy for your other devices failed to save.';
              if (opts.onError) opts.onError(e);
            }
          );
        }, 700);
      } else {
        note.textContent = 'Saved on this device. Sign in as the owner (top right) to also save it for every device.';
      }
    }

    Object.keys(inputs).forEach(function (k) {
      inputs[k].addEventListener('input', function () { changed(fromInputs()); });
    });
    PRESETS.forEach(function (pr) {
      var b = el('button', 'btn-sm', pr.name); b.type = 'button';
      b.addEventListener('click', function () { var t = sanitize(pr.t); fill(t); changed(t); });
      row.appendChild(b);
    });
    var reset = el('button', 'btn-sm', 'Use the saved theme'); reset.type = 'button';
    reset.addEventListener('click', function () {
      clearLocal();
      refresh();
      fill(current());
      note.textContent = 'This device now follows the saved theme.';
      loadRemote(true);
    });
    row.appendChild(reset);
    card.appendChild(row);
    card.appendChild(note);
    box.appendChild(card);

    fill(current());
    // The saved copy arriving later, or another tab changing the colors.
    onChange(fill);
    return { fill: fill };
  }

  window.WFTheme = {
    DEF: DEF, sanitize: sanitize, apply: apply,
    readLocal: readLocal, writeLocal: writeLocal, clearLocal: clearLocal,
    current: current, setRemote: setRemote, loadRemote: loadRemote,
    onChange: onChange, mountEditor: mountEditor
  };

  apply(current());
  window.addEventListener('storage', function (ev) { if (ev.key === KEY) refresh(); });
  if (!readLocal()) loadRemote();
})();
