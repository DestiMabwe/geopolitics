import { el } from '../dom.js';

// DESIGN §2 AuthForm, §3.1. Display only: it reports a submit or a mode switch through the
// callbacks, and app.js decides what happens. Messages come from authMessages.js.

const COPY = {
  login: { title: 'Log in', submit: 'Log in', toggle: 'New here? Create an account', password: 'current-password' },
  signup: { title: 'Create account', submit: 'Create account', toggle: 'Have an account? Log in', password: 'new-password' },
};

/**
 * @param {object} props
 * @param {'login' | 'signup'} props.mode
 * @param {string} [props.email]  kept when switching mode
 * @param {(credentials: { email: string, password: string }) => void} props.onSubmit
 * @param {(mode: 'login' | 'signup', email: string) => void} props.onToggleMode  the email typed so far, to keep it
 * @returns {HTMLFormElement}
 */
export function render({ mode, email = '', onSubmit, onToggleMode }) {
  const copy = COPY[mode];

  const emailInput = el('input', {
    id: 'auth-email',
    name: 'email',
    type: 'email',
    autocomplete: 'email',
    required: true,
    'aria-describedby': 'auth-email-error',
  });
  emailInput.value = email;

  const passwordInput = el('input', {
    id: 'auth-password',
    name: 'password',
    type: 'password',
    autocomplete: copy.password,
    required: true,
    minlength: '6',
    'aria-describedby': 'auth-password-error',
  });

  // novalidate: our messages (DESIGN §3.1) replace the browser's own bubbles.
  const form = el(
    'form',
    { class: 'auth-form', novalidate: true, 'data-mode': mode },
    el('h2', { class: 'auth-form__title' }, copy.title),
    field('Email', emailInput, 'auth-email-error'),
    field('Password', passwordInput, 'auth-password-error'),
    el('p', { class: 'auth-form__error', 'data-error': 'form', role: 'alert' }),
    el('button', { type: 'submit', class: 'button button--primary auth-form__submit' }, copy.submit),
    el(
      'button',
      { type: 'button', class: 'auth-form__toggle', 'data-toggle': true },
      copy.toggle,
    ),
  );

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    onSubmit({ email: emailInput.value, password: passwordInput.value });
  });
  form.querySelector('[data-toggle]').addEventListener('click', () => {
    onToggleMode(mode === 'login' ? 'signup' : 'login', emailInput.value);
  });

  return form;
}

/**
 * Shows the form's state without rebuilding it, so typed values stay.
 *
 * @param {HTMLFormElement} form
 * @param {object} props
 * @param {{ email?: string, password?: string }} [props.errors]  field messages (invalid)
 * @param {string | null} [props.formError]  wrong password, email in use (error)
 * @param {boolean} [props.submitting]
 */
export function update(form, { errors = {}, formError = null, submitting = false }) {
  for (const name of ['email', 'password']) {
    const input = form.elements[name];
    const message = errors[name] ?? '';
    input.toggleAttribute('aria-invalid', Boolean(message));
    form.querySelector(`[data-error="${name}"]`).textContent = message;
  }
  form.querySelector('[data-error="form"]').textContent = formError ?? '';

  for (const control of form.querySelectorAll('input, button')) {
    control.disabled = submitting;
  }
  form.classList.toggle('auth-form--submitting', submitting);
  form.setAttribute('aria-busy', String(submitting));
}

function field(label, input, errorId) {
  return el(
    'div',
    { class: 'auth-form__field' },
    el('label', { class: 'auth-form__label', for: input.id }, label),
    input,
    el('p', { class: 'auth-form__field-error', id: errorId, 'data-error': input.name }),
  );
}
