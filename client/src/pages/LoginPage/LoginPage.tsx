import { useState } from 'react';
import type { FormEvent } from 'react';
import './LoginPage.css';
import BrandPanel from './BrandPanel';
import FloatingInput from './FloatingInput';
import Footer from '../../components/Footer';

type LoginResponse = { user: string };

async function login(identifier: string, password: string): Promise<LoginResponse> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });
  const data: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const message =
      data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
        ? data.error
        : 'Something went wrong. Please try again.';
    throw new Error(message);
  }
  return data as LoginResponse;
}

function GoogleIcon() {
  return (
    <svg className="social-icon" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
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
      const res = await login(identifier.trim(), password);
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

            {/* TODO: start the Google OAuth flow (e.g. redirect to /api/auth/google). */}
            <button type="button" className="social-btn">
              <GoogleIcon />
              Continue with Google
            </button>

            <p className="error" role="alert">{error}</p>

            <a href="#" className="forgot-link">Forgot password?</a>
          </section>

          <section className="card signup-card">
            Don't have an account? <a href="#">Sign up</a>
          </section>
        </main>

        <Footer />
      </div>
    </div>
  );
}
