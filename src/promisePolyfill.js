// Polyfill Promise.try for Safari (not yet supported as of 2026)
if (typeof Promise.try !== 'function') {
  Promise.try = function (fn, ...args) {
    return new Promise((resolve) => resolve(fn(...args)));
  };
}
