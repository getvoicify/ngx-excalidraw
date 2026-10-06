const loads = new WeakMap<HTMLLinkElement, Promise<void>>();

export function loadStylesheetOnce(document: Document, href: string): Promise<void> {
  const existing = [
    ...document.head.querySelectorAll<HTMLLinkElement>('link[data-ngx-excalidraw]'),
  ].find((link) => link.getAttribute('href') === href);
  if (existing) return loads.get(existing) ?? Promise.resolve();

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.setAttribute('data-ngx-excalidraw', '');
  const loaded = new Promise<void>((resolve) => {
    link.addEventListener('load', () => resolve(), { once: true });
    link.addEventListener(
      'error',
      () => {
        loads.delete(link);
        link.remove();
        resolve();
      },
      { once: true },
    );
  });
  loads.set(link, loaded);
  document.head.appendChild(link);
  return loaded;
}
