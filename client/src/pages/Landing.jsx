import { useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { Logo } from '../components/ui.jsx';

const PERKS = [
  ['👀', 'Mira quién te da like', 'Gratis. En otras apps, esto cuesta dinero.'],
  ['♾️', 'Likes ilimitados', 'Sin contador que te frene a las 12 del mediodía.'],
  ['↩️', 'Deshacer', '¿Se te escapó el dedo? Vuelve atrás sin pagar.'],
  ['✨', '3 Chispas al día', 'Destaca tu like con un mensaje. Gratis cada día.'],
  ['🎯', 'Compatibilidad explicada', 'Te decimos por qué encajáis, sin algoritmos opacos.'],
  ['🕶️', 'Modo incógnito', 'Solo te ve quien tú hayas elegido. Gratis.'],
  ['🛡️', 'Seguridad primero', 'Avisos anti-estafa, filtro de insultos y bloqueo en un toque.'],
  ['💬', 'Más que fotos', 'Preguntas, intereses e intenciones claras en cada perfil.'],
];

export function Landing() {
  const { refresh } = useAuth();
  const [mode, setMode] = useState('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [adult, setAdult] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (mode === 'register' && !adult) return setError('Debes confirmar que eres mayor de 18 años.');
    setBusy(true);
    try {
      await api.post(`/api/auth/${mode === 'register' ? 'register' : 'login'}`, { email, password });
      await refresh();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <main className="landing">
      <section className="landing-hero">
        <Logo size={44} />
        <h1>
          Citas sin muros de pago. <span className="grad-text">De verdad.</span>
        </h1>
        <p className="lead">
          Sparka es una app de citas gratuita: todas las funciones para todo el mundo. Sin planes premium, sin
          “boosts” y sin trucos para que pagues.
        </p>
        <div className="perks">
          {PERKS.map(([icon, title, text]) => (
            <div className="perk" key={title}>
              <span className="perk-icon" aria-hidden="true">
                {icon}
              </span>
              <span>
                <strong>{title}</strong>
                <small>{text}</small>
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-auth">
        <form className="card auth-card" onSubmit={submit}>
          <div className="segmented" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register'}
              className={mode === 'register' ? 'active' : ''}
              onClick={() => setMode('register')}
            >
              Crear cuenta
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              className={mode === 'login' ? 'active' : ''}
              onClick={() => setMode('login')}
            >
              Entrar
            </button>
          </div>
          <label className="field" style={{ margin: 0 }}>
            <span>Email</span>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label className="field" style={{ margin: 0 }}>
            <span>Contraseña</span>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              minLength={8}
              required
            />
            {mode === 'register' && <small className="hint">Mínimo 8 caracteres.</small>}
          </label>
          {mode === 'register' && (
            <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: '0.92rem' }}>
              <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} />
              Confirmo que tengo 18 años o más.
            </label>
          )}
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
          <button className="btn btn-primary btn-block" disabled={busy}>
            {mode === 'register' ? 'Crear mi cuenta gratis' : 'Entrar'}
          </button>
          <p className="legal">Gratis hoy y siempre. Sin tarjeta, sin pruebas que caducan.</p>
        </form>
      </section>
    </main>
  );
}
