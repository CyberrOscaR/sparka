import { useCallback, useEffect, useState } from 'react';
import { Lock, Pencil, Sparkles } from 'lucide-react';
import { api } from '../lib/api.js';
import { useMeta } from '../lib/meta.jsx';
import { useRealtime, useSocketEvent } from '../lib/realtime.jsx';
import { useToast } from '../lib/toast.jsx';
import { BlindReveal } from '../components/BlindReveal.jsx';
import { Empty, Spinner } from '../components/ui.jsx';

function countdown(ms) {
  const total = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

export function Blind() {
  const { intentionById } = useMeta();
  const { refreshCounts } = useRealtime();
  const toast = useToast();
  const [state, setState] = useState(null);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(() => {
    api.get('/api/blind').then(setState, (err) => toast(err.message, { type: 'error' }));
  }, [toast]);

  useEffect(load, [load]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  // A medianoche (UTC) llega una pregunta nueva.
  useEffect(() => {
    if (state && now >= state.resetsAt) load();
  }, [now, state, load]);

  useSocketEvent('blind:liked', ({ likes }) => {
    setState((s) => (s?.myAnswer ? { ...s, myAnswer: { ...s.myAnswer, likes } } : s));
  });
  // Un match a ciegas provocado por la otra persona: lo quitamos del feed (la revelación la muestra la app).
  useSocketEvent('match:new', ({ source }) => source === 'blind' && load());

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      setState(await api.put('/api/blind/answer', { body: draft }));
      setEditing(false);
      refreshCounts();
    } catch (err) {
      toast(err.message, { type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function toggle(item) {
    const setLiked = (liked) =>
      setState((s) => ({ ...s, feed: s.feed.map((f) => (f.id === item.id ? { ...f, liked } : f)) }));
    setLiked(!item.liked);
    try {
      if (item.liked) {
        await api.del(`/api/blind/answers/${item.id}/like`);
        return;
      }
      const res = await api.post(`/api/blind/answers/${item.id}/like`);
      if (res.matched) {
        setReveal(res.match);
        refreshCounts();
        load();
      }
    } catch (err) {
      setLiked(item.liked);
      toast(err.message, { type: 'error' });
    }
  }

  if (!state) return <Spinner />;
  const { question, myAnswer, feed, nearbyCount } = state;
  const showForm = !myAnswer || editing;

  return (
    <div className="blind">
      <header className="page-header">
        <h1>A ciegas</h1>
        <span className="badge badge-brand">Solo en Sparka</span>
      </header>
      <p className="page-sub">
        Sin fotos ni nombres: solo lo que piensa la gente. Si os encantan vuestras respuestas, hacéis match… y os
        revelamos.
      </p>

      <section className="question-card">
        <span className="eyebrow">🙈 Pregunta del día</span>
        <h2>{question.text}</h2>
        <small>Nueva pregunta en {countdown(state.resetsAt - now)}</small>
      </section>

      {showForm ? (
        <form className="card answer-form" onSubmit={submit}>
          <label className="field" style={{ margin: 0 }}>
            <span>Tu respuesta</span>
            <textarea
              className="textarea"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={280}
              placeholder="Sé tú: lo divertido, lo sincero y lo raro funcionan mejor que lo perfecto."
              autoFocus={editing}
            />
          </label>
          <div className="answer-form-foot">
            <small className="hint">Se publica sin tu nombre ni tus fotos. {draft.length}/280</small>
            <div style={{ display: 'flex', gap: 8 }}>
              {editing && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>
                  Cancelar
                </button>
              )}
              <button className="btn btn-primary btn-sm" disabled={busy || draft.trim().length < 3}>
                {editing ? 'Guardar' : 'Publicar respuesta'}
              </button>
            </div>
          </div>
        </form>
      ) : (
        <section className="my-answer">
          <div>
            <span className="eyebrow">Tu respuesta de hoy</span>
            <p>“{myAnswer.body}”</p>
          </div>
          <div className="my-answer-foot">
            <span className={`spark-total ${myAnswer.likes ? 'on' : ''}`}>
              <Sparkles size={16} />
              {myAnswer.likes === 0
                ? 'Aún sin chispas. Paciencia: el día es largo.'
                : `A ${myAnswer.likes} ${myAnswer.likes === 1 ? 'persona le encanta' : 'personas les encanta'} tu respuesta`}
            </span>
            {myAnswer.likes === 0 && (
              <button
                className="icon-btn"
                aria-label="Editar respuesta"
                onClick={() => {
                  setDraft(myAnswer.body);
                  setEditing(true);
                }}
              >
                <Pencil size={18} />
              </button>
            )}
          </div>
          {myAnswer.likes > 0 && (
            <small className="hint">
              ¿Quién será? Si le das chispa a su respuesta, haréis match. Si no, nunca lo sabréis.
            </small>
          )}
        </section>
      )}

      {!feed ? (
        <div className="blind-locked">
          <div className="blind-ghosts" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div className="blind-card ghost" key={i}>
                <span />
                <span />
                <span />
              </div>
            ))}
          </div>
          <div className="blind-lock-msg">
            <Lock size={22} />
            <strong>
              {nearbyCount > 0
                ? `${nearbyCount} ${nearbyCount === 1 ? 'persona cerca ya ha respondido' : 'personas cerca ya han respondido'}`
                : 'Sé de las primeras personas en responder'}
            </strong>
            <span>Responde tú para leer sus respuestas.</span>
          </div>
        </div>
      ) : feed.length === 0 ? (
        <Empty emoji="🌙" title="Aún nadie cerca ha respondido hoy">
          Vuelve en un rato: las respuestas van llegando durante el día.
        </Empty>
      ) : (
        <section className="blind-feed" aria-label="Respuestas anónimas">
          {feed.map((item) => {
            const intention = intentionById[item.intention];
            return (
              <article className={`blind-card ${item.liked ? 'liked' : ''}`} key={item.id}>
                <p className="blind-body">“{item.body}”</p>
                <footer>
                  <span className="blind-meta">
                    {item.age} años · a {item.distanceKm} km
                    {intention && ` · ${intention.emoji} ${intention.label}`}
                    {item.sharedInterests > 0 &&
                      ` · ${item.sharedInterests} ${item.sharedInterests === 1 ? 'interés' : 'intereses'} en común`}
                  </span>
                  <button
                    className={`spark-btn ${item.liked ? 'on' : ''}`}
                    aria-pressed={item.liked}
                    onClick={() => toggle(item)}
                  >
                    <Sparkles size={16} /> {item.liked ? 'Te encanta' : 'Me encanta'}
                  </button>
                </footer>
              </article>
            );
          })}
        </section>
      )}

      <details className="how">
        <summary>¿Cómo funciona “A ciegas”?</summary>
        <ol>
          <li>Cada día hay una pregunta nueva, la misma para todo el mundo.</li>
          <li>Responde y podrás leer las respuestas de gente cercana: sin fotos, sin nombres.</li>
          <li>Dale una chispa ✨ a las respuestas que te enamoren. Es secreto.</li>
          <li>Si a esa persona también le encanta la tuya: ¡match a ciegas! Os revelamos y empezáis a hablar.</li>
          <li>Si no es mutuo, nadie sabrá nunca quién fuiste. Y sí: puede aparecer gente que descartaste por una foto.</li>
        </ol>
      </details>

      {reveal && <BlindReveal match={reveal} onClose={() => setReveal(null)} />}
    </div>
  );
}
