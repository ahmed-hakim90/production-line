const HTML_SPLASH_ID = 'html-splash';

/** Remove the static HTML splash shown before React hydrates. */
export function dismissHtmlSplash(): void {
  const el = document.getElementById(HTML_SPLASH_ID);
  if (!el) return;

  el.classList.add('html-splash--exit');
  const remove = () => el.remove();
  el.addEventListener('transitionend', remove, { once: true });
  window.setTimeout(remove, 450);
}
