export function debounce(fn, delay) {
  let timeoutId = null;
  const debounced = function(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), delay);
  };
  debounced.cancel = () => clearTimeout(timeoutId);
  return debounced;
}

export function throttle(func, wait) {
  let waiting = false;
  let savedArgs = null;
  let savedThis = null;

  const timeoutFunc = () => {
    if (savedArgs === null) {
      waiting = false;
    } else {
      func.apply(savedThis, savedArgs);
      savedArgs = null;
      savedThis = null;
      setTimeout(timeoutFunc, wait);
    }
  };

  return function throttled(...args) {
    if (waiting) {
      savedArgs = args;
      savedThis = this;
      return;
    }

    func.apply(this, args);
    waiting = true;
    setTimeout(timeoutFunc, wait);
  };
}
