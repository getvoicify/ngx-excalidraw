import { once } from './once';

describe('once', () => {
  it('passes the first call through and ignores every later one', () => {
    const received: string[] = [];
    const handOver = once((value: string) => received.push(value));
    handOver('first API');
    handOver('remounted API');
    expect(received).toEqual(['first API']);
  });
});
