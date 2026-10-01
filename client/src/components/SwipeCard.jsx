import { useEffect, useRef, useState } from 'react';
import { Briefcase, Info, MapPin } from 'lucide-react';
import { useMeta } from '../lib/meta.jsx';
import { DemoBadge, PhotoPlaceholder } from './ui.jsx';

const THRESHOLD = 110;
const EXIT = { like: [1.6, 0, 30], pass: [-1.6, 0, -30], superlike: [0, -1.4, 0] };

/**
 * Tarjeta arrastrable. `exit` fuerza la animación de salida (cuando se usan los botones).
 * `onSwipe(action)` se llama al soltar pasado el umbral.
 */
export function SwipeCard({ profile, onSwipe, onInfo, exit, active, stackClass = '' }) {
  const { interestById, intentionById } = useMeta();
  const ref = useRef(null);
  const drag = useRef(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [photo, setPhoto] = useState(0);

  useEffect(() => {
    if (!exit) return;
    const [fx, fy, rot] = EXIT[exit];
    setDragging(false);
    setOffset({ x: fx * window.innerWidth, y: fy * window.innerHeight, rot });
  }, [exit]);

  function onPointerDown(e) {
    if (!active || exit || e.button > 0 || e.target.closest('.info-btn')) return;
    drag.current = { startX: e.clientX, startY: e.clientY, captured: false };
  }

  function onPointerMove(e) {
    const d = drag.current;
    if (!d) return;
    const x = e.clientX - d.startX;
    const y = e.clientY - d.startY;
    if (!d.captured) {
      // Hasta que no se mueve, es un toque: dejamos que llegue el click (p. ej. cambiar de foto).
      if (Math.abs(x) + Math.abs(y) < 8) return;
      d.captured = true;
      setDragging(true);
      ref.current.setPointerCapture(e.pointerId);
    }
    setOffset({ x, y });
  }

  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    if (!d?.captured) return;
    const { x, y } = offset;
    let action = null;
    if (x > THRESHOLD) action = 'like';
    else if (x < -THRESHOLD) action = 'pass';
    else if (y < -THRESHOLD * 1.2 && Math.abs(x) < THRESHOLD) action = 'superlike';
    setDragging(false);
    // onSwipe puede rechazar el gesto (p. ej. sin Chispas): entonces la tarjeta vuelve a su sitio.
    if (action && onSwipe(action) !== false) {
      const [fx, fy, rot] = EXIT[action];
      setOffset({ x: fx * window.innerWidth, y: fy * window.innerHeight, rot });
    } else {
      setOffset({ x: 0, y: 0 });
    }
  }

  const photos = profile.photos;
  const rotation = offset.rot ?? offset.x / 18;
  const likeOpacity = Math.min(Math.max(offset.x / THRESHOLD, 0), 1);
  const nopeOpacity = Math.min(Math.max(-offset.x / THRESHOLD, 0), 1);
  const sparkOpacity = Math.min(Math.max(-offset.y / (THRESHOLD * 1.2), 0), 1) * (1 - Math.max(likeOpacity, nopeOpacity));
  const shared = new Set(profile.compatibility?.sharedInterests ?? []);
  const interests = [...profile.interests].sort((a, b) => shared.has(b) - shared.has(a)).slice(0, 4);
  const intention = intentionById[profile.intention];

  return (
    <div
      ref={ref}
      className={`swipe-card ${stackClass} ${dragging ? 'dragging' : ''}`}
      style={active || exit ? { transform: `translate(${offset.x}px, ${offset.y}px) rotate(${rotation}deg)` } : undefined}
      aria-hidden={!active && !exit}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      aria-label={`${profile.name}, ${profile.age} años`}
    >
      {photos.length ? (
        <img className="swipe-photo" src={photos[photo]} alt="" draggable="false" />
      ) : (
        <PhotoPlaceholder user={profile} />
      )}

      {photos.length > 1 && (
        <>
          <div className="photo-bars" aria-hidden="true">
            {photos.map((p, i) => (
              <span key={p} className={i === photo ? 'on' : ''} />
            ))}
          </div>
          <button className="photo-tap left" aria-label="Foto anterior" onClick={() => setPhoto((i) => Math.max(0, i - 1))} />
          <button
            className="photo-tap right"
            aria-label="Foto siguiente"
            onClick={() => setPhoto((i) => Math.min(photos.length - 1, i + 1))}
          />
        </>
      )}

      <div className="stamp stamp-like" style={{ opacity: likeOpacity }}>Me gusta</div>
      <div className="stamp stamp-nope" style={{ opacity: nopeOpacity }}>Paso</div>
      <div className="stamp stamp-spark" style={{ opacity: sparkOpacity }}>Chispa ✨</div>

      <div className="swipe-info">
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          {profile.compatibility && (
            <span className="compat-pill">
              <span className="dot" /> {profile.compatibility.score}% afinidad
            </span>
          )}
          {profile.isDemo && <DemoBadge />}
        </div>
        <div className="swipe-name">
          <span>{profile.name}</span>
          <span className="age">{profile.age}</span>
        </div>
        <div className="swipe-meta">
          {profile.activity && (
            <span>
              <span className="activity-dot" /> {profile.activity}
            </span>
          )}
          {profile.distanceKm != null && (
            <span>
              <MapPin size={15} /> a {profile.distanceKm} km
            </span>
          )}
          {profile.job && (
            <span>
              <Briefcase size={15} /> {profile.job}
            </span>
          )}
          {intention && (
            <span>
              {intention.emoji} {intention.label}
            </span>
          )}
        </div>
        <div className="chips" style={{ paddingRight: 48 }}>
          {interests.map((id) => (
            <span key={id} className={`chip chip-sm ${shared.has(id) ? 'shared' : ''}`}>
              {interestById[id]?.emoji} {interestById[id]?.label}
            </span>
          ))}
        </div>
      </div>
      <button className="info-btn" onClick={onInfo} aria-label={`Ver el perfil completo de ${profile.name}`}>
        <Info size={22} />
      </button>
    </div>
  );
}
