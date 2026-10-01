(() => {
  const saved = localStorage.getItem('theme');
  const preferred = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  document.documentElement.dataset.theme = saved || preferred;
  window.setTheme = (theme) => {
    if (!['dark', 'light'].includes(theme)) return;
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme', theme);
  };
})();
