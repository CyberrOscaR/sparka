import { useRef, useState } from 'react';
import { Camera, LocateFixed, Plus, Star, Trash2 } from 'lucide-react';
import { api } from '../lib/api.js';
import { useMeta } from '../lib/meta.jsx';
import { useToast } from '../lib/toast.jsx';

// Campos del perfil compartidos entre el onboarding y "Editar perfil".
// Todos reciben `value` (el formulario completo) y `set(patch)`.

export function maxBirthdate() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 18);
  return d.toISOString().slice(0, 10);
}

export function BasicsFields({ value, set }) {
  const { genders } = useMeta();
  return (
    <>
      <label className="field">
        <span>Nombre</span>
        <input
          className="input"
          value={value.name}
          onChange={(e) => set({ name: e.target.value })}
          maxLength={40}
          autoComplete="given-name"
          placeholder="Como quieres que te llamen"
        />
      </label>
      <label className="field">
        <span>Fecha de nacimiento</span>
        <input
          className="input"
          type="date"
          value={value.birthdate}
          max={maxBirthdate()}
          min="1925-01-01"
          onChange={(e) => set({ birthdate: e.target.value })}
        />
        <small className="hint">Solo mostramos tu edad, nunca la fecha.</small>
      </label>
      <div className="field">
        <span className="label">Me identifico como</span>
        <div className="chips" role="radiogroup">
          {genders.map((g) => (
            <button
              type="button"
              key={g.id}
              role="radio"
              aria-checked={value.gender === g.id}
              className={`chip ${value.gender === g.id ? 'selected' : ''}`}
              onClick={() => set({ gender: g.id })}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

export function LookingForFields({ value, set }) {
  const { genders, intentions } = useMeta();
  const toggle = (id) =>
    set({ showMe: value.showMe.includes(id) ? value.showMe.filter((x) => x !== id) : [...value.showMe, id] });
  return (
    <>
      <div className="field">
        <span className="label">Quiero conocer a</span>
        <div className="chips">
          {genders.map((g) => (
            <button
              type="button"
              key={g.id}
              aria-pressed={value.showMe.includes(g.id)}
              className={`chip ${value.showMe.includes(g.id) ? 'selected' : ''}`}
              onClick={() => toggle(g.id)}
            >
              {g.label}
            </button>
          ))}
        </div>
        <small className="hint">Puedes elegir varias opciones.</small>
      </div>
      <div className="field">
        <span className="label">Estoy buscando</span>
        <div className="option-cards" role="radiogroup">
          {intentions.map((i) => (
            <button
              type="button"
              key={i.id}
              role="radio"
              aria-checked={value.intention === i.id}
              className={`option-card ${value.intention === i.id ? 'selected' : ''}`}
              onClick={() => set({ intention: i.id })}
            >
              <span className="emoji" aria-hidden="true">
                {i.emoji}
              </span>
              {i.label}
            </button>
          ))}
        </div>
        <small className="hint">Se muestra en tu perfil: así nadie pierde el tiempo.</small>
      </div>
    </>
  );
}

export function InterestsField({ value, set }) {
  const { interests, limits } = useMeta();
  const selected = value.interests;
  const toggle = (id) => {
    if (selected.includes(id)) set({ interests: selected.filter((x) => x !== id) });
    else if (selected.length < limits.maxInterests) set({ interests: [...selected, id] });
  };
  return (
    <div className="field">
      <div className="counter">
        {selected.length}/{limits.maxInterests} · mínimo {limits.minInterests}
      </div>
      <div className="chips">
        {interests.map((i) => (
          <button
            type="button"
            key={i.id}
            aria-pressed={selected.includes(i.id)}
            className={`chip ${selected.includes(i.id) ? 'selected' : ''}`}
            onClick={() => toggle(i.id)}
            disabled={!selected.includes(i.id) && selected.length >= limits.maxInterests}
          >
            {i.emoji} {i.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function PromptsField({ value, set }) {
  const { prompts, limits } = useMeta();
  const list = value.prompts;
  const used = new Set(list.map((p) => p.id));
  const update = (i, patch) => set({ prompts: list.map((p, j) => (i === j ? { ...p, ...patch } : p)) });
  const add = () => {
    const next = prompts.find((p) => !used.has(p.id));
    if (next) set({ prompts: [...list, { id: next.id, answer: '' }] });
  };
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {list.map((p, i) => (
        <div className="prompt-editor" key={i}>
          <header>
            <select
              className="select"
              value={p.id}
              onChange={(e) => update(i, { id: e.target.value })}
              aria-label="Pregunta"
            >
              {prompts
                .filter((q) => q.id === p.id || !used.has(q.id))
                .map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.text}
                  </option>
                ))}
            </select>
            {list.length > 1 && (
              <button
                type="button"
                className="icon-btn"
                onClick={() => set({ prompts: list.filter((_, j) => j !== i) })}
                aria-label="Quitar pregunta"
              >
                <Trash2 size={18} />
              </button>
            )}
          </header>
          <textarea
            className="textarea"
            value={p.answer}
            onChange={(e) => update(i, { answer: e.target.value })}
            maxLength={200}
            placeholder="Tu respuesta…"
            aria-label="Respuesta"
          />
          <div className="counter">{p.answer.length}/200</div>
        </div>
      ))}
      {list.length < limits.maxPrompts && (
        <button type="button" className="btn" onClick={add}>
          <Plus size={18} /> Añadir otra pregunta
        </button>
      )}
    </div>
  );
}

export function AboutFields({ value, set }) {
  return (
    <>
      <label className="field">
        <span>Sobre ti</span>
        <textarea
          className="textarea"
          value={value.bio}
          onChange={(e) => set({ bio: e.target.value })}
          maxLength={500}
          placeholder="Algo breve y auténtico. Menos es más."
        />
        <div className="counter">{value.bio.length}/500</div>
      </label>
      <label className="field">
        <span>A qué te dedicas (opcional)</span>
        <input className="input" value={value.job} onChange={(e) => set({ job: e.target.value })} maxLength={60} />
      </label>
    </>
  );
}

/** Las fotos se guardan al momento (no esperan a "Guardar"). */
export function PhotosField({ photos, onChange }) {
  const { limits } = useMeta();
  const toast = useToast();
  const input = useRef(null);
  const [busy, setBusy] = useState(false);

  async function upload(file) {
    if (!file) return;
    const form = new FormData();
    form.append('photo', file);
    setBusy(true);
    try {
      onChange(await api.post('/api/me/photos', form));
    } catch (err) {
      toast(err.message, { type: 'error' });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  async function act(fn) {
    try {
      onChange(await fn());
    } catch (err) {
      toast(err.message, { type: 'error' });
    }
  }

  const slots = Array.from({ length: limits.maxPhotos }, (_, i) => photos[i]);
  return (
    <div className="photo-grid">
      {slots.map((p, i) =>
        p ? (
          <div className="photo-slot filled" key={p.id}>
            <img src={p.url} alt={`Tu foto ${i + 1}`} />
            <div className="slot-actions">
              {i > 0 && (
                <button
                  type="button"
                  onClick={() => act(() => api.post(`/api/me/photos/${p.id}/main`))}
                  aria-label="Usar como foto principal"
                  title="Usar como principal"
                >
                  <Star size={15} />
                </button>
              )}
              <button
                type="button"
                onClick={() => act(() => api.del(`/api/me/photos/${p.id}`))}
                aria-label="Borrar foto"
                title="Borrar"
              >
                <Trash2 size={15} />
              </button>
            </div>
            {i === 0 && <span className="badge badge-brand main-tag">Principal</span>}
          </div>
        ) : (
          <div className="photo-slot" key={`empty-${i}`}>
            {i === photos.length && (
              <label aria-label="Añadir foto">
                {busy ? <span className="spinner" /> : i === 0 ? <Camera size={28} /> : <Plus size={28} />}
                <input
                  ref={input}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(e) => upload(e.target.files[0])}
                  disabled={busy}
                />
              </label>
            )}
          </div>
        ),
      )}
    </div>
  );
}

export function LocationField({ value, set, currentCity }) {
  const { cities } = useMeta();
  const toast = useToast();
  const [locating, setLocating] = useState(false);
  const selectedCity = value.location?.city ?? '';

  function locate() {
    if (!navigator.geolocation) return toast('Tu navegador no permite obtener la ubicación.', { type: 'error' });
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        set({ location: { lat: pos.coords.latitude, lng: pos.coords.longitude } });
        toast('Ubicación obtenida. Nunca mostramos tu posición exacta.', { type: 'success' });
      },
      () => {
        setLocating(false);
        toast('No hemos podido obtener tu ubicación. Elige tu ciudad.', { type: 'error' });
      },
      { enableHighAccuracy: false, timeout: 10_000 },
    );
  }

  const countries = [...new Set(cities.map((c) => c.country))];
  return (
    <>
      <button type="button" className="btn btn-block" onClick={locate} disabled={locating}>
        <LocateFixed size={18} /> {locating ? 'Buscando…' : 'Usar mi ubicación actual'}
      </button>
      {value.location?.lat != null && <p className="hint">📍 Ubicación del dispositivo lista.</p>}
      <div className="hint" style={{ textAlign: 'center' }}>o elige tu ciudad</div>
      <select
        className="select"
        value={selectedCity}
        onChange={(e) => set({ location: e.target.value ? { city: e.target.value } : null })}
        aria-label="Ciudad"
      >
        <option value="">{currentCity ? `Actual: ${currentCity}` : 'Selecciona una ciudad…'}</option>
        {countries.map((country) => (
          <optgroup key={country} label={country}>
            {cities
              .filter((c) => c.country === country)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
    </>
  );
}

/** Estado inicial del formulario a partir de /api/me. */
export function formFromMe(me) {
  const p = me.profile;
  return {
    name: p.name ?? '',
    birthdate: p.birthdate ?? '',
    gender: p.gender ?? '',
    showMe: p.showMe ?? [],
    intention: p.intention ?? '',
    bio: p.bio ?? '',
    job: p.job ?? '',
    interests: p.interests ?? [],
    prompts: p.prompts?.length ? p.prompts : [{ id: 'domingo', answer: '' }],
    location: null,
  };
}
