const form = document.querySelector('#auth-form');
const tabs = document.querySelectorAll('[data-mode]');
const confirmField = document.querySelector('#confirm-field');
const statusBox = document.querySelector('#form-status');
const submitButton = document.querySelector('#submit-button');
let mode = 'login';
const authNotice = sessionStorage.getItem('authNotice');
if (authNotice) { statusBox.textContent = authNotice; statusBox.classList.remove('hidden'); sessionStorage.removeItem('authNotice'); }
api('/api/auth/me').then(() => window.location.replace('/app.html')).catch(() => {});
function clearErrors() { statusBox.classList.add('hidden'); statusBox.textContent = ''; document.querySelectorAll('[data-error]').forEach((el) => { el.textContent = ''; }); }
function setMode(next) {
  mode = next; tabs.forEach((tab) => { const active = tab.dataset.mode === mode; tab.classList.toggle('active', active); tab.setAttribute('aria-selected', String(active)); });
  confirmField.classList.toggle('hidden', mode === 'login'); document.querySelector('#confirmPassword').required = mode === 'register'; submitButton.textContent = mode === 'register' ? 'Create account' : 'Log in'; document.querySelector('#auth-title').textContent = mode === 'register' ? 'Create your space.' : 'Welcome back.'; clearErrors();
}
function showError(message, field) { const target = field && document.querySelector(`[data-error="${field}"]`); if (target) target.textContent = message; else { statusBox.textContent = message; statusBox.classList.remove('hidden'); } }
function validate(v) { if (!/^[a-zA-Z0-9_]{3,24}$/.test(v.username)) return ['Username must be 3–24 characters using letters, numbers, or underscores.', 'username']; if (v.password.length < 8) return ['Password must be at least 8 characters.', 'password']; if (mode === 'register' && v.password !== v.confirmPassword) return ['Passwords do not match.', 'confirmPassword']; return null; }
tabs.forEach((tab) => tab.addEventListener('click', () => setMode(tab.dataset.mode)));
document.querySelectorAll('[data-toggle-password]').forEach((button) => button.addEventListener('click', () => { const input = document.querySelector(`#${button.dataset.togglePassword}`); const reveal = input.type === 'password'; input.type = reveal ? 'text' : 'password'; button.textContent = reveal ? 'Hide' : 'Show'; button.setAttribute('aria-label', `${reveal ? 'Hide' : 'Show'} password`); }));
form.addEventListener('submit', async (event) => {
  event.preventDefault(); clearErrors(); const values = Object.fromEntries(new FormData(form)); const invalid = validate(values); if (invalid) return showError(...invalid);
  submitButton.disabled = true; submitButton.textContent = mode === 'register' ? 'Creating account…' : 'Logging in…';
  try { await api(`/api/auth/${mode}`, { method: 'POST', body: JSON.stringify(values) }); window.location.replace('/app.html'); }
  catch (error) { if (error.errors?.length) error.errors.forEach((item) => showError(item.message, item.field)); else showError(error.message); }
  finally { submitButton.disabled = false; submitButton.textContent = mode === 'register' ? 'Create account' : 'Log in'; }
});
