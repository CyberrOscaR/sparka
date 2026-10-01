import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { shortTime } from '../lib/format.js';
import { useSocketEvent } from '../lib/realtime.jsx';
import { useToast } from '../lib/toast.jsx';
import { Avatar, DemoBadge, Empty, Spinner } from '../components/ui.jsx';

export function Matches() {
  const { me } = useAuth();
  const toast = useToast();
  const [matches, setMatches] = useState(null);

  const load = useCallback(() => {
    api.get('/api/matches').then(
      (r) => setMatches(r.matches),
      (err) => toast(err.message, { type: 'error' }),
    );
  }, [toast]);

  useEffect(load, [load]);
  useSocketEvent('match:new', load);
  useSocketEvent('match:removed', load);
  useSocketEvent('message:new', load);

  if (!matches) return <Spinner />;

  const fresh = matches.filter((m) => !m.lastMessage);
  const convos = matches.filter((m) => m.lastMessage);

  return (
    <>
      <header className="page-header">
        <h1>Matches</h1>
      </header>

      {matches.length === 0 ? (
        <Empty
          emoji="💫"
          title="Aún no tienes matches"
          action={
            <Link className="btn btn-primary" to="/">
              Descubrir gente
            </Link>
          }
        >
          Cuando a alguien que te gusta también le gustes, aparecerá aquí. Echa un vistazo también a “Le gustas”.
        </Empty>
      ) : (
        <>
          {fresh.length > 0 && (
            <section>
              <h2 className="section-title">Nuevos matches</h2>
              <div className="new-matches">
                {fresh.map((m) => (
                  <Link key={m.id} to={`/chat/${m.id}`} className="new-match">
                    <Avatar user={m.user} size={68} />
                    {m.user.name}
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="section-title">Mensajes</h2>
            {convos.length === 0 ? (
              <p className="muted">Rompe el hielo con alguno de tus matches: ¡te sugerimos temas al abrir el chat!</p>
            ) : (
              <div className="convo-list">
                {convos.map((m) => {
                  const mine = m.lastMessage.senderId === me.id;
                  return (
                    <Link key={m.id} to={`/chat/${m.id}`} className={`convo ${m.unread ? 'unread' : ''}`}>
                      <Avatar user={m.user} size={56} />
                      <div className="convo-body">
                        <div className="convo-top">
                          <strong>
                            {m.user.name} {m.user.isDemo && <DemoBadge />}
                          </strong>
                          <time>{shortTime(m.lastMessage.createdAt)}</time>
                        </div>
                        <p className="convo-preview">
                          {mine && 'Tú: '}
                          {m.lastMessage.body}
                        </p>
                      </div>
                      {m.unread > 0 && <span className="unread-dot" aria-label={`${m.unread} sin leer`} />}
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
