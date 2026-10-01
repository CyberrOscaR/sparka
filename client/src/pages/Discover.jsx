import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Heart, RotateCcw, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { api } from '../lib/api.js';
import { useRealtime } from '../lib/realtime.jsx';
import { useToast } from '../lib/toast.jsx';
import { FiltersForm } from '../components/Filters.jsx';
import { ProfileDetails } from '../components/ProfileDetails.jsx';
import { SwipeCard } from '../components/SwipeCard.jsx';
import { MatchOverlay, MessageLikeDialog, ReportDialog } from '../components/dialogs.jsx';
import { Empty, Modal, Spinner } from '../components/ui.jsx';

const STACK = ['', 'behind', 'behind-2'];

export function Discover() {
  const { counts, setCounts, refreshCounts } = useRealtime();
  const toast = useToast();
  const [deck, setDeck] = useState(null);
  const [flying, setFlying] = useState([]); // tarjetas animándose hacia fuera
  const [exhausted, setExhausted] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [details, setDetails] = useState(null);
  const [likeDialog, setLikeDialog] = useState(null); // { profile, prompt?, spark? }
  const [reportFor, setReportFor] = useState(null);
  const [match, setMatch] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const swiped = useRef(new Set());
  const loading = useRef(false);
  const deckRef = useRef(deck);
  deckRef.current = deck;

  const load = useCallback(
    async (append) => {
      if (loading.current) return;
      loading.current = true;
      try {
        const { profiles, superlikesLeft } = await api.get('/api/discover');
        setCounts((c) => ({ ...c, superlikesLeft }));
        const fresh = profiles.filter((p) => !swiped.current.has(p.id));
        if (!append || !deckRef.current) {
          setDeck(fresh);
          setExhausted(false);
        } else {
          const ids = new Set(deckRef.current.map((p) => p.id));
          const extra = fresh.filter((p) => !ids.has(p.id));
          if (extra.length) setDeck((d) => [...d, ...extra.filter((p) => !d.some((x) => x.id === p.id))]);
          else setExhausted(true);
        }
      } catch (err) {
        toast(err.message, { type: 'error' });
        setDeck((d) => d ?? []);
      } finally {
        loading.current = false;
      }
    },
    [setCounts, toast],
  );

  useEffect(() => {
    load(false);
  }, [load]);

  // Pedimos más perfiles cuando quedan pocos.
  useEffect(() => {
    if (deck && deck.length < 4 && !exhausted) load(true);
  }, [deck, exhausted, load]);

  const swipe = useCallback(
    async (action, { message, gesture } = {}) => {
      const top = deck?.[0];
      if (!top) return;
      if (action === 'superlike' && counts.superlikesLeft <= 0) {
        toast('Ya no te quedan Chispas hoy. Se recargan en 24 h, gratis.');
        return;
      }
      swiped.current.add(top.id);
      setDeck((d) => d.filter((p) => p.id !== top.id));
      setFlying((f) => [...f, { profile: top, action, gesture }]);
      setTimeout(() => setFlying((f) => f.filter((x) => x.profile.id !== top.id)), 350);
      setDetails(null);
      setLikeDialog(null);

      try {
        const res = await api.post('/api/swipes', { targetId: top.id, action, message });
        setCounts((c) => ({ ...c, superlikesLeft: res.superlikesLeft }));
        setCanUndo(!res.matched);
        if (res.matched) {
          setMatch(res.match);
          refreshCounts();
        } else if (message) {
          toast(action === 'superlike' ? 'Chispa enviada ✨' : 'Like con mensaje enviado 💌', { type: 'success' });
        }
      } catch (err) {
        toast(err.message, { type: 'error' });
        if (err.status !== 404 && err.status !== 409) {
          swiped.current.delete(top.id);
          setDeck((d) => [top, ...d.filter((p) => p.id !== top.id)]);
        }
      }
    },
    [deck, counts.superlikesLeft, setCounts, refreshCounts, toast],
  );

  async function undo() {
    try {
      const { profile, superlikesLeft } = await api.post('/api/swipes/undo');
      swiped.current.delete(profile.id);
      setDeck((d) => [profile, ...(d ?? []).filter((p) => p.id !== profile.id)]);
      setCounts((c) => ({ ...c, superlikesLeft }));
    } catch (err) {
      toast(err.message);
      setCanUndo(false);
    }
  }

  /** Gesto de arrastre: devuelve false si no se puede (la tarjeta vuelve a su sitio). */
  function onGesture(action) {
    if (action === 'superlike' && counts.superlikesLeft <= 0) {
      toast('Ya no te quedan Chispas hoy. Se recargan en 24 h, gratis.');
      return false;
    }
    swipe(action, { gesture: true });
    return true;
  }

  const openSpark = useCallback(() => {
    if (!deck?.[0]) return;
    if (counts.superlikesLeft <= 0) return toast('Ya no te quedan Chispas hoy. Se recargan en 24 h, gratis.');
    setLikeDialog({ profile: deck[0], spark: true });
  }, [deck, counts.superlikesLeft, toast]);

  // Atajos de teclado: ← paso, → me gusta, ↑ Chispa.
  const modalOpen = Boolean(details || likeDialog || reportFor || match || filtersOpen);
  useEffect(() => {
    function onKey(e) {
      if (modalOpen || e.target.closest?.('input, textarea, select')) return;
      if (e.key === 'ArrowLeft') swipe('pass');
      else if (e.key === 'ArrowRight') swipe('like');
      else if (e.key === 'ArrowUp') {
        e.preventDefault();
        openSpark();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalOpen, swipe, openSpark]);

  if (!deck) return <Spinner />;
  const top = deck[0];
  const visible = deck.slice(0, 3);
  // Una sola lista con key estable: así la tarjeta que sale conserva su animación.
  const cards = [
    ...visible.map((p, i) => ({ p, i })).reverse(),
    ...flying.map(({ profile, action }) => ({ p: profile, exit: action })),
  ];

  return (
    <div className="discover">
      <header className="page-header">
        <h1>Descubrir</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="spark-count" title="Chispas disponibles hoy">
            <Sparkles size={18} /> {counts.superlikesLeft}
          </span>
          <button className="icon-btn" onClick={() => setFiltersOpen(true)} aria-label="Filtros">
            <SlidersHorizontal size={22} />
          </button>
        </div>
      </header>

      {counts.blind && !counts.blind.answered && (
        <Link to="/a-ciegas" className="blind-teaser">
          <span aria-hidden="true">🙈</span>
          <span>
            <strong>La Pregunta del Día te espera.</strong> Sin fotos: enamora con lo que piensas.
          </span>
          <ChevronRight size={18} />
        </Link>
      )}

      {visible.length === 0 && flying.length === 0 ? (
        <Empty
          emoji="🔭"
          title="Has visto a todo el mundo por aquí"
          action={
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
              <button className="btn btn-primary" onClick={() => setFiltersOpen(true)}>
                Ampliar filtros
              </button>
              <button className="btn" onClick={() => load(false)}>
                Buscar de nuevo
              </button>
            </div>
          }
        >
          Amplía la distancia o el rango de edad para conocer a más gente. Vuelve más tarde: siempre llega gente nueva.
        </Empty>
      ) : (
        <>
          <div className="deck">
            {cards.map(({ p, i, exit }) => (
              <SwipeCard
                key={p.id}
                profile={p}
                active={i === 0}
                exit={exit}
                stackClass={exit ? '' : STACK[i]}
                onSwipe={onGesture}
                onInfo={() => setDetails(p)}
              />
            ))}
          </div>

          <div className="actions">
            <button className="action small undo" onClick={undo} disabled={!canUndo} aria-label="Deshacer" title="Deshacer (gratis)">
              <RotateCcw size={22} />
            </button>
            <button className="action nope" onClick={() => swipe('pass')} disabled={!top} aria-label="Paso">
              <X size={32} strokeWidth={3} />
            </button>
            <button
              className="action small spark"
              onClick={openSpark}
              disabled={!top || counts.superlikesLeft <= 0}
              aria-label="Enviar Chispa"
              title="Chispa: destaca tu like"
            >
              <Sparkles size={22} />
            </button>
            <button className="action like" onClick={() => swipe('like')} disabled={!top} aria-label="Me gusta">
              <Heart size={32} strokeWidth={2.5} fill="currentColor" />
            </button>
          </div>
          <p className="kbd-hint">
            <kbd>←</kbd> paso · <kbd>→</kbd> me gusta · <kbd>↑</kbd> Chispa
          </p>
        </>
      )}

      {details && (
        <Modal title="" onClose={() => setDetails(null)}>
          <ProfileDetails
            profile={details}
            superlikesLeft={counts.superlikesLeft}
            onPass={() => swipe('pass')}
            onLike={() => swipe('like')}
            onSpark={openSpark}
            onCommentPrompt={(prompt) => setLikeDialog({ profile: details, prompt })}
            onReport={() => setReportFor(details)}
          />
        </Modal>
      )}

      {likeDialog && (
        <MessageLikeDialog
          {...likeDialog}
          onClose={() => setLikeDialog(null)}
          onSend={(message) => swipe(likeDialog.spark ? 'superlike' : 'like', { message })}
        />
      )}

      {reportFor && (
        <ReportDialog
          user={reportFor}
          onClose={() => setReportFor(null)}
          onDone={() => {
            setReportFor(null);
            setDetails(null);
            swiped.current.add(reportFor.id);
            setDeck((d) => d.filter((p) => p.id !== reportFor.id));
          }}
        />
      )}

      {filtersOpen && (
        <Modal title="Filtros" onClose={() => setFiltersOpen(false)}>
          <p className="muted" style={{ marginTop: 0 }}>
            Todos los filtros son gratis. Siempre.
          </p>
          <FiltersForm
            onSaved={() => {
              setFiltersOpen(false);
              load(false);
            }}
          />
        </Modal>
      )}

      {match && <MatchOverlay match={match} onClose={() => setMatch(null)} />}
    </div>
  );
}
