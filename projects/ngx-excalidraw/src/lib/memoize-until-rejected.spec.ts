import { memoizeUntilRejected } from './memoize-until-rejected';

describe('memoizeUntilRejected', () => {
  it('shares one in-flight load between concurrent callers', () => {
    const load = vi.fn(() => new Promise<string>(() => undefined));
    const memoized = memoizeUntilRejected(load);
    expect(memoized()).toBe(memoized());
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('retries the load after it rejected', async () => {
    const load = vi
      .fn<() => Promise<string>>()
      .mockImplementationOnce(() => Promise.reject(new Error('chunk 404')))
      .mockImplementationOnce(() => Promise.resolve('loaded'));
    const memoized = memoizeUntilRejected(load);
    await expect(memoized()).rejects.toThrow('chunk 404');
    await expect(memoized()).resolves.toBe('loaded');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('keeps a successful load without loading again', async () => {
    const load = vi.fn(() => Promise.resolve('loaded'));
    const memoized = memoizeUntilRejected(load);
    await memoized();
    await memoized();
    expect(load).toHaveBeenCalledTimes(1);
  });
});
