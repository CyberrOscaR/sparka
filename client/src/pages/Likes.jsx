import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useRealtime, useSocketEvent } from '../lib/realtime.jsx';
import { useToast } from '../lib/toast.jsx';
import { ProfileDetails } from '../components/ProfileDetails.jsx';
import { MatchOverlay, ReportDialog } from '../components/dialogs.jsx';
import { Empty, Modal, PhotoPlaceholder, Spinner } from '../components/ui.jsx';

export function Likes() {
  const { refreshCounts } = useRealtime();
  const toast = useToast();
  const [likes, setLikes] = useState(null);
  const [open, setOpen] = useState(null);
  const [match, setMatch] = useState(null);
  const [reportFor, setReportFor] = useState(null);

  const load = useCallback(() => {
    api.get('/api/likes').then(
      (r) => setLikes(r.likes),
      (err) => toast(err.message, { type: 'error' }),
    );
  }, [toast]);

  useEffect(load, [load]);
  useSocketEvent('likes:changed', load);

  async function respond(like, action) {
    setOpen(null);
    setLikes((l) => l.filter((x) => x.profile.id !== like.profile.id));
    try {
      const res = await api.post('/api/swipes', { targetId: like.profile.id, action });
      if (res.matched) setMatch(res.match);
      refreshCounts();
    } catch (err) {
      toast(err.message, { type: 'error' });
      load();
    }
  }

  if (!likes) return <Spinner />;

  return (
    <>
      <header className="page-header">
        <h1>Le gustas</h1>
      </header>
      <div className="likes-banner">
        <span aria-hidden="true">💝</span>
        <span>
          En Sparka puedes ver quién te ha dado like <strong>gratis</strong>. Sin fotos borrosas ni suscripciones.
        </span>
      </div>

      {likes.length === 0 ? (
        <Empty emoji="🌱" title="Todavía no hay likes nuevos">
          Completa tu perfil con fotos y respuestas: los perfiles completos reciben muchos más likes.
        </Empty>
      ) : (
        <div className="likes-grid">
          {likes.map((like) => (
            <button
              key={like.profile.id}
              className={`like-card ${like.superlike ? 'spark' : ''}`}
              onClick={() => setOpen(like)}
              aria-label={`Ver a ${like.profile.name}`}
            >
              {like.profile.photos[0] ? (
                <img className="swipe-photo" src={like.profile.photos[0]} alt="" />
              ) : (
                <PhotoPlaceholder user={like.profile} />
              )}
              {like.superlike && <span className="badge badge-spark" style={{ background: '#fff' }}>✨ Chispa</span>}
              <span className="like-card-info">
                <strong>
                  {like.profile.name}, {like.profile.age}
                </strong>
                {like.profile.compatibility && <small>{like.profile.compatibility.score}% afinidad</small>}
                {like.message && <span className="like-msg">“{like.message}”</span>}
              </span>
            </button>
          ))}
        </div>
      )}

      {open && (
        <Modal title="" onClose={() => setOpen(null)}>
          {open.message && (
            <div className="likes-banner">
              <span aria-hidden="true">{open.superlike ? '✨' : '💌'}</span>
              <span>
                <strong>{open.profile.name}</strong> te dice: “{open.message}”
              </span>
            </div>
          )}
          <ProfileDetails
            profile={open.profile}
            onPass={() => respond(open, 'pass')}
            onLike={() => respond(open, 'like')}
            onReport={() => setReportFor(open.profile)}
          />
        </Modal>
      )}

      {reportFor && (
        <ReportDialog
          user={reportFor}
          onClose={() => setReportFor(null)}
          onDone={() => {
            setReportFor(null);
            setOpen(null);
            load();
            refreshCounts();
          }}
        />
      )}

      {match && <MatchOverlay match={match} onClose={() => setMatch(null)} />}
    </>
  );
}
