import { useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useMeta } from '../lib/meta.jsx';
import { useToast } from '../lib/toast.jsx';

/** Filtros de descubrimiento. En Sparka todos los filtros son gratis. */
export function FiltersForm({ onSaved, submitLabel = 'Aplicar filtros' }) {
  const { me, setMe } = useAuth();
  const { intentions, limits } = useMeta();
  const toast = useToast();
  const [prefs, setPrefs] = useState(me.preferences);
  const [busy, setBusy] = useState(false);
  const set = (patch) => setPrefs((p) => ({ ...p, ...patch }));
  const toggleIntention = (id) =>
    set({ intentions: prefs.intentions.includes(id) ? prefs.intentions.filter((x) => x !== id) : [...prefs.intentions, id] });

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      setMe(await api.put('/api/me/preferences', prefs));
      onSaved?.();
    } catch (err) {
      toast(err.message, { type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save}>
      <div className="field">
        <span className="label">Distancia máxima</span>
        <div className="range-row">
          <input
            type="range"
            min={1}
            max={limits.maxDistanceKm}
            value={prefs.maxDistanceKm}
            onChange={(e) => set({ maxDistanceKm: Number(e.target.value) })}
            aria-label="Distancia máxima en km"
          />
          <output>{prefs.maxDistanceKm} km</output>
        </div>
      </div>
      <div className="field">
        <span className="label">Edad</span>
        <div className="range-row">
          <span className="hint" style={{ width: 48 }}>Desde</span>
          <input
            type="range"
            min={limits.minAge}
            max={limits.maxAge}
            value={prefs.ageMin}
            onChange={(e) => {
              const v = Number(e.target.value);
              set({ ageMin: v, ageMax: Math.max(v, prefs.ageMax) });
            }}
            aria-label="Edad mínima"
          />
          <output>{prefs.ageMin}</output>
        </div>
        <div className="range-row">
          <span className="hint" style={{ width: 48 }}>Hasta</span>
          <input
            type="range"
            min={limits.minAge}
            max={limits.maxAge}
            value={prefs.ageMax}
            onChange={(e) => {
              const v = Number(e.target.value);
              set({ ageMax: v, ageMin: Math.min(v, prefs.ageMin) });
            }}
            aria-label="Edad máxima"
          />
          <output>{prefs.ageMax === limits.maxAge ? `${prefs.ageMax}+` : prefs.ageMax}</output>
        </div>
      </div>
      <div className="field">
        <span className="label">Solo personas que buscan…</span>
        <div className="chips">
          {intentions.map((i) => (
            <button
              type="button"
              key={i.id}
              aria-pressed={prefs.intentions.includes(i.id)}
              className={`chip chip-sm ${prefs.intentions.includes(i.id) ? 'selected' : ''}`}
              onClick={() => toggleIntention(i.id)}
            >
              {i.emoji} {i.label}
            </button>
          ))}
        </div>
        <small className="hint">Sin seleccionar = cualquier intención.</small>
      </div>
      <label className="switch">
        <span>
          <strong>Modo incógnito</strong>
          <br />
          <small className="muted">Solo te verán las personas a las que tú des like.</small>
        </span>
        <input type="checkbox" checked={prefs.incognito} onChange={(e) => set({ incognito: e.target.checked })} />
      </label>
      <button className="btn btn-primary btn-block" disabled={busy} style={{ marginTop: 8 }}>
        {submitLabel}
      </button>
    </form>
  );
}
