// Auth client — login / register / forgot password.
// Honors:
//   - ?return_to=<safe local path>  → redirect there after success
//   - already-logged-in on /login   → auto-redirect (admin → /admin, else /dashboard)
//   - Remember me checkbox          → tells the server to issue a 30d cookie

(function () {
  function setMsg(text, type = 'error') {
    const el = document.getElementById('msg');
    if (!el) return;
    el.innerHTML = `<div class="alert alert-${type}">${text.replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'})[c])}</div>`;
  }

  // Safe-local guard so `return_to` can't be used to redirect off-site.
  function safeLocalPath(p) {
    return typeof p === 'string' && p.startsWith('/') && !p.startsWith('//') ? p : null;
  }

  function postRedirect(user) {
    const params = new URLSearchParams(location.search);
    const rt = safeLocalPath(params.get('return_to'));
    if (rt) { location.href = rt; return; }
    if (user.role === 'admin' || user.role === 'teacher') location.href = '/admin.html';
    else location.href = '/dashboard.html';
  }

  // Prefill email from ?email= when redirected from the homepage CTA.
  const params = new URLSearchParams(location.search);
  const emailParam = params.get('email');
  if (emailParam) {
    const emailField = document.querySelector('input[name="email"]');
    if (emailField) emailField.value = emailParam;
  }
  if (params.get('error')) setMsg(decodeURIComponent(params.get('error')));

  // If we're on /login and already authenticated, skip the form entirely.
  // Same for /register — going there while signed in is almost never useful.
  const path = location.pathname.replace(/\/$/, '') || '/';
  const onAuthPage = path.endsWith('/login.html') || path === '/login'
                  || path.endsWith('/register.html') || path === '/register';
  if (onAuthPage) {
    (async () => {
      const { ok, data } = await window.api('/api/auth/me');
      if (ok && data.user) postRedirect(data.user);
    })();
  }

  // Hide social buttons whose provider isn't configured on the server.
  (async function syncProviders() {
    const wrap = document.querySelector('.social-btns');
    if (!wrap) return;
    try {
      const r = await fetch('/api/auth/providers');
      if (!r.ok) return;
      const enabled = await r.json();
      let anyShown = false;
      wrap.querySelectorAll('[data-provider]').forEach(btn => {
        if (enabled[btn.dataset.provider]) anyShown = true;
        else btn.style.display = 'none';
      });
      if (!anyShown) {
        wrap.style.display = 'none';
        const divider = wrap.nextElementSibling;
        if (divider && divider.classList.contains('divider')) divider.style.display = 'none';
      }
    } catch (_) {}
  })();

  const login = document.getElementById('login-form');
  if (login) {
    login.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = {
        email:    fd.get('email'),
        password: fd.get('password'),
        remember: fd.get('remember') === 'on'   // checkbox unchecked → not in form data → false
      };
      const r = await window.api('/api/auth/login', { method: 'POST', body });
      if (r.ok) postRedirect(r.data.user);
      else setMsg(r.data.error || 'Sign in failed');
    });
  }

  const register = document.getElementById('register-form');
  if (register) {
    register.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(e.target).entries());
      if (!body.name || !body.email || !body.password) return setMsg('All fields are required');
      if (body.password.length < 8) return setMsg('Password must be at least 8 characters');
      const r = await window.api('/api/auth/register', { method: 'POST', body });
      if (r.ok) postRedirect(r.data.user);
      else setMsg(r.data.error || 'Registration failed');
    });
  }

  const forgot = document.getElementById('forgot-form');
  if (forgot) {
    forgot.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(e.target).entries());
      const r = await window.api('/api/auth/forgot', { method: 'POST', body });
      if (r.ok) setMsg('If an account exists, a reset link is on its way.', 'success');
      else setMsg(r.data.error || 'Request failed');
    });
  }
})();
