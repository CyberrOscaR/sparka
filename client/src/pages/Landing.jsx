import { useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { Logo } from '../components/ui.jsx';

const UNIQUE = [
  {
    icon: '🙈',
    title: 'A ciegas: la Pregunta del Día',
    text: 'Cada día, una pregunta para todo el mundo. Lees respuestas sin fotos ni nombres y das chispas a las que te enamoran. Si es mutuo: match a ciegas, y os revelamos. Si no, nadie sabrá nunca quién fuiste.',
  },
  {
    icon: '💓',
    title: 'El Pulso: adiós al ghosting',
    text: 'Si una conversación se enfría, os preguntamos en secreto si queréis seguir. Un «sí» solo se revela si es mutuo (y os proponemos un plan). Un «no» se despide con cariño. Nadie se queda esperando.',
  },
  {
    icon: '✨',
    title: 'Autocitas: Sparka os organiza la cita',
    text: 'Cuéntanos tus gustos y lo que piensas (también de política o religión, en privado). Cuando alguien encaje contigo al 65 % o más, os proponemos una cita con plan incluido. Si los dos os apuntáis, buscamos hora.',
  },
  {
    icon: '📅',
    title: 'Coincidir: la cita, cuadrada en secreto',
    text: 'Se acabó el «¿y tú cuándo puedes?». Cada cual marca en secreto sus huecos de la semana y Sparka solo os dice cuándo coincidís, con una idea de plan y directo a tu calendario. Nadie ve tu agenda ni cuándo no puedes.',
  },
];

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
          Enamórate de cómo piensa alguien. <span className="grad-text">Gratis, de verdad.</span>
        </h1>
        <p className="lead">
          Sparka es la app de citas donde importa lo que piensas, no solo tu foto, y donde nadie desaparece sin decir
          adiós. Todas las funciones son gratis para todo el mundo: sin planes premium ni trucos para que pagues.
        </p>
        <div className="unique">
          <span className="unique-label">Solo en Sparka</span>
          {UNIQUE.map((u) => (
            <div className="unique-card" key={u.title}>
              <span className="unique-icon" aria-hidden="true">
                {u.icon}
              </span>
              <span>
                <strong>{u.title}</strong>
                <small>{u.text}</small>
              </span>
            </div>
          ))}
        </div>
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
