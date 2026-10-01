import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useMeta } from '../lib/meta.jsx';
import {
  AboutFields,
  BasicsFields,
  InterestsField,
  LocationField,
  LookingForFields,
  PhotosField,
  PromptsField,
  formFromMe,
} from '../components/ProfileFields.jsx';
import { Logo } from '../components/ui.jsx';

const STEPS = [
  {
    title: '¡Hola! Empecemos',
    sub: 'Lo básico para que te conozcan.',
    Fields: BasicsFields,
    payload: (f) => ({ name: f.name, birthdate: f.birthdate, gender: f.gender }),
    valid: (f) => f.name.trim() && f.birthdate && f.gender,
  },
  {
    title: '¿Qué buscas?',
    sub: 'Ser claro desde el principio ahorra muchos malentendidos.',
    Fields: LookingForFields,
    payload: (f) => ({ showMe: f.showMe, intention: f.intention }),
    valid: (f) => f.showMe.length > 0 && f.intention,
  },
  {
    title: 'Tus intereses',
    sub: 'Los usamos para calcular la afinidad y sugerirte temas de conversación.',
    Fields: InterestsField,
    payload: (f) => ({ interests: f.interests }),
    valid: (f, meta) => f.interests.length >= meta.limits.minInterests,
  },
  {
    title: 'Que se note tu personalidad',
    sub: 'Las respuestas dan pie a conversaciones mucho mejores que un “hola”.',
    Fields: ({ value, set }) => (
      <>
        <PromptsField value={value} set={set} />
        <div style={{ height: 8 }} />
        <AboutFields value={value} set={set} />
      </>
    ),
    payload: (f) => ({
      prompts: f.prompts.filter((p) => p.answer.trim()),
      bio: f.bio,
      job: f.job,
    }),
    valid: (f) => f.prompts.some((p) => p.answer.trim()),
  },
  {
    title: 'Tus fotos',
    sub: 'Opcional, pero los perfiles con foto conectan mucho más. Puedes añadirlas luego.',
    photos: true,
  },
  {
    title: '¿Dónde estás?',
    sub: 'Para enseñarte gente cerca. Solo mostramos la distancia aproximada, nunca tu ubicación.',
    Fields: LocationField,
    payload: (f) => ({ location: f.location }),
    valid: (f) => f.location,
  },
];

export function Onboarding() {
  const { me, setMe, logout } = useAuth();
  const meta = useMeta();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(() => formFromMe(me));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const current = STEPS[step];
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const last = step === STEPS.length - 1;

  async function next() {
    setError('');
    if (current.photos) return setStep(step + 1);
    setBusy(true);
    try {
      const updated = await api.put('/api/me/profile', current.payload(form));
      if (last) setMe(updated); // con el perfil completo, la app pasa a "Descubrir"
      else setStep(step + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const canContinue = current.photos || current.valid(form, meta);

  return (
    <main className="onboarding">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Logo size={30} />
        <button className="btn btn-ghost btn-sm" onClick={logout}>
          Salir
        </button>
      </div>
      <div className="progress" aria-label={`Paso ${step + 1} de ${STEPS.length}`}>
        <div style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
      </div>
      <header className="step-head">
        <h1>{current.title}</h1>
        <p>{current.sub}</p>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canContinue && !busy) next();
        }}
      >
        {current.photos ? (
          <PhotosField photos={me.photos} onChange={setMe} />
        ) : (
          <current.Fields value={form} set={set} />
        )}
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <div className="step-foot">
          <div className="step-foot-inner">
            {step > 0 && (
              <button type="button" className="btn" onClick={() => setStep(step - 1)} aria-label="Atrás">
                <ArrowLeft size={18} />
              </button>
            )}
            <button className="btn btn-primary" disabled={!canContinue || busy}>
              {last ? '¡Empezar a descubrir!' : current.photos && me.photos.length === 0 ? 'Saltar por ahora' : 'Continuar'}
            </button>
          </div>
        </div>
      </form>
    </main>
  );
}
