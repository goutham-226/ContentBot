import { useState } from 'react';
import type { FormEvent } from 'react';
import './LoginPage.css';
import BrandPanel from './BrandPanel';
import FloatingInput from './FloatingInput';

type LoginResponse = { user: string };

// Placeholder until the backend exists.
function fakeLogin(identifier: string, password: string): Promise<LoginResponse> {
  // TODO: replace with the real API call, e.g. POST /api/auth/login
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (password === 'password123') {
        resolve({ user: identifier });
      } else {
        reject(new Error('Sorry, your password was incorrect.'));
      }
    }, 1000);
  });
}

export default function LoginPage() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Derived, not stored: always in sync with the inputs.
  const canSubmit = identifier.trim().length > 0 && password.length >= 6;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit || loading) return;

    setError('');
    setLoading(true);

    try {
      const res = await fakeLogin(identifier.trim(), password);
      alert(`Logged in as ${res.user}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <BrandPanel />

      <div className="form-side">
        <main className="auth-column">
          <section className="card login-card">
            <span className="logo mobile-logo">Content_Bot</span>
            <h1 className="form-title">Welcome back</h1>

            <form className="login-form" onSubmit={handleSubmit} noValidate>
              <FloatingInput
                id="identifier"
                label="Username or email"
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                autoComplete="username"
              />

              <FloatingInput
                id="password"
                label="Password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                rightSlot={
                  password && (
                    <button
                      type="button"
                      className="toggle-btn"
                      onClick={() => setShowPassword((s) => !s)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  )
                }
              />

              <button type="submit" className="primary-btn" disabled={!canSubmit || loading}>
                {loading ? 'Logging in…' : 'Log in'}
              </button>
            </form>

            <div className="divider">OR</div>

            <button type="button" className="text-btn google-btn">
              Log in with Google
            </button>

            <p className="error" role="alert">{error}</p>

            <a href="#" className="forgot-link">Forgot password?</a>
          </section>

          <section className="card signup-card">
            Don't have an account? <a href="#">Sign up</a>
          </section>
        </main>

        <footer className="footer">
          <nav className="footer-nav" aria-label="Footer">
            <a href="#">About</a>
            <a href="#">Help</a>
            <a href="#">Privacy</a>
            <a href="#">Terms</a>
          </nav>
          <p className="copyright">© 2026 Content_Bot</p>
        </footer>
      </div>
    </div>
  );
}
