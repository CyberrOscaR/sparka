import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Activity,
  ArrowLeft,
  Ban,
  CalendarHeart,
  EllipsisVertical,
  HeartCrack,
  Send,
  ShieldAlert,
  Trash2,
  User,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { clockTime, longDate } from '../lib/format.js';
import { useMeta } from '../lib/meta.jsx';
import { useRealtime, useSocketEvent } from '../lib/realtime.jsx';
import { useToast } from '../lib/toast.jsx';
import { ProfileDetails } from '../components/ProfileDetails.jsx';
import { AvailabilityPicker, PlanCard } from '../components/Coincide.jsx';
import { ConfirmDialog, ReportDialog } from '../components/dialogs.jsx';
import { Avatar, DemoBadge, Modal, Spinner } from '../components/ui.jsx';

const GROUP_GAP = 5 * 60 * 1000;

const HOUR = 3_600_000;

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
  const [dialog, setDialog] = useState(null); // 'profile' | 'unmatch' | 'report' | 'pulse' | 'pulse-no' | 'coincide' | { offensive }
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
  const reloadMatch = ({ matchId }) => {
    if (matchId !== id) return;
    api.get(`/api/matches/${id}`).then(setMatch, () => {});
  };
  useSocketEvent('pulse:changed', reloadMatch);
  useSocketEvent('coincide:changed', reloadMatch);
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

  /** Coincidir: abre la cuadrícula secreta (y empieza la búsqueda si nadie lo había hecho). */
  async function openCoincide() {
    if (!match.coincide) {
      try {
        setMatch({ ...match, ...(await api.post(`/api/matches/${id}/coincide`)) });
      } catch (err) {
        if (err.status !== 409) return toast(err.message, { type: 'error' });
        setMatch(await api.get(`/api/matches/${id}`));
      }
    }
    setDialog('coincide');
  }

  async function saveSlots(slots) {
    try {
      const state = await api.put(`/api/matches/${id}/coincide`, { slots });
      setMatch((m) => ({ ...m, ...state }));
      setDialog(null);
      if (state.coincide) toast(`📅 Guardado en secreto. Cuando ${match.user.name} marque los suyos, os diremos cuándo coincidís.`);
    } catch (err) {
      toast(err.message, { type: 'error' });
    }
  }

  async function startPulse() {
    try {
      const state = await api.post(`/api/matches/${id}/pulse`);
      setMatch((m) => ({ ...m, ...state }));
      setDialog(null);
      toast('💓 Pulso enviado. Os preguntamos en secreto a los dos.', { type: 'success' });
    } catch (err) {
      setDialog(null);
      toast(err.message, { type: 'error' });
    }
  }

  async function votePulse(answer) {
    try {
      const state = await api.post(`/api/matches/${id}/pulse/vote`, { answer });
      setMatch((m) => ({ ...m, ...state }));
      setDialog(null);
      refreshCounts();
    } catch (err) {
      toast(err.message, { type: 'error' });
    }
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
        {!match.closed && (
          <button className="icon-btn coincide-btn" onClick={openCoincide} aria-label="¿Cuándo coincidimos?" title="¿Cuándo coincidimos?">
            <CalendarHeart size={22} />
          </button>
        )}
        <button className="icon-btn" onClick={() => setMenu((v) => !v)} aria-label="Más opciones" aria-expanded={menu}>
          <EllipsisVertical size={22} />
        </button>
        {menu && (
          <div className="menu" role="menu" onClick={() => setMenu(false)}>
            <button role="menuitem" onClick={() => setDialog('profile')}>
              <User size={18} /> Ver perfil
            </button>
            {!match.closed && (
              <button role="menuitem" onClick={openCoincide}>
                <CalendarHeart size={18} /> ¿Cuándo coincidimos? 📅
              </button>
            )}
            {match.canStartPulse && (
              <button role="menuitem" onClick={() => setDialog('pulse')}>
                <Activity size={18} /> Tomar el Pulso 💓
              </button>
            )}
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
          <strong>
            {match.source === 'blind' ? '🙈 Match a ciegas' : 'Hicisteis match'} el {longDate(match.createdAt)}
          </strong>
          {match.source === 'blind' && (
            <p>Os gustó lo que pensáis antes de veros. Estas fueron vuestras respuestas: ¡empezad por ahí!</p>
          )}
          {match.source !== 'blind' && !match.closed && !messages.some((m) => m.senderId === me.id && m.kind === 'text') && (
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
          if (m.kind === 'plan' && m.data) {
            return (
              <Fragment key={m.id}>
                {newDay && <div className="day-sep">{longDate(m.createdAt)}</div>}
                <PlanCard message={m} otherName={other.name} matchId={id} />
              </Fragment>
            );
          }
          if (m.kind === 'system') {
            return (
              <Fragment key={m.id}>
                {newDay && <div className="day-sep">{longDate(m.createdAt)}</div>}
                <div className="system-msg" role="note">
                  {m.body}
                </div>
              </Fragment>
            );
          }
          const [blindQuestion, ...blindAnswer] = m.kind === 'blind' ? m.body.split('\n') : [];
          return (
            <Fragment key={m.id}>
              {newDay && <div className="day-sep">{longDate(m.createdAt)}</div>}
              <div className={`bubble-row ${mine ? 'mine' : ''} ${grouped ? 'grouped' : ''}`}>
                {m.kind === 'blind' ? (
                  <div className="bubble blind-bubble">
                    <span className="blind-q">🙈 {blindQuestion}</span>
                    {blindAnswer.join('\n')}
                  </div>
                ) : (
                  <div className="bubble">{m.body}</div>
                )}
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

      {match.coincide && !match.closed && (
        <div className="pulse-card coincide-card" role="region" aria-label="Coincidir">
          {match.coincide.mySlots ? (
            <div className="coincide-row">
              <p>
                <strong>📅 Has marcado {match.coincide.mySlots.length} huecos en secreto.</strong> Cuando {other.name}{' '}
                marque los suyos, os diremos cuándo coincidís.
              </p>
              <button className="btn btn-sm" onClick={() => setDialog('coincide')}>
                Cambiar
              </button>
            </div>
          ) : (
            <div className="coincide-row">
              <p>
                <strong>📅 ¿Quedamos?</strong> Marca en secreto cuándo podrías esta semana: solo os diremos cuándo
                coincidís.
              </p>
              <button className="btn btn-primary btn-sm" onClick={() => setDialog('coincide')}>
                Marcar huecos
              </button>
            </div>
          )}
        </div>
      )}

      {match.pulse && !match.closed && (
        <div className="pulse-card" role="region" aria-label="Pulso">
          {match.pulse.myVote ? (
            <p>
              <strong>💓 Has dicho que sí.</strong> Si {other.name} también quiere seguir, os lo diremos a los dos. Si
              no responde, la conversación se cerrará sola en {Math.max(1, Math.round((match.pulse.expiresAt - Date.now()) / HOUR))} h.
            </p>
          ) : (
            <>
              <p>
                <strong>💓 Pulso: ¿te apetece seguir hablando con {other.name}?</strong>
                <br />
                Es secreto: tu «sí» solo se revela si es mutuo. Un «no» cierra la conversación con un adiós amable, sin
                ghosting.
              </p>
              <div className="pulse-actions">
                <button className="btn btn-sm" onClick={() => setDialog('pulse-no')}>
                  Prefiero cerrar
                </button>
                <button className="btn btn-primary btn-sm" onClick={() => votePulse('yes')}>
                  ¡Sí, me apetece!
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {match.closed ? (
        <div className="closed-bar">
          <span>💐 Conversación cerrada{match.closed.reason === 'pulse_timeout' ? ' (el Pulso caducó)' : ''}</span>
          <button className="btn btn-sm" onClick={() => setDialog('unmatch')}>
            <Trash2 size={16} /> Eliminar
          </button>
        </div>
      ) : (
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
      )}

      {dialog === 'profile' && (
        <Modal title="" onClose={() => setDialog(null)}>
          <ProfileDetails profile={other} onReport={() => setDialog('report')} />
        </Modal>
      )}
      {dialog === 'report' && (
        <ReportDialog user={other} onClose={() => setDialog(null)} onDone={() => navigate('/matches', { replace: true })} />
      )}
      {dialog === 'coincide' && (
        <AvailabilityPicker
          name={other.name}
          initial={match.coincide?.mySlots}
          onSave={saveSlots}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'pulse' && (
        <ConfirmDialog
          title="Tomar el Pulso 💓"
          confirmLabel="Tomar el Pulso"
          onClose={() => setDialog(null)}
          onConfirm={startPulse}
        >
          Os preguntaremos en secreto a {other.name} y a ti si queréis seguir hablando. Un «sí» solo se revela si es
          mutuo (y entonces os proponemos un plan). Un «no» cierra la conversación con una despedida amable. Si nadie
          responde en 3 días, se cierra sola. Nadie se queda esperando.
        </ConfirmDialog>
      )}
      {dialog === 'pulse-no' && (
        <ConfirmDialog
          title="¿Cerrar la conversación?"
          confirmLabel="Cerrar con cariño"
          danger
          onClose={() => setDialog(null)}
          onConfirm={() => votePulse('no')}
        >
          Enviaremos una despedida amable en tu nombre y ya no podréis escribiros. Mejor que desaparecer sin más 💐
        </ConfirmDialog>
      )}
      {dialog === 'unmatch' && (
        <ConfirmDialog
          title={match.closed ? '¿Eliminar esta conversación?' : `¿Deshacer el match con ${other.name}?`}
          confirmLabel={match.closed ? 'Eliminar' : 'Deshacer match'}
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
