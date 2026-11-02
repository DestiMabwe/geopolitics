import { el } from '../dom.js';
import { profileLabel, profileBlurb } from '../profiles.js';

// DESIGN §2 profile badge: the NPC's profile name, coloured by the --profile-* tokens, with the
// one-line description as a tooltip. The name is text, so colour is never the only signal.

/**
 * @param {{ profile: string | null | undefined }} props
 * @returns {HTMLElement | null} null for the human, who has no profile
 */
export function render({ profile }) {
  const label = profileLabel(profile);
  if (!label) return null;
  return el('span', { class: `profile-badge profile-badge--${profile}`, title: profileBlurb(profile) }, label);
}
