// Hide the header while scrolling down, reveal it immediately on any
// upward scroll (even a single pixel) — and always keep it fully visible
// at the very top of the page. Pairs with the `header` transform/transition
// and `.nav-hidden` class in css/style.css.
(function () {
  const header = document.querySelector('header');
  if (!header) return;

  let lastY = window.scrollY;
  let ticking = false;

  function update() {
    const y = window.scrollY;

    if (y <= 4) {
      // At the top — nothing to hide from, always show it fully.
      header.classList.remove('nav-hidden');
    } else if (y < lastY) {
      // Scrolling up, by any amount — reveal immediately.
      header.classList.remove('nav-hidden');
    } else if (y > lastY) {
      // Scrolling down — hide it out of the way.
      header.classList.add('nav-hidden');
    }

    lastY = y;
    ticking = false;
  }

  window.addEventListener('scroll', function () {
    if (!ticking) {
      window.requestAnimationFrame(update);
      ticking = true;
    }
  }, { passive: true });
})();
