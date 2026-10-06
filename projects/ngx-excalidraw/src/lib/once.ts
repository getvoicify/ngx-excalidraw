export function once<A extends unknown[]>(fn: (...args: A) => void): (...args: A) => void {
  let called = false;
  return (...args) => {
    if (called) return;
    called = true;
    fn(...args);
  };
}
