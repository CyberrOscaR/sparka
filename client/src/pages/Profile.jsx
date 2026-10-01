import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../lib/toast.jsx';
import { FiltersForm } from '../components/Filters.jsx';
import { ProfileDetails } from '../components/ProfileDetails.jsx';
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
import { Modal } from '../components/ui.jsx';

const TABS = [
  ['preview', 'Vista previa'],
  ['edit', 'Editar'],
  ['settings', 'Ajustes'],
];

export function Profile() {
  const { me } = useAuth();
  const [tab, setTab] = useState('preview');
  return (
    <>
      <header className="page-header">
        <h1>Mi perfil</h1>
      </header>
      <div className="segmented" role="tablist" style={{ marginBottom: 20 }}>
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'preview' && (
        <>
          <p className="muted" style={{ marginTop: 0 }}>
            Así te ven los demás.
          </p>
          <ProfileDetails profile={me.preview} />
        </>
      )}
      {tab === 'edit' && <EditProfile onSaved={() => setTab('preview')} />}
      {tab === 'settings' && <Settings />}
    </>
  );
}

function EditProfile({ onSaved }) {
  const { me, setMe } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState(() => formFromMe(me));
  const [busy, setBusy] = useState(false);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const { location, ...rest } = form;
      const payload = { ...rest, prompts: rest.prompts.filter((p) => p.answer.trim()) };
      if (location) payload.location = location;
      setMe(await api.put('/api/me/profile', payload));
      toast('Perfil guardado', { type: 'success' });
      onSaved();
    } catch (err) {
      toast(err.message, { type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save}>
      <section className="edit-section">
        <h2>Fotos</h2>
        <PhotosField photos={me.photos} onChange={setMe} />
      </section>
      <section className="edit-section">
        <h2>Sobre ti</h2>
        <BasicsFields value={form} set={set} />
        <AboutFields value={form} set={set} />
      </section>
      <section className="edit-section">
        <h2>Lo que buscas</h2>
        <LookingForFields value={form} set={set} />
      </section>
      <section className="edit-section">
        <h2>Preguntas</h2>
        <PromptsField value={form} set={set} />
      </section>
      <section className="edit-section">
        <h2>Intereses</h2>
        <InterestsField value={form} set={set} />
      </section>
      <section className="edit-section">
        <h2>Ubicación</h2>
        <LocationField value={form} set={set} currentCity={me.profile.city} />
      </section>
      <div className="sticky-save">
        <button className="btn btn-primary" disabled={busy} style={{ minWidth: 240 }}>
          Guardar cambios
        </button>
      </div>
    </form>
  );
}

function Settings() {
  const { me, logout } = useAuth();
  const toast = useToast();
  const [deleting, setDeleting] = useState(false);
  const [password, setPassword] = useState('');

  async function deleteAccount(e) {
    e.preventDefault();
    try {
      await api.del('/api/me', { password });
      toast('Tu cuenta y todos tus datos se han borrado.');
      location.href = '/';
    } catch (err) {
      toast(err.message, { type: 'error' });
    }
  }

  return (
    <div className="settings-list">
      <section className="card">
        <h2>Preferencias de descubrimiento</h2>
        <FiltersForm submitLabel="Guardar preferencias" onSaved={() => toast('Preferencias guardadas', { type: 'success' })} />
      </section>

      <section className="card">
        <h2>Por qué Sparka es gratis</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Creemos que conocer gente no debería depender de tu tarjeta. Sparka es software libre: sin suscripciones, sin
          “boosts” y sin vender tus datos. Todas las funciones son para todo el mundo.
        </p>
        <h2>Consejos de seguridad</h2>
        <ul className="muted" style={{ paddingLeft: 18, margin: 0, lineHeight: 1.6 }}>
          <li>Queda la primera vez en un sitio público y cuéntaselo a alguien de confianza.</li>
          <li>Nunca envíes dinero, códigos ni datos bancarios a alguien que no conoces en persona.</li>
          <li>Si algo te incomoda, bloquea o denuncia: la otra persona no recibe ningún aviso.</li>
        </ul>
      </section>

      <section className="card">
        <h2>Cuenta</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Sesión iniciada como <strong>{me.email}</strong>
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn" onClick={logout}>
            <LogOut size={18} /> Cerrar sesión
          </button>
          <button className="btn btn-danger" onClick={() => setDeleting(true)}>
            Borrar mi cuenta
          </button>
        </div>
      </section>

      {deleting && (
        <Modal title="Borrar tu cuenta" onClose={() => setDeleting(false)}>
          <form onSubmit={deleteAccount}>
            <p className="muted" style={{ marginTop: 0 }}>
              Se borrarán tu perfil, fotos, matches y mensajes de forma permanente. No se puede deshacer.
            </p>
            <label className="field">
              <span>Escribe tu contraseña para confirmar</span>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            <div className="modal-foot">
              <button type="button" className="btn btn-ghost" onClick={() => setDeleting(false)}>
                Cancelar
              </button>
              <button className="btn btn-danger" disabled={!password}>
                Borrar definitivamente
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
