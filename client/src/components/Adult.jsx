import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useMeta } from '../lib/meta.jsx';
import { useToast } from '../lib/toast.jsx';

const CONDITIONS = [
  'Tengo 18 años o más.',
  'Quiero ver y hablar de sexo sin filtros con personas que también hayan activado el Modo +18.',
  'Entiendo que nada vale sin consentimiento: si alguien dice que no o para, se para.',
  'No compartiré contenido íntimo de otras personas sin su permiso.',
];

/** Activar/desactivar el Modo +18 y editar tu lado picante. */
export function AdultSection() {
  const { me, setMe } = useAuth();
  const { adult: catalog } = useMeta();
  const toast = useToast();
  const [checks, setChecks] = useState(() => CONDITIONS.map(() => false));
  const [form, setForm] = useState(() => ({
    orientation: me.adult.orientation,
    lookingFor: me.adult.lookingFor,
    prompts: me.adult.prompts,
  }));
  const [busy, setBusy] = useState(false);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  async function send(body, message) {
    setBusy(true);
    try {
      setMe(await api.put('/api/me/adult', body));
      toast(message, { type: 'success' });
    } catch (err) {
      toast(err.message, { type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  if (!me.adult.enabled) {
    return (
      <section className="card adult-card">
        <h2>🌶️ Modo +18</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Para hablar de sexo con naturalidad y sin tabúes. Al activarlo podrás mostrar tu lado picante (orientación, qué
          buscas en lo íntimo, preguntas atrevidas), responder la parte íntima de las Autocitas y chatear sin filtros con
          otras personas que también lo tengan. Quien no lo active nunca verá nada de esto.
        </p>
        <div className="adult-conditions">
          {CONDITIONS.map((text, i) => (
            <label key={text}>
              <input
                type="checkbox"
                checked={checks[i]}
                onChange={(e) => setChecks((c) => c.map((v, j) => (i === j ? e.target.checked : v)))}
              />
              {text}
            </label>
          ))}
        </div>
        <button
          className="btn btn-primary"
          disabled={busy || !checks.every(Boolean)}
          onClick={() => send({ enabled: true, consent: true }, '🌶️ Modo +18 activado')}
        >
          Activar Modo +18
        </button>
      </section>
    );
  }

  const togglePick = (id) =>
    set({
      lookingFor: form.lookingFor.includes(id)
        ? form.lookingFor.filter((x) => x !== id)
        : [...form.lookingFor, id].slice(-catalog.limits.maxLookingFor),
    });
  const used = new Set(form.prompts.map((p) => p.id));
  const updatePrompt = (i, patch) => set({ prompts: form.prompts.map((p, j) => (i === j ? { ...p, ...patch } : p)) });

  return (
    <section className="card adult-card on">
      <div className="adult-head">
        <h2>🌶️ Modo +18 activado</h2>
        <button className="btn btn-sm" disabled={busy} onClick={() => send({ enabled: false }, 'Modo +18 desactivado')}>
          Desactivar
        </button>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        Tu lado picante solo lo ven personas que también tienen el Modo +18. Con ellas, el chat va sin filtros.
      </p>

      <label className="field">
        <span>Orientación</span>
        <select
          className="select"
          value={form.orientation ?? ''}
          onChange={(e) => set({ orientation: e.target.value || null })}
        >
          <option value="">Prefiero no decirlo</option>
          {catalog.orientations.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <div className="field">
        <span className="label">En lo íntimo busco…</span>
        <div className="chips">
          {catalog.lookingFor.map((o) => (
            <button
              type="button"
              key={o.id}
              className={`chip chip-sm ${form.lookingFor.includes(o.id) ? 'selected' : ''}`}
              aria-pressed={form.lookingFor.includes(o.id)}
              onClick={() => togglePick(o.id)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="label">Preguntas picantes</span>
        {form.prompts.map((p, i) => (
          <div className="prompt-editor" key={i} style={{ marginBottom: 10 }}>
            <header>
              <select
                className="select"
                value={p.id}
                onChange={(e) => updatePrompt(i, { id: e.target.value })}
                aria-label="Pregunta picante"
              >
                {catalog.prompts
                  .filter((q) => q.id === p.id || !used.has(q.id))
                  .map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.text}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                className="icon-btn"
                aria-label="Quitar pregunta"
                onClick={() => set({ prompts: form.prompts.filter((_, j) => j !== i) })}
              >
                <Trash2 size={18} />
              </button>
            </header>
            <textarea
              className="textarea"
              value={p.answer}
              maxLength={200}
              onChange={(e) => updatePrompt(i, { answer: e.target.value })}
              placeholder="Sin tabúes…"
              aria-label="Respuesta picante"
            />
          </div>
        ))}
        {form.prompts.length < catalog.limits.maxPrompts && (
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              const next = catalog.prompts.find((q) => !used.has(q.id));
              if (next) set({ prompts: [...form.prompts, { id: next.id, answer: '' }] });
            }}
          >
            <Plus size={16} /> Añadir pregunta picante
          </button>
        )}
      </div>

      <button
        className="btn btn-primary"
        disabled={busy}
        onClick={() =>
          send(
            { ...form, prompts: form.prompts.filter((p) => p.answer.trim()) },
            'Tu lado picante se ha guardado 🌶️',
          )
        }
      >
        Guardar lado picante
      </button>
    </section>
  );
}

/** El lado picante dentro del perfil de otra persona (solo llega si las dos tenéis el Modo +18). */
export function AdultProfileBlock({ adult }) {
  const { adult: catalog } = useMeta();
  const orientation = catalog.orientations.find((o) => o.id === adult.orientation);
  const labels = adult.lookingFor.map((id) => catalog.lookingFor.find((o) => o.id === id)?.label).filter(Boolean);
  if (!orientation && labels.length === 0 && adult.prompts.length === 0) return null;
  return (
    <div className="adult-block">
      <h3 className="section-title">🌶️ Lado picante (+18)</h3>
      {orientation && <p className="adult-orientation">{orientation.label}</p>}
      {labels.length > 0 && (
        <div className="chips">
          {labels.map((l) => (
            <span key={l} className="chip chip-sm adult-chip">
              {l}
            </span>
          ))}
        </div>
      )}
      {adult.prompts.map((p) => (
        <div className="prompt-card adult-prompt" key={p.id}>
          <p className="q">{p.question}</p>
          <p className="a">{p.answer}</p>
        </div>
      ))}
    </div>
  );
}
