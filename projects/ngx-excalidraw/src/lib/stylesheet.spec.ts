import { loadStylesheetOnce } from './stylesheet';

const linksTo = (href: string) =>
  [...document.head.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].filter(
    (link) => link.getAttribute('href') === href,
  );

describe('loadStylesheetOnce', () => {
  afterEach(() => linksTo('flaky.css').forEach((link) => link.remove()));

  it('requests a stylesheet again after it failed to load', async () => {
    const failed = loadStylesheetOnce(document, 'flaky.css');
    const [firstAttempt] = linksTo('flaky.css');
    firstAttempt.dispatchEvent(new Event('error'));
    await failed;

    expect(linksTo('flaky.css')).toEqual([]);

    const retried = loadStylesheetOnce(document, 'flaky.css');
    const [secondAttempt] = linksTo('flaky.css');
    expect(secondAttempt).not.toBe(firstAttempt);
    secondAttempt.dispatchEvent(new Event('load'));
    await retried;
    expect(linksTo('flaky.css')).toEqual([secondAttempt]);
  });
});
