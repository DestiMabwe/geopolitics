// Where a country's real flag lives. The 195 SVGs are vendored from the MIT-licensed flag-icons set
// (public/flags/LICENSE), named by the game's own 3-letter code, so the game makes no outside request.

/**
 * @param {unknown} code  a country code such as 'ARG'
 * @returns {string | null}  the flag's URL, or null when `code` is not a 3-letter code (nothing odd is ever put in a path)
 */
export function flagPath(code) {
  return typeof code === 'string' && /^[A-Z]{3}$/.test(code) ? `/flags/${code}.svg` : null;
}
