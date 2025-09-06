// Solarity reading progress
// - Tracks per-chapter scroll progress and saves to localStorage
// - Annotates index links with progress badges

(function () {
  const STORAGE_PREFIX = 'solarity_progress_chapter_';
  const OVERLAY_ID = 'solarity-fade-overlay';

  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

  function injectStyles() {
    if (document.getElementById('solarity-progress-styles')) return;
    const css = `
      .reading-progress-container{position:fixed;top:0;left:0;right:0;height:6px;background:rgba(255,255,255,0.08);z-index:99999}
      .reading-progress-bar{height:100%;width:0;background:linear-gradient(90deg,#6EA0FF,#00d1b2);box-shadow:0 0 10px rgba(0,209,178,0.4)}
      .reading-progress-label{position:fixed;top:10px;right:10px;background:rgba(0,0,0,0.55);color:#fff;padding:2px 8px;border-radius:10px;font-size:.8rem;z-index:99999;backdrop-filter:blur(4px)}
  /* Index: keep buttons same width and put a horizontal percent to the right */
  .chapter-link-row{display:flex;align-items:center;width:100%;gap:8px}
  .chapter-link-row > a{flex:0 0 auto}
  .chapter-progress-inline{display:inline-block;color:#fff;font-size:.85rem;opacity:.9}
    `;
    const style = document.createElement('style');
    style.id = 'solarity-progress-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function getChapterIdFromUrl() {
    try {
      const path = location.pathname.replace(/\\/g, '/');
      const match = path.match(/solarity_chapter(\d+)\.html$/i);
      return match ? match[1] : null;
    } catch { return null; }
  }

  function storageKey(chId){ return STORAGE_PREFIX + String(chId); }

  function saveProgress(chId, percent){
    if (!chId) return;
    const value = { p: Math.round(percent), ts: Date.now() };
    try { localStorage.setItem(storageKey(chId), JSON.stringify(value)); } catch {}
  }

  function readProgress(chId){
    if (!chId) return 0;
    try {
      const raw = localStorage.getItem(storageKey(chId));
      if (!raw) return 0;
      const obj = JSON.parse(raw);
      return typeof obj?.p === 'number' ? clamp(obj.p,0,100) : 0;
    } catch { return 0; }
  }

  function onChapterPage() {
    return !!document.querySelector('.chapter-container');
  }

  function mountChapterProgress() {
    injectStyles();
    const chId = getChapterIdFromUrl();
    if (!chId) return;

    // UI elements
    const container = document.createElement('div');
    container.className = 'reading-progress-container';
    const bar = document.createElement('div');
    bar.className = 'reading-progress-bar';
    container.appendChild(bar);
    document.body.appendChild(container);

    const label = document.createElement('div');
    label.className = 'reading-progress-label';
    document.body.appendChild(label);

    // init width from saved
    let current = readProgress(chId);
    bar.style.width = current + '%';
    label.textContent = current + '%';

    let raf = null;
    function computePercent(){
      const scrollEl = document.documentElement;
      const scrollTop = scrollEl.scrollTop || document.body.scrollTop || 0;
      const max = (scrollEl.scrollHeight - scrollEl.clientHeight);
      const pct = max > 0 ? (scrollTop / max) * 100 : 100;
      return clamp(pct, 0, 100);
    }

    function update(){
      raf = null;
      const pct = Math.round(computePercent());
      if (pct !== current){
        current = pct;
        bar.style.width = pct + '%';
        label.textContent = pct + '%';
        saveProgress(chId, pct);
      }
    }

    function schedule(){ if (!raf) raf = requestAnimationFrame(update); }

    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);

    // Try to restore previous scroll position if any
    try {
      const hasHash = !!location.hash;
      const nav = (performance.getEntriesByType && performance.getEntriesByType('navigation')) ? performance.getEntriesByType('navigation')[0] : null;
      const isBackForward = !!(nav && nav.type === 'back_forward');

      function tryRestoreOnce(pct){
        if (!pct || pct <= 1 || isBackForward || hasHash) return true; // do not override
        const scrollEl = document.documentElement;
        const max = (scrollEl.scrollHeight - scrollEl.clientHeight);
        if (max <= 0) return false; // try later when layout grows
        let target = Math.round((pct/100) * max);
        if (pct >= 99) target = max; // go to bottom for near-complete
        const curTop = scrollEl.scrollTop || document.body.scrollTop || 0;
        if (curTop > 10) return true; // user already scrolled or browser restored
        window.scrollTo(0, target);
        const newTop = scrollEl.scrollTop || document.body.scrollTop || 0;
        return Math.abs(newTop - target) < 4;
      }

      let attempts = 0;
      function tryRestoreWithRetries(){
        attempts++;
        const done = tryRestoreOnce(current);
        if (!done && attempts < 6) setTimeout(tryRestoreWithRetries, 150);
      }

      // Kick restoration shortly after DOM is ready and after load for images/fonts
      requestAnimationFrame(() => setTimeout(tryRestoreWithRetries, 0));
      window.addEventListener('load', () => setTimeout(tryRestoreWithRetries, 60), { once: true });
    } catch {}
  }

  function annotateIndexLinks() {
    injectStyles();
  const links = Array.from(document.querySelectorAll('a[href*="Chapters/solarity_chapter"], a[href*="solarity_chapter"]'));

  // compute uniform button width (max of natural anchor widths)
  let maxW = 0;
  links.forEach(a => { maxW = Math.max(maxW, a.getBoundingClientRect().width); });

  links.forEach(a => {
      const href = a.getAttribute('href') || '';
      const match = href.match(/solarity_chapter(\d+)\.html$/i);
      if (!match) return;
      const chId = match[1];
      const p = readProgress(chId);

      // ensure wrapper row so percent sits to the right of the button
      if (!a.parentElement) return;
      let row;
      if (a.parentElement && a.parentElement.classList.contains('chapter-link-row')) {
        row = a.parentElement;
      } else {
        row = document.createElement('div');
        row.className = 'chapter-link-row';
        a.parentElement.insertBefore(row, a);
        row.appendChild(a);
      }

      // enforce uniform width on the anchor
      if (maxW > 0) {
        a.style.minWidth = Math.ceil(maxW) + 'px';
      }

      // clean any old compact bars if present
      row.querySelectorAll(':scope > .chapter-progress-compact').forEach(el => el.remove());

      // horizontal percent text
      let inline = row.querySelector(':scope > .chapter-progress-inline');
      if (!inline) {
        inline = document.createElement('span');
        inline.className = 'chapter-progress-inline';
        row.appendChild(inline);
      }
      inline.textContent = (p || 0) + '%';
    });
  }

  function getOrCreateOverlay(){
    let ov = document.getElementById(OVERLAY_ID);
    if (!ov){
      ov = document.createElement('div');
      ov.id = OVERLAY_ID;
      ov.className = 'solarity-fade-overlay';
      document.body.appendChild(ov);
    }
    return ov;
  }

  function fadeInOverlayThenHide() {
    const ov = getOrCreateOverlay();
    // Start fully visible, then fade to transparent
    ov.classList.add('show');
    requestAnimationFrame(() => {
      ov.classList.remove('show');
      setTimeout(() => { /* keep element for reuse */ }, 450);
    });
  }

  function fadeOutOverlayThenNavigate(href){
    const ov = getOrCreateOverlay();
    // Fade to visible (cover page), then navigate
    ov.classList.add('show');
    setTimeout(() => { location.href = href; }, 420);
  }

  document.addEventListener('DOMContentLoaded', () => {
  // Fade-in overlay on every page load for consistent effect
  try { fadeInOverlayThenHide(); } catch {}

    if (onChapterPage()) {
      mountChapterProgress();
    } else {
      annotateIndexLinks();
    }

  // Intercept same-origin navigations for overlay fade-out
    document.addEventListener('click', (e) => {
      const a = e.target && (e.target.closest ? e.target.closest('a') : null);
      if (!a) return;
      const href = a.getAttribute('href');
      if (!href || href.startsWith('#') || a.target === '_blank') return;
      try {
        const url = new URL(href, location.href);
        if (url.origin !== location.origin) return; // external
      } catch { return; }

      // allow modifier/middle clicks to proceed normally
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;

      e.preventDefault();
      // overlay fade-out
      fadeOutOverlayThenNavigate(href);
    }, true);

    // Ensure visibility on BFCache restores
    window.addEventListener('pageshow', () => {
      try {
        const ov = document.getElementById(OVERLAY_ID);
        if (ov) ov.classList.remove('show');
      } catch {}
    });
  });
})();
