import { useCallback, useEffect, useMemo, useState } from 'react';
import { Lock, MapPin } from 'lucide-react';
import { api } from '../lib/api.js';
import { useRealtime, useSocketEvent } from '../lib/realtime.jsx';
import { useToast } from '../lib/toast.jsx';
import { ProfileDetails } from '../components/ProfileDetails.jsx';
import { MatchOverlay } from '../components/dialogs.jsx';
import { Avatar, DemoBadge, Modal, Spinner } from '../components/ui.jsx';

function hoursLeft(ts) {
  return Math.max(1, Math.round((ts - Date.now()) / 3_600_000));
}

function Question({ q, answer, importance, onChange }) {
  const value = answer?.value;
  const selected = (id) => (q.type === 'multi' ? value?.includes(id) : value === id);

  function pick(id) {
    if (q.type === 'multi') {
      const current = value ?? [];
      const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id].slice(-q.max);
      onChange(next.length ? { value: next, importance: answer?.importance ?? 'importa' } : null);
    } else {
      onChange(value === id ? null : { value: id, importance: answer?.importance ?? 'importa' });
    }
  }

  return (
    <div className={`ac-question ${answer ? 'answered' : ''}`}>
      <div className="ac-q-head">
        <strong>{q.text}</strong>
        {q.type === 'multi' && <small className="hint">hasta {q.max}</small>}
        {q.sensitive && (
          <span className="badge" title="Nunca se muestra a nadie: solo cuenta para la afinidad">
            <Lock size={11} /> Privado
          </span>
        )}
      </div>
      <div className="chips">
        {q.options.map((o) => (
          <button
            type="button"
            key={o.id}
            className={`chip chip-sm ${selected(o.id) ? 'selected' : ''}`}
            aria-pressed={selected(o.id)}
            onClick={() => pick(o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>
      {answer && (
        <div className="ac-importance" role="radiogroup" aria-label={`Cuánto te importa: ${q.text}`}>
          <span>¿Cuánto te importa coincidir?</span>
          <div className="segmented mini">
            {importance.map((i) => (
              <button
                type="button"
                key={i.id}
                role="radio"
                aria-checked={answer.importance === i.id}
                className={answer.importance === i.id ? 'active' : ''}
                onClick={() => onChange({ ...answer, importance: i.id })}
              >
                {i.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ProposalCard({ p, onRespond, onProfile }) {
  return (
    <article className="autocita-card">
      <div className="ac-top">
        <button className="ac-who" onClick={onProfile} aria-label={`Ver el perfil de ${p.user.name}`}>
          <Avatar user={p.user} size={64} />
          <span>
            <strong>
              {p.user.name}, {p.user.age} {p.user.isDemo && <DemoBadge />}
            </strong>
            <small>
              <MapPin size={13} /> {p.user.city}
              {p.user.distanceKm != null && ` · a ${p.user.distanceKm} km`}
            </small>
          </span>
        </button>
        <div className="ac-score">
          <strong>{p.score}%</strong>
          <small>afinidad</small>
        </div>
      </div>
      {p.reasons.length > 0 && (
        <ul className="ac-reasons">
          {p.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      <div className="ac-plan">
        <span className="eyebrow">✨ Plan propuesto</span>
        <p>
          {p.plan.idea.charAt(0).toUpperCase() + p.plan.idea.slice(1)}
          {p.plan.because && <span className="muted"> (porque {p.plan.because})</span>}.
        </p>
      </div>
      {p.myResponse === 'yes' ? (
        <p className="ac-waiting">
          🙌 Te has apuntado. Si {p.user.name} también se apunta, os abrimos el chat y buscamos hora. Caduca en{' '}
          {hoursLeft(p.expiresAt)} h.
        </p>
      ) : (
        <div className="ac-actions">
          <button className="btn btn-sm" onClick={() => onRespond('no')}>
            No, gracias
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => onRespond('yes')}>
            ¡Me apunto!
          </button>
        </div>
      )}
    </article>
  );
}

export function Autocitas() {
  const { refreshCounts } = useRealtime();
  const toast = useToast();
  const [state, setState] = useState(null);
  const [answers, setAnswers] = useState({});
  const [enabled, setEnabled] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [profile, setProfile] = useState(null);
  const [confirmed, setConfirmed] = useState(null);

  const apply = useCallback((s, { keepForm = false } = {}) => {
    setState(s);
    if (!keepForm) {
      setAnswers(s.answers);
      setEnabled(s.enabled);
      setDirty(false);
    }
  }, []);

  const load = useCallback(
    (opts) => api.get('/api/autocitas').then((s) => apply(s, opts), (err) => toast(err.message, { type: 'error' })),
    [apply, toast],
  );

  useEffect(() => {
    load();
  }, [load]);
  useSocketEvent('autocita:new', () => load({ keepForm: dirty }));
  useSocketEvent('autocita:changed', () => load({ keepForm: dirty }));

  const groups = useMemo(() => {
    if (!state) return [];
    return [
      { id: 'gustos', title: 'Tus gustos', questions: state.questions.filter((q) => q.group === 'gustos') },
      {
        id: 'valores',
        title: 'Lo que piensas',
        note: 'Política, religión y otros temas personales son privados: nunca se muestran a nadie, solo cuentan para la afinidad. Siempre puedes elegir «Prefiero no decirlo».',
        questions: state.questions.filter((q) => q.group === 'valores'),
      },
    ];
  }, [state]);

  function setAnswer(id, answer) {
    setAnswers((a) => {
      const next = { ...a };
      if (answer) next[id] = answer;
      else delete next[id];
      return next;
    });
    setDirty(true);
  }

  async function save(nextEnabled = enabled) {
    setBusy(true);
    try {
      const res = await api.put('/api/autocitas', { enabled: nextEnabled, answers });
      apply(res);
      refreshCounts();
      if (res.created > 0) {
        toast(`✨ ¡Sparka te ha encontrado ${res.created === 1 ? 'una autocita' : `${res.created} autocitas`}!`, {
          type: 'match',
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (nextEnabled) {
        toast('Guardado. Te avisaremos en cuanto alguien encaje contigo al 65 % o más.', { type: 'success' });
      } else {
        toast('Guardado. Las Autocitas están desactivadas.');
      }
    } catch (err) {
      toast(err.message, { type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function respond(p, answer) {
    try {
      const res = await api.post(`/api/autocitas/${p.id}/respond`, { answer });
      if (res.matched) setConfirmed(res.match);
      else if (answer === 'no') toast('Hecho. Nadie sabrá que dijiste que no.');
      refreshCounts();
      load({ keepForm: dirty });
    } catch (err) {
      toast(err.message, { type: 'error' });
      load({ keepForm: dirty });
    }
  }

  if (!state) return <Spinner />;
  const answered = Object.keys(answers).length;
  const total = state.questions.length;
  const enough = answered >= state.minAnswers;

  return (
    <div className="autocitas">
      <header className="page-header">
        <h1>Autocitas</h1>
        <span className="badge badge-brand">Solo en Sparka</span>
      </header>
      <p className="page-sub">
        Cuéntanos tus gustos y lo que piensas. Cuando alguien encaje contigo al <strong>{state.threshold} % o más</strong>,
        Sparka os propone una cita con plan incluido. Si los dos os apuntáis, os abrimos el chat y buscamos hora.
      </p>

      {state.proposals.length > 0 && (
        <section className="ac-proposals" aria-label="Tus autocitas">
          <h2 className="section-title">Tus autocitas</h2>
          {state.proposals.map((p) => (
            <ProposalCard key={p.id} p={p} onRespond={(a) => respond(p, a)} onProfile={() => setProfile(p.user)} />
          ))}
          <small className="hint">Tu respuesta es secreta: si no os apuntáis los dos, la propuesta desaparece y ya está.</small>
        </section>
      )}

      <section className="card ac-switch">
        <label className="switch" style={{ padding: 0 }}>
          <span>
            <strong>Activar Autocitas</strong>
            <br />
            <small className="muted">
              {enabled
                ? 'Activadas: buscamos a gente compatible cerca de ti.'
                : 'Desactivadas: nadie te verá aquí ni recibirás propuestas.'}
            </small>
          </span>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => {
              setEnabled(e.target.checked);
              setDirty(true);
            }}
          />
        </label>
        <div className="ac-progress">
          <div className="progress">
            <div style={{ width: `${(answered / total) * 100}%` }} />
          </div>
          <small className="hint">
            {answered}/{total} respondidas {enough ? '· ¡suficiente para buscar!' : `· mínimo ${state.minAnswers}`}
          </small>
        </div>
      </section>

      {groups.map((g) => (
        <section className="ac-group" key={g.id}>
          <h2>{g.title}</h2>
          {g.note && (
            <p className="ac-note">
              <Lock size={14} /> {g.note}
            </p>
          )}
          {g.questions.map((q) => (
            <Question
              key={q.id}
              q={q}
              answer={answers[q.id]}
              importance={state.importance}
              onChange={(a) => setAnswer(q.id, a)}
            />
          ))}
        </section>
      ))}

      <div className="sticky-save">
        <button
          className="btn btn-primary"
          style={{ minWidth: 260 }}
          disabled={busy || (!dirty && state.enabled === enabled) || (enabled && !enough)}
          onClick={() => save()}
        >
          {enabled ? (enough ? 'Guardar y buscar autocitas' : `Responde ${state.minAnswers - answered} más`) : 'Guardar'}
        </button>
      </div>

      <details className="how">
        <summary>¿Cómo se calcula la afinidad?</summary>
        <ol>
          <li>Comparamos cada respuesta: lo parecido suma más que lo lejano (centro-izquierda está más cerca de izquierda que de derecha).</li>
          <li>Cada persona decide cuánto le importa cada tema. Lo que marques como «imprescindible» y no coincida, descarta la cita.</li>
          <li>Tiene que encajar para los dos: combinamos lo que le importa a cada cual, no solo a uno.</li>
          <li>Si llegáis al {state.threshold} %, os proponemos la cita. Como mucho tendrás 3 propuestas abiertas, para que sean especiales.</li>
        </ol>
      </details>

      {profile && (
        <Modal title="" onClose={() => setProfile(null)}>
          <ProfileDetails profile={profile} />
        </Modal>
      )}
      {confirmed && (
        <MatchOverlay
          match={confirmed}
          title="¡Autocita confirmada!"
          subtitle={`A ${confirmed.user.name} y a ti os encaja el plan. Ahora, marcad en secreto cuándo podéis.`}
          cta="Ir al chat y cuadrar la hora"
          onClose={() => setConfirmed(null)}
        />
      )}
    </div>
  );
}
