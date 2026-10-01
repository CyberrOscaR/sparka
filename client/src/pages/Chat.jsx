import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Ban, EllipsisVertical, HeartCrack, Send, ShieldAlert, User } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { clockTime, longDate } from '../lib/format.js';
import { useMeta } from '../lib/meta.jsx';
import { useRealtime, useSocketEvent } from '../lib/realtime.jsx';
import { useToast } from '../lib/toast.jsx';
import { ProfileDetails } from '../components/ProfileDetails.jsx';
import { ConfirmDialog, ReportDialog } from '../components/dialogs.jsx';
import { Avatar, DemoBadge, Modal, Spinner } from '../components/ui.jsx';

const GROUP_GAP = 5 * 60 * 1000;

function icebreakersFor(user, interestById) {
  const ideas = [];
  for (const id of user.compatibility?.sharedInterests.slice(0, 2) ?? []) {
    const i = interestById[id];
    if (i) ideas.push(`Vi que a ti también te gusta ${i.label.toLowerCase()} ${i.emoji}. ¿Cuál es tu plan favorito?`);
  }
  const prompt = user.prompts[0];
  if (prompt) ideas.push(`Me ha encantado tu respuesta: “${prompt.answer}” ¡Cuéntame más!`);
  ideas.push('Si mañana pudieras estar en cualquier lugar del mundo, ¿dónde estarías?');
  ideas.push('Dos verdades y una mentira: ¡empiezas tú! 😄');
  return ideas.slice(0, 4);
}

export function Chat() {
  const { matchId } = useParams();
  const id = Number(matchId);
  const { me } = useAuth();
  const { interestById } = useMeta();
  const { socket, refreshCounts } = useRealtime();
  const toast = useToast();
  const navigate = useNavigate();
  const [match, setMatch] = useState(null);
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const [menu, setMenu] = useState(false);
  const [dialog, setDialog] = useState(null); // 'profile' | 'unmatch' | 'report' | { offensive: body }
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const typingTimer = useRef(null);
  const lastTypingSent = useRef(0);
  const stickToBottom = useRef(true);

  const markRead = useCallback(() => {
    api.post(`/api/matches/${id}/read`).then(refreshCounts, () => {});
  }, [id, refreshCounts]);

  useEffect(() => {
    let cancelled = false;
    setMatch(null);
    setMessages([]);
    Promise.all([api.get(`/api/matches/${id}`), api.get(`/api/matches/${id}/messages`)]).then(
      ([m, msgs]) => {
        if (cancelled) return;
        setMatch(m);
        setMessages(msgs.messages);
        setHasMore(msgs.hasMore);
        stickToBottom.current = true;
        markRead();
      },
      (err) => {
        if (cancelled) return;
        toast(err.message, { type: 'error' });
        navigate('/matches', { replace: true });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [id, markRead, navigate, toast]);

  // Mantener el scroll abajo cuando llegan mensajes (si ya estábamos abajo).
  useEffect(() => {
    const el = listRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages, typing]);

  useSocketEvent('message:new', (msg) => {
    if (msg.matchId !== id) return;
    setMessages((list) => (list.some((m) => m.id === msg.id) ? list : [...list, msg]));
    if (msg.senderId !== me.id) {
      setTyping(false);
      markRead();
    }
  });
  useSocketEvent('typing', ({ matchId }) => {
    if (matchId !== id) return;
    setTyping(true);
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => setTyping(false), 4000);
  });
  useSocketEvent('message:read', ({ matchId, readAt }) => {
    if (matchId !== id) return;
    setMessages((list) => list.map((m) => (m.senderId === me.id && !m.readAt ? { ...m, readAt } : m)));
  });
  useSocketEvent('match:removed', ({ matchId }) => {
    if (matchId !== id) return;
    toast('Esta conversación ya no está disponible.');
    navigate('/matches', { replace: true });
  });

  useEffect(() => () => clearTimeout(typingTimer.current), []);

  // Cerrar el menú al pulsar fuera.
  useEffect(() => {
    if (!menu) return;
    const close = (e) => !e.target.closest('.menu, [aria-label="Más opciones"]') && setMenu(false);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [menu]);

  async function loadOlder() {
    const el = listRef.current;
    const prevHeight = el.scrollHeight;
    const { messages: older, hasMore: more } = await api.get(`/api/matches/${id}/messages?before=${messages[0].id}`);
    stickToBottom.current = false;
    setMessages((list) => [...older, ...list]);
    setHasMore(more);
    requestAnimationFrame(() => (el.scrollTop = el.scrollHeight - prevHeight));
  }

  async function send(body, confirmed = false) {
    const trimmed = body.trim();
    if (!trimmed) return;
    try {
      const { message } = await api.post(`/api/matches/${id}/messages`, { body: trimmed, confirmed });
      stickToBottom.current = true;
      setMessages((list) => (list.some((m) => m.id === message.id) ? list : [...list, message]));
      setText('');
      setDialog(null);
      inputRef.current?.focus();
    } catch (err) {
      if (err.code === 'confirm_offensive') setDialog({ offensive: trimmed });
      else toast(err.message, { type: 'error' });
    }
  }

  function onType(value) {
    setText(value);
    const now = Date.now();
    if (socket && value && now - lastTypingSent.current > 2500) {
      lastTypingSent.current = now;
      socket.emit('typing', { matchId: id });
    }
  }

  const icebreakers = useMemo(() => (match ? icebreakersFor(match.user, interestById) : []), [match, interestById]);

  if (!match) return <Spinner />;
  const other = match.user;
  const lastMineId = [...messages].reverse().find((m) => m.senderId === me.id)?.id;

  return (
    <div className="chat">
      <header className="chat-header">
        <button className="icon-btn" onClick={() => navigate('/matches')} aria-label="Volver a matches">
          <ArrowLeft size={22} />
        </button>
        <button className="chat-who" onClick={() => setDialog('profile')}>
          <Avatar user={other} size={42} />
          <span style={{ minWidth: 0 }}>
            <strong>
              {other.name} {other.isDemo && <DemoBadge />}
            </strong>
            <small>
              {typing ? 'escribiendo…' : other.activity ? (
                <>
                  <span className="activity-dot" /> {other.activity}
                </>
              ) : (
                `${other.age} años · ${other.city}`
              )}
            </small>
          </span>
        </button>
        <button className="icon-btn" onClick={() => setMenu((v) => !v)} aria-label="Más opciones" aria-expanded={menu}>
          <EllipsisVertical size={22} />
        </button>
        {menu && (
          <div className="menu" role="menu" onClick={() => setMenu(false)}>
            <button role="menuitem" onClick={() => setDialog('profile')}>
              <User size={18} /> Ver perfil
            </button>
            <button role="menuitem" onClick={() => setDialog('unmatch')}>
              <HeartCrack size={18} /> Deshacer match
            </button>
            <button role="menuitem" className="danger" onClick={() => setDialog('report')}>
              <Ban size={18} /> Bloquear o denunciar
            </button>
          </div>
        )}
      </header>

      <div
        className="chat-messages"
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        {hasMore && (
          <button className="btn btn-sm" style={{ alignSelf: 'center' }} onClick={loadOlder}>
            Cargar mensajes anteriores
          </button>
        )}
        <div className="chat-intro">
          <Avatar user={other} size={84} />
          <strong>Hicisteis match el {longDate(match.createdAt)}</strong>
          {!messages.some((m) => m.senderId === me.id) && (
            <>
              <p>
                {messages.length === 0
                  ? 'Rompe el hielo con algo personal. Algunas ideas:'
                  : `${other.name} ya te ha escrito. Algunas ideas para responder:`}
              </p>
              <div className="icebreakers">
                {icebreakers.map((idea) => (
                  <button
                    key={idea}
                    className="icebreaker"
                    onClick={() => {
                      onType(idea);
                      inputRef.current?.focus();
                    }}
                  >
                    {idea}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const next = messages[i + 1];
          const mine = m.senderId === me.id;
          const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
          const grouped = prev && prev.senderId === m.senderId && m.createdAt - prev.createdAt < GROUP_GAP && !newDay;
          const lastOfGroup = !next || next.senderId !== m.senderId || next.createdAt - m.createdAt >= GROUP_GAP;
          return (
            <Fragment key={m.id}>
              {newDay && <div className="day-sep">{longDate(m.createdAt)}</div>}
              <div className={`bubble-row ${mine ? 'mine' : ''} ${grouped ? 'grouped' : ''}`}>
                <div className="bubble">{m.body}</div>
                {!mine && m.flag === 'scam' && (
                  <div className="flag-warning" role="note">
                    <ShieldAlert size={14} style={{ verticalAlign: '-2px' }} /> <strong>Cuidado:</strong> este mensaje
                    habla de dinero o pagos. Nunca envíes dinero ni códigos a alguien que no conoces en persona.
                  </div>
                )}
                {!mine && m.flag === 'offensive' && (
                  <div className="flag-warning" role="note">
                    Este mensaje podría ser ofensivo. Nadie debe hacerte sentir mal: puedes{' '}
                    <button className="link-btn" style={{ padding: 0 }} onClick={() => setDialog('report')}>
                      bloquear o denunciar
                    </button>
                    .
                  </div>
                )}
                {lastOfGroup && (
                  <span className="bubble-time">
                    {clockTime(m.createdAt)}
                    {mine && m.id === lastMineId && m.readAt && ' · Visto'}
                  </span>
                )}
              </div>
            </Fragment>
          );
        })}
        {typing && (
          <div className="typing" aria-label={`${other.name} está escribiendo`}>
            <span />
            <span />
            <span />
          </div>
        )}
      </div>

      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <textarea
          ref={inputRef}
          rows={1}
          value={text}
          onChange={(e) => onType(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send(text);
            }
          }}
          placeholder={`Escribe a ${other.name}…`}
          maxLength={2000}
          aria-label="Mensaje"
        />
        <button className="send-btn" disabled={!text.trim()} aria-label="Enviar">
          <Send size={20} />
        </button>
      </form>

      {dialog === 'profile' && (
        <Modal title="" onClose={() => setDialog(null)}>
          <ProfileDetails profile={other} onReport={() => setDialog('report')} />
        </Modal>
      )}
      {dialog === 'report' && (
        <ReportDialog user={other} onClose={() => setDialog(null)} onDone={() => navigate('/matches', { replace: true })} />
      )}
      {dialog === 'unmatch' && (
        <ConfirmDialog
          title={`¿Deshacer el match con ${other.name}?`}
          confirmLabel="Deshacer match"
          danger
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            await api.del(`/api/matches/${id}`);
            refreshCounts();
            navigate('/matches', { replace: true });
          }}
        >
          La conversación desaparecerá para las dos personas y no volveréis a veros en Descubrir.
        </ConfirmDialog>
      )}
      {dialog?.offensive && (
        <ConfirmDialog
          title="¿Seguro que quieres enviarlo?"
          confirmLabel="Enviar igualmente"
          onClose={() => setDialog(null)}
          onConfirm={() => send(dialog.offensive, true)}
        >
          Tu mensaje podría resultar ofensivo. En Sparka cuidamos que todo el mundo se sienta bien. ¿Quieres
          reformularlo?
        </ConfirmDialog>
      )}
    </div>
  );
}
