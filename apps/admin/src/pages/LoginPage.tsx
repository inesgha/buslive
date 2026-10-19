import { type FormEvent, useState } from 'react';

import { useAuth } from '../auth/AuthProvider';
import { ErrorText } from '../components/Layout';

/** Connexion : seuls les modérateurs et administrateurs obtiennent une session. */
export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await login(email, password);
    } catch (cause) {
      setError(cause);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="login card">
      <h1>BusLive · Administration</h1>
      <form onSubmit={(event) => void onSubmit(event)}>
        <label>
          Email
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label>
          Mot de passe
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        <ErrorText error={error} />
        <button type="submit" className="primary" disabled={pending}>
          {pending ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
      <p className="muted">Accès réservé aux modérateurs et administrateurs.</p>
    </div>
  );
}
