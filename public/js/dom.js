/**
 * Builds an element. Text always goes in as text nodes, never as HTML, so server data
 * (country names, commentary) can't inject markup.
 *
 * @param {string} tag
 * @param {Record<string, string | boolean>} [attrs]  `class`, `data-*`, `aria-*`, etc. `false` skips it.
 * @param {...(Node | string | null | false)} children  falsy children are skipped
 * @returns {HTMLElement}
 */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === false) continue;
    node.setAttribute(name, value === true ? '' : value);
  }
  for (const child of children) {
    if (child) node.append(child);
  }
  return node;
}

/**
 * `root.replaceChildren(...children)` that keeps keyboard focus. The game page redraws whole slots, and a
 * rebuilt element is a new element, so focus would drop to the page. This finds the same control again
 * (by its country code, id, label or text) and focuses it, so a keyboard player never loses their place.
 *
 * @param {Element} root
 * @param {...Node} children
 */
export function replaceKeepingFocus(root, ...children) {
  const active = document.activeElement;
  const had = active && root.contains(active) ? active : null;
  const key = had && {
    tag: had.tagName, code: had.dataset?.code, id: had.id,
    label: had.getAttribute('aria-label'), text: had.textContent,
  };
  root.replaceChildren(...children);
  if (!key) return;

  const same = (node) => {
    if (key.code) return node.dataset.code === key.code;
    if (key.id) return node.id === key.id;
    if (key.label) return node.getAttribute('aria-label') === key.label;
    return node.textContent === key.text;
  };
  [...root.querySelectorAll(key.tag)].find(same)?.focus({ preventScroll: true });
}
