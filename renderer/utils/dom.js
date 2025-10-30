/**
 * DOM Utility Module
 * Common DOM manipulation helpers
 *
 * Provides convenient wrappers for frequently-used DOM operations
 */

/**
 * Query selector shorthand
 * @param {string} selector - CSS selector
 * @param {Element|Document} context - Context element (default: document)
 * @returns {Element|null} First matching element
 */
export function $(selector, context = document) {
  return context.querySelector(selector);
}

/**
 * Query selector all shorthand (returns array)
 * @param {string} selector - CSS selector
 * @param {Element|Document} context - Context element (default: document)
 * @returns {Array<Element>} Array of matching elements
 */
export function $$(selector, context = document) {
  return Array.from(context.querySelectorAll(selector));
}

/**
 * Get element by ID
 * @param {string} id - Element ID
 * @returns {Element|null} Element with matching ID
 */
export function byId(id) {
  return document.getElementById(id);
}

/**
 * Create element with attributes and children
 * @param {string} tag - HTML tag name
 * @param {Object} attrs - Attributes object
 * @param {Array|string} children - Children elements or text
 * @returns {Element} Created element
 *
 * @example
 * createElement('div', { class: 'container', 'data-id': '123' }, [
 *   'Hello',
 *   createElement('span', {}, ['World'])
 * ])
 */
export function createElement(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);

  // Set attributes
  Object.entries(attrs).forEach(([key, value]) => {
    if (key === 'class' || key === 'className') {
      el.className = value;
    } else if (key.startsWith('data-')) {
      el.setAttribute(key, value);
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(el.style, value);
    } else if (key.startsWith('on') && typeof value === 'function') {
      // Event listeners: onClick -> click
      const eventName = key.slice(2).toLowerCase();
      el.addEventListener(eventName, value);
    } else {
      el.setAttribute(key, value);
    }
  });

  // Append children
  const childArray = Array.isArray(children) ? children : [children];
  childArray.forEach(child => {
    if (child === null || child === undefined) {
      return; // Skip null/undefined children
    } else if (typeof child === 'string' || typeof child === 'number') {
      el.appendChild(document.createTextNode(String(child)));
    } else if (child instanceof Element || child instanceof DocumentFragment) {
      el.appendChild(child);
    }
  });

  return el;
}

/**
 * Create document fragment from elements
 * @param {Array<Element|string>} children - Array of elements or text
 * @returns {DocumentFragment} Document fragment
 */
export function createFragment(children = []) {
  const fragment = document.createDocumentFragment();
  const childArray = Array.isArray(children) ? children : [children];

  childArray.forEach(child => {
    if (child === null || child === undefined) {
      return;
    } else if (typeof child === 'string' || typeof child === 'number') {
      fragment.appendChild(document.createTextNode(String(child)));
    } else if (child instanceof Element || child instanceof DocumentFragment) {
      fragment.appendChild(child);
    }
  });

  return fragment;
}

/**
 * Remove all child nodes from element
 * @param {Element} element - Element to empty
 */
export function empty(element) {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

/**
 * Replace element's children with new content
 * @param {Element} element - Parent element
 * @param {Array<Element|string>|Element|string} children - New children
 */
export function replaceChildren(element, children) {
  empty(element);
  const childArray = Array.isArray(children) ? children : [children];

  childArray.forEach(child => {
    if (child === null || child === undefined) {
      return;
    } else if (typeof child === 'string' || typeof child === 'number') {
      element.appendChild(document.createTextNode(String(child)));
    } else if (child instanceof Element || child instanceof DocumentFragment) {
      element.appendChild(child);
    }
  });
}

/**
 * Toggle class on element
 * @param {Element} element - Element
 * @param {string} className - Class name
 * @param {boolean} force - Force add (true) or remove (false)
 */
export function toggleClass(element, className, force = undefined) {
  if (force === undefined) {
    element.classList.toggle(className);
  } else {
    element.classList.toggle(className, force);
  }
}

/**
 * Add class(es) to element
 * @param {Element} element - Element
 * @param {...string} classNames - Class names to add
 */
export function addClass(element, ...classNames) {
  element.classList.add(...classNames);
}

/**
 * Remove class(es) from element
 * @param {Element} element - Element
 * @param {...string} classNames - Class names to remove
 */
export function removeClass(element, ...classNames) {
  element.classList.remove(...classNames);
}

/**
 * Check if element has class
 * @param {Element} element - Element
 * @param {string} className - Class name
 * @returns {boolean} True if element has class
 */
export function hasClass(element, className) {
  return element.classList.contains(className);
}

/**
 * Get/set element attribute
 * @param {Element} element - Element
 * @param {string} name - Attribute name
 * @param {string} value - Attribute value (omit to get)
 * @returns {string|null|undefined} Attribute value if getting
 */
export function attr(element, name, value = undefined) {
  if (value === undefined) {
    return element.getAttribute(name);
  } else {
    element.setAttribute(name, value);
  }
}

/**
 * Remove attribute from element
 * @param {Element} element - Element
 * @param {string} name - Attribute name
 */
export function removeAttr(element, name) {
  element.removeAttribute(name);
}

/**
 * Show element (remove 'hidden' attribute and set display)
 * @param {Element} element - Element
 * @param {string} display - Display style (default: 'block')
 */
export function show(element, display = 'block') {
  element.removeAttribute('hidden');
  if (element.style.display === 'none') {
    element.style.display = display;
  }
}

/**
 * Hide element (add 'hidden' attribute)
 * @param {Element} element - Element
 */
export function hide(element) {
  element.setAttribute('hidden', '');
  element.style.display = 'none';
}

/**
 * Toggle element visibility
 * @param {Element} element - Element
 * @param {boolean} force - Force show (true) or hide (false)
 */
export function toggle(element, force = undefined) {
  const isHidden = element.hasAttribute('hidden') || element.style.display === 'none';

  if (force === true || (force === undefined && isHidden)) {
    show(element);
  } else {
    hide(element);
  }
}

/**
 * Check if element is visible
 * @param {Element} element - Element
 * @returns {boolean} True if visible
 */
export function isVisible(element) {
  return !element.hasAttribute('hidden') &&
         element.style.display !== 'none' &&
         element.offsetParent !== null;
}

/**
 * Get element's offset position
 * @param {Element} element - Element
 * @returns {Object} {top, left, width, height}
 */
export function offset(element) {
  const rect = element.getBoundingClientRect();
  return {
    top: rect.top + window.scrollY,
    left: rect.left + window.scrollX,
    width: rect.width,
    height: rect.height
  };
}

/**
 * Scroll element into view smoothly
 * @param {Element} element - Element to scroll to
 * @param {Object} options - Scroll options
 */
export function scrollIntoView(element, options = {}) {
  const defaultOptions = {
    behavior: 'smooth',
    block: 'nearest',
    inline: 'nearest'
  };

  element.scrollIntoView({ ...defaultOptions, ...options });
}

/**
 * Get/set element text content
 * @param {Element} element - Element
 * @param {string} text - Text to set (omit to get)
 * @returns {string|undefined} Text content if getting
 */
export function text(element, text = undefined) {
  if (text === undefined) {
    return element.textContent;
  } else {
    element.textContent = text;
  }
}

/**
 * Get/set element HTML content
 * @param {Element} element - Element
 * @param {string} html - HTML to set (omit to get)
 * @returns {string|undefined} HTML content if getting
 */
export function html(element, html = undefined) {
  if (html === undefined) {
    return element.innerHTML;
  } else {
    element.innerHTML = html;
  }
}

/**
 * Append element(s) to parent
 * @param {Element} parent - Parent element
 * @param {...Element|string} children - Children to append
 */
export function append(parent, ...children) {
  children.forEach(child => {
    if (typeof child === 'string') {
      parent.appendChild(document.createTextNode(child));
    } else if (child instanceof Element || child instanceof DocumentFragment) {
      parent.appendChild(child);
    }
  });
}

/**
 * Prepend element(s) to parent
 * @param {Element} parent - Parent element
 * @param {...Element|string} children - Children to prepend
 */
export function prepend(parent, ...children) {
  const fragment = createFragment(children);
  parent.insertBefore(fragment, parent.firstChild);
}

/**
 * Remove element from DOM
 * @param {Element} element - Element to remove
 */
export function remove(element) {
  if (element && element.parentNode) {
    element.parentNode.removeChild(element);
  }
}

/**
 * Find closest ancestor matching selector
 * @param {Element} element - Starting element
 * @param {string} selector - CSS selector
 * @returns {Element|null} Matching ancestor or null
 */
export function closest(element, selector) {
  return element.closest(selector);
}

/**
 * Get element's parent
 * @param {Element} element - Element
 * @returns {Element|null} Parent element
 */
export function parent(element) {
  return element.parentElement;
}

/**
 * Get element's children
 * @param {Element} element - Element
 * @returns {Array<Element>} Array of child elements
 */
export function children(element) {
  return Array.from(element.children);
}

/**
 * Delegate event listener
 * @param {Element} parent - Parent element
 * @param {string} selector - Child selector
 * @param {string} event - Event name
 * @param {Function} handler - Event handler
 * @returns {Function} Cleanup function
 */
export function delegate(parent, selector, event, handler) {
  const listener = (e) => {
    const target = e.target.closest(selector);
    if (target && parent.contains(target)) {
      handler.call(target, e);
    }
  };

  parent.addEventListener(event, listener);

  // Return cleanup function
  return () => {
    parent.removeEventListener(event, listener);
  };
}

/**
 * Wait for DOM to be ready
 * @param {Function} callback - Callback to execute when ready
 */
export function ready(callback) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', callback);
  } else {
    callback();
  }
}

/**
 * Create element from HTML string
 * @param {string} htmlString - HTML string
 * @returns {Element} Created element
 */
export function fromHTML(htmlString) {
  const template = document.createElement('template');
  template.innerHTML = htmlString.trim();
  return template.content.firstChild;
}

/**
 * Deep clone element
 * @param {Element} element - Element to clone
 * @param {boolean} deep - Deep clone (default: true)
 * @returns {Element} Cloned element
 */
export function clone(element, deep = true) {
  return element.cloneNode(deep);
}

// Default export with all utilities
export default {
  $,
  $$,
  byId,
  createElement,
  createFragment,
  empty,
  replaceChildren,
  toggleClass,
  addClass,
  removeClass,
  hasClass,
  attr,
  removeAttr,
  show,
  hide,
  toggle,
  isVisible,
  offset,
  scrollIntoView,
  text,
  html,
  append,
  prepend,
  remove,
  closest,
  parent,
  children,
  delegate,
  ready,
  fromHTML,
  clone
};
