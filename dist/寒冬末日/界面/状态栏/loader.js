// Lightweight loader to mount the built index.html (contains inline module code).
// Usage:
// <script type="module" src="https://testingcf.jsdelivr.net/gh/xuexix-alt/tavern_helper_template/dist/寒冬末日/界面/状态栏/loader.js"></script>

const htmlUrl = encodeURI('https://testingcf.jsdelivr.net/gh/xuexix-alt/tavern_helper_template/dist/寒冬末日/界面/状态栏/index.html');

(async () => {
  const html = await fetch(htmlUrl).then(r => r.text());
  const doc = new DOMParser().parseFromString(html, 'text/html');

  // append body children
  document.body.append(...doc.body.childNodes);

  // re-run inline module scripts as real modules
  doc.querySelectorAll('script[type="module"]').forEach(src => {
    const s = document.createElement('script');
    s.type = 'module';
    s.textContent = src.textContent; // built output is inline
    document.body.appendChild(s);
  });
})();
