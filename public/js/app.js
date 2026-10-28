import * as AppHeader from './components/AppHeader.js';

// S24 shell: mounts the header only. Auth, routing and the game screen arrive in S25–S28.

const slot = (name) => document.querySelector(`[data-slot="${name}"]`);

slot('header').replaceChildren(AppHeader.render({ user: null }));
