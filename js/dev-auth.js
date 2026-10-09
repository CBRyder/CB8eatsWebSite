// The one sign-in for the dev pages: a "Sign in" button at the very top right
// of the header (Dev hub, both trackers, Warframe). It opens a small dialog for
// email and password, and once signed in it turns into "Signed in" with a
// green dot; tapping it then offers Sign out.
//
// It uses the same Firebase default app as the page's own code, so the page's
// onAuthStateChanged handler hears about every sign-in and sign-out without
// this file having to talk to it. Who may WRITE is still decided only by the
// Firestore rules, never by this file.
//
// Each time the signed-in state changes it also tells js/members-nav.js, which
// is what makes the "Dev" tab appear in the main site's menu on this browser.
//
// Load order: js/members-nav.js first, then this (both plain `defer` scripts).
(function () {
  var CFG = {
    apiKey: "AIzaSyDSWXJrKwLTwsW6Caadl2m1BPDwOH5ROiU",
    authDomain: "tarborolifebackend.firebaseapp.com",
    projectId: "tarborolifebackend",
    storageBucket: "tarborolifebackend.firebasestorage.app",
    messagingSenderId: "578368600107",
    appId: "1:578368600107:web:e8ce50f4c4ab2839c4126e"
  };
  var BASE = 'https://www.gstatic.com/firebasejs/10.7.1/';

  var header = document.querySelector('header');
  var nav = header && header.querySelector('nav');
  if (!header || !nav) return;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  var members = window.cb8Members || null;

  /* ---------- the button, at the right end of the header ---------- */
  var group = el('div', 'cb8-header-right');
  nav.parentNode.insertBefore(group, nav);
  group.appendChild(nav);

  var btn = el('button', 'cb8-auth-btn');
  btn.type = 'button';
  btn.id = 'cb8-auth-btn';
  var remembered = members && members.getRole ? members.getRole() : null;   // avoids a flash of "Sign in"
  function paintButton(signedIn) {
    btn.textContent = signedIn ? 'Signed in' : 'Sign in';
    btn.classList.toggle('on', !!signedIn);
    btn.setAttribute('aria-label', signedIn ? 'Signed in. Open account' : 'Sign in');
  }
  paintButton(!!remembered);
  group.appendChild(btn);

  /* ---------- the dialog ---------- */
  var dlg = el('dialog', 'cb8-auth-dlg');
  dlg.setAttribute('aria-labelledby', 'cb8-auth-title');

  var form = document.createElement('form');
  form.id = 'cb8-auth-form';
  var title = el('h2', null, 'Sign in'); title.id = 'cb8-auth-title';
  form.appendChild(title);
  form.appendChild(el('p', null, 'For the site owner and devs. Everyone else can look around without signing in.'));

  function field(label, type, id, autocomplete) {
    var lab = el('label', 'cb8-field');
    lab.appendChild(el('span', null, label));
    var inp = document.createElement('input');
    inp.type = type; inp.id = id; inp.required = true;
    inp.setAttribute('autocomplete', autocomplete);
    lab.appendChild(inp);
    form.appendChild(lab);
    return inp;
  }
  var email = field('Email', 'email', 'cb8-email', 'username');
  var pass = field('Password', 'password', 'cb8-password', 'current-password');
  var err = el('p', 'cb8-err'); err.setAttribute('role', 'alert');
  form.appendChild(err);
  var btns = el('div', 'cb8-btns');
  var cancel = el('button', 'cb8-btn', 'Cancel'); cancel.type = 'button';
  var submit = el('button', 'cb8-btn primary', 'Sign in'); submit.type = 'submit';
  btns.appendChild(cancel); btns.appendChild(submit);
  form.appendChild(btns);
  dlg.appendChild(form);

  var acct = el('div'); acct.id = 'cb8-auth-acct'; acct.hidden = true;
  acct.appendChild(el('h2', null, 'Signed in'));
  var who = el('p'); who.id = 'cb8-auth-who';
  var what = el('p'); what.id = 'cb8-auth-role';
  acct.appendChild(who); acct.appendChild(what);
  var abtns = el('div', 'cb8-btns');
  var close = el('button', 'cb8-btn', 'Close'); close.type = 'button';
  var out = el('button', 'cb8-btn primary', 'Sign out'); out.type = 'button'; out.id = 'cb8-signout';
  abtns.appendChild(close); abtns.appendChild(out);
  acct.appendChild(abtns);
  dlg.appendChild(acct);
  document.body.appendChild(dlg);

  var state = { user: null, ready: false };

  function show(which) {
    form.hidden = which !== 'form';
    acct.hidden = which !== 'acct';
  }
  function openDlg() {
    err.textContent = '';
    if (state.user) {
      who.textContent = 'Signed in as ' + state.user.email + '.';
      var role = members ? members.roleFor(state.user) : null;
      what.textContent = role === 'owner' ? 'You are the owner: you can change anything on the dev pages.'
        : role === 'dev' ? 'You are on the dev list: you can use the Dev hub and trackers. Only the owner can change things.'
        : 'This account is not on the dev list, so the Dev tab stays hidden.';
      show('acct');
    } else {
      show('form');
    }
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    if (!state.user) email.focus();
  }
  function closeDlg() {
    if (typeof dlg.close === 'function') dlg.close(); else dlg.removeAttribute('open');
  }
  btn.addEventListener('click', openDlg);
  cancel.addEventListener('click', closeDlg);
  close.addEventListener('click', closeDlg);

  /* ---------- Firebase (loads on every dev page, they all use it anyway) ---------- */
  var loading = null;
  function load() {
    if (loading) return loading;
    loading = Promise.all([import(BASE + 'firebase-app.js'), import(BASE + 'firebase-auth.js')]).then(function (m) {
      var fa = m[0], au = m[1];
      var app = fa.getApps().length ? fa.getApp() : fa.initializeApp(CFG);
      var auth = au.getAuth(app);
      au.onAuthStateChanged(auth, onUser);
      return { auth: auth, signIn: au.signInWithEmailAndPassword, signOut: au.signOut };
    });
    loading.catch(function (e) { console.error('Firebase failed to load:', e); });
    return loading;
  }

  function onUser(user) {
    state.user = user;
    state.ready = true;
    if (members) members.setUser(user);
    paintButton(!!user);
    if (user && dlg.open && !form.hidden) closeDlg();   // just signed in
  }

  function friendly(e) {
    var c = (e && e.code) || '';
    if (c === 'auth/invalid-credential' || c === 'auth/wrong-password' || c === 'auth/user-not-found' || c === 'auth/invalid-email') return 'That email or password is not right.';
    if (c === 'auth/too-many-requests') return 'Too many tries. Wait a few minutes and try again.';
    if (c === 'auth/network-request-failed') return 'No connection. Check your internet and try again.';
    if (c === 'auth/user-disabled') return 'That account is turned off.';
    return 'Sign-in failed' + (c ? ' (' + c + ')' : '') + '.';
  }

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    err.textContent = '';
    submit.disabled = true;
    submit.textContent = 'Signing in…';
    load().then(function (a) {
      return a.signIn(a.auth, email.value.trim(), pass.value);
    }).then(function () {
      pass.value = '';
    }).catch(function (e) {
      // A mistyped password is not a bug worth a console error.
      if (!(e && /^auth\/(invalid-credential|wrong-password|user-not-found|invalid-email)$/.test(e.code))) console.error('Sign-in failed:', e);
      err.textContent = loading && !state.ready && !(e && e.code) ? 'Could not load the sign-in service. Check your connection and reload.' : friendly(e);
    }).then(function () {
      submit.disabled = false;
      submit.textContent = 'Sign in';
    });
  });

  out.addEventListener('click', function () {
    load().then(function (a) { return a.signOut(a.auth); }).then(closeDlg).catch(function (e) {
      console.error('Sign-out failed:', e);
    });
  });

  load();
})();
