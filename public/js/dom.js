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
