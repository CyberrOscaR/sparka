import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useMeta } from '../lib/meta.jsx';
import { useToast } from '../lib/toast.jsx';
import { Avatar, Modal } from './ui.jsx';

/** Pantalla de "¡Es un match!". */
export function MatchOverlay({ match, onClose }) {
  const { me } = useAuth();
  const navigate = useNavigate();
  const self = { id: me.id, name: me.profile.name, photo: me.photos[0]?.url };
  return (
    <div className="match-overlay" role="dialog" aria-modal="true" aria-labelledby="match-title">
      <div>
        <h2 id="match-title">¡Es un match!</h2>
        <p>A {match.user.name} y a ti os gustáis. ¡Rompe el hielo!</p>
        <div className="match-avatars">
          <Avatar user={self} size={128} />
          <Avatar user={match.user} size={128} />
        </div>
        <div style={{ display: 'grid', gap: 12, justifyItems: 'center' }}>
          <button className="btn btn-light" onClick={() => navigate(`/chat/${match.id}`)} autoFocus>
            Enviar un mensaje
          </button>
          <button className="btn btn-outline" onClick={onClose}>
            Seguir descubriendo
          </button>
        </div>
      </div>
    </div>
  );
}

/** Like o Chispa con mensaje opcional (p. ej. comentando una respuesta del perfil). */
export function MessageLikeDialog({ profile, prompt, spark, onSend, onClose }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const title = spark ? `Enviar una Chispa a ${profile.name} ✨` : `Comentar a ${profile.name}`;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    const message = text.trim() ? (prompt ? `Sobre "${prompt.question}" → ${text.trim()}` : text.trim()) : undefined;
    try {
      await onSend(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit}>
        {prompt && (
          <div className="prompt-card" style={{ marginBottom: 12 }}>
            <p className="q">{prompt.question}</p>
            <p className="a">{prompt.answer}</p>
          </div>
        )}
        {spark && (
          <p className="muted" style={{ marginTop: 0 }}>
            Las Chispas destacan tu like. Tienes 3 al día, gratis. Un mensaje personal multiplica tus opciones.
          </p>
        )}
        <label className="field">
          <span>Tu mensaje {spark ? '(opcional)' : ''}</span>
          <textarea
            className="textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={240}
            placeholder={prompt ? '¡Yo también! Cuéntame más…' : 'Algo que te haya llamado la atención de su perfil…'}
            autoFocus
          />
        </label>
        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" disabled={busy || (!spark && !text.trim())}>
            {spark ? 'Enviar Chispa' : 'Enviar like con mensaje'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Bloquear o denunciar. Denunciar siempre bloquea también. */
export function ReportDialog({ user, onDone, onClose }) {
  const { reportReasons } = useMeta();
  const toast = useToast();
  const [mode, setMode] = useState('choose');
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);

  async function run(fn, message) {
    setBusy(true);
    try {
      await fn();
      toast(message, { type: 'success' });
      onDone();
    } catch (err) {
      toast(err.message, { type: 'error' });
      setBusy(false);
    }
  }

  const block = () => run(() => api.post(`/api/users/${user.id}/block`), `Has bloqueado a ${user.name}.`);
  const report = (e) => {
    e.preventDefault();
    run(
      () => api.post(`/api/users/${user.id}/report`, { reason, details }),
      'Gracias por avisar. Revisaremos la denuncia y ya no os veréis.',
    );
  };

  return (
    <Modal title={mode === 'choose' ? `¿Qué quieres hacer con ${user.name}?` : `Denunciar a ${user.name}`} onClose={onClose}>
      {mode === 'choose' ? (
        <div style={{ display: 'grid', gap: 10 }}>
          <p className="muted" style={{ marginTop: 0 }}>
            Ninguna de las dos opciones avisa a {user.name}. Simplemente dejaréis de veros.
          </p>
          <button className="btn btn-block" onClick={block} disabled={busy}>
            Bloquear
          </button>
          <button className="btn btn-block btn-danger" onClick={() => setMode('report')} disabled={busy}>
            Denunciar
          </button>
        </div>
      ) : (
        <form onSubmit={report}>
          <div className="option-cards" style={{ marginBottom: 16 }}>
            {reportReasons.map((r) => (
              <button
                type="button"
                key={r.id}
                className={`option-card ${reason === r.id ? 'selected' : ''}`}
                onClick={() => setReason(r.id)}
                aria-pressed={reason === r.id}
              >
                {r.label}
              </button>
            ))}
          </div>
          <label className="field">
            <span>Detalles (opcional)</span>
            <textarea className="textarea" value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} />
          </label>
          <div className="modal-foot">
            <button type="button" className="btn btn-ghost" onClick={() => setMode('choose')}>
              Atrás
            </button>
            <button className="btn btn-primary" disabled={!reason || busy}>
              Enviar denuncia
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export function ConfirmDialog({ title, children, confirmLabel, danger, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="muted">{children}</div>
    </Modal>
  );
}
