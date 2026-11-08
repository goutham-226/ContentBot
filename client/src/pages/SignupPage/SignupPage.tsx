import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import '../LoginPage/LoginPage.css';
import BrandPanel from '../LoginPage/BrandPanel';
import FloatingInput from '../LoginPage/FloatingInput';
import Footer from '../../components/Footer';

const SERVER_UNREACHABLE = 'Can’t reach the server right now. Please try again in a moment.';

type Field = 'email' | 'username' | 'password';
type FieldErrors = Partial<Record<Field, string>>;

// Thrown when the server rejects specific fields (taken or invalid).
class SignupError extends Error {
  fields: FieldErrors;
  constructor(message: string, fields: FieldErrors) {
    super(message);
    this.fields = fields;
  }
}

function readFields(data: unknown): FieldErrors {
  if (!data || typeof data !== 'object' || !('fields' in data)) return {};
  const raw = data.fields;
  if (!raw || typeof raw !== 'object') return {};

  const fields: FieldErrors = {};
  for (const key of ['email', 'username', 'password'] as const) {
    const value: unknown = (raw as Record<string, unknown>)[key];
    if (typeof value === 'string') fields[key] = value;
  }
  return fields;
}

function readError(data: unknown): string {
  return data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
    ? data.error
    : 'Something went wrong. Please try again.';
}

async function signup(email: string, username: string, password: string): Promise<{ user: string }> {
  const res = await fetch('/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, username, password }),
  });
  const data: unknown = await res.json().catch(() => null);

  // No JSON body means the request never reached our API (e.g. Vite's 502 proxy error).
  if (data === null) throw new Error(SERVER_UNREACHABLE);
  if (!res.ok) throw new SignupError(readError(data), readFields(data));
  return data as { user: string };
}

// Returns false only when the server confirms the value is taken;
// network problems are left for the submit to report.
async function isAvailable(field: 'email' | 'username', value: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/auth/available?${field}=${encodeURIComponent(value)}`);
    if (!res.ok) return true;
    const data: unknown = await res.json();
    return !(data && typeof data === 'object' && 'available' in data && data.available === false);
  } catch {
    return true;
  }
}

export default function SignupPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const canSubmit =
    email.trim().length > 0 &&
    username.trim().length > 0 &&
    password.length >= 8 && password.length <= 256 &&
    !fieldErrors.email &&
    !fieldErrors.username;

  function setFieldError(field: Field, message: string | undefined) {
    setFieldErrors((prev) => ({ ...prev, [field]: message }));
  }

  async function checkTaken(field: 'email' | 'username', value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (!(await isAvailable(field, trimmed))) {
      setFieldError(field, field === 'email' ? 'Email taken' : 'Username taken');
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit || loading) return;

    setError('');
    setLoading(true);

    try {
      const res = await signup(email.trim(), username.trim(), password);
      navigate('/', { state: { signedUpAs: res.user } });
    } catch (err) {
      if (err instanceof SignupError && Object.keys(err.fields).length > 0) {
        setFieldErrors(err.fields);
      } else {
        setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      }
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
            <h1 className="form-title">Create your account</h1>

            <form className="login-form" onSubmit={handleSubmit} noValidate>
              <FloatingInput
                id="email"
                label="Email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setFieldError('email', undefined);
                }}
                onBlur={(e) => checkTaken('email', e.target.value)}
                autoComplete="email"
                error={fieldErrors.email}
              />

              <FloatingInput
                id="username"
                label="Username"
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setFieldError('username', undefined);
                }}
                onBlur={(e) => checkTaken('username', e.target.value)}
                autoComplete="username"
                error={fieldErrors.username}
              />

              <FloatingInput
                id="new-password"
                label="Password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setFieldError('password', undefined);
                }}
                autoComplete="new-password"
                error={fieldErrors.password}
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
                {loading ? 'Creating account…' : 'Sign up'}
              </button>
            </form>

            <p className="error" role="alert">{error}</p>
          </section>

          <section className="card signup-card">
            Have an account? <Link to="/">Log in</Link>
          </section>
        </main>

        <Footer />
      </div>
    </div>
  );
}
