import React, { useState } from 'react';
import { login, register } from '../services/auth';

interface AuthFormProps {
  onAuth: (token: string) => void;
}

const AuthForm: React.FC<AuthFormProps> = ({ onAuth }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const token = mode === 'login'
        ? await login(username, password)
        : await register(username, password);
      onAuth(token);
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <h2>{mode === 'login' ? 'Log In' : 'Register'}</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Loading...' : mode === 'login' ? 'Log In' : 'Register'}
        </button>
      </form>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <button
        type="button"
        onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}
      >
        {mode === 'login' ? 'Switch to Register' : 'Switch to Login'}
      </button>
    </div>
  );
};

export default AuthForm;
