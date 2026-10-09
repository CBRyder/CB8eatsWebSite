// Adds a "Dev" tab to the top menu, but only on a browser where the owner (or
// another dev) has signed in. Public visitors never see it: with no sign-in
// remembered this script does nothing at all (no Firebase download, no extra
// request).
//
// How it knows: the pages that already have a sign-in (dev.html, tracker.html,
// coa-tracker.html, apply.html, coa-bug-report.html) call
//   window.cb8Members.setUser(user)
// from their own onAuthStateChanged handler. That works out the role
// ('owner', 'dev' or none), remembers it in localStorage, and shows or hides
// the tab. Every other page just reads that remembered role when it loads.
//
// This only controls whether the LINK is shown. It is not security: /dev.html
// can still be opened by anyone who types the address, and what it can change
// is decided by the Firestore rules, never by this file. The remembered role
// holds no email address, only the word 'owner' or 'dev'.
(function () {
  const OWNER = 'cbleo73@gmail.com';
  // Other devs who should see the Dev tab. Lowercase email addresses, and they
  // need their own Firebase email/password account (Firebase console ->
  // Authentication -> Users). Adding one here does NOT let them write anything:
  // writes are still decided by the Firestore rules.
  const DEVS = [];
  const KEY = 'cb8eats-viewer-v1';
  const DEV_HREF = 'dev.html';

  function roleFor(user) {
    const email = user && user.email ? String(user.email).toLowerCase() : '';
    if (!email) return null;
    if (email === OWNER) return 'owner';
    return DEVS.indexOf(email) !== -1 ? 'dev' : null;
  }

  function readRole() {
    try {
      const v = localStorage.getItem(KEY);
      return v === 'owner' || v === 'dev' ? v : null;
    } catch (e) { return null; }
  }

  function writeRole(role) {
    try {
      if (role) localStorage.setItem(KEY, role); else localStorage.removeItem(KEY);
    } catch (e) { /* private mode etc.: the tab just will not persist */ }
  }

  function render(role) {
    const ul = document.querySelector('header .nav-tabs');
    if (!ul) return;
    const mine = ul.querySelector('li[data-members-tab]');
    if (!role) { if (mine) mine.remove(); return; }
    // Already there? The dev pages carry their own link to the hub.
    if (mine || ul.querySelector('[data-dev-tab], a[href="' + DEV_HREF + '"]')) return;
    const li = document.createElement('li');
    li.setAttribute('data-members-tab', '');
    const a = document.createElement('a');
    a.href = DEV_HREF;
    a.textContent = 'Dev';
    li.appendChild(a);
    ul.appendChild(li);
  }

  function setUser(user) {
    const role = roleFor(user);
    writeRole(role);
    render(role);
    return role;
  }

  window.cb8Members = { setUser: setUser, roleFor: roleFor, getRole: readRole };

  render(readRole());

  // Signed in or out in another tab of this browser: follow along.
  window.addEventListener('storage', function (ev) {
    if (ev.key === KEY) render(readRole());
  });
})();
