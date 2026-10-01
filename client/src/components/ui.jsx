import { useEffect, useId } from 'react';
import { X } from 'lucide-react';
import { hueFor, initials } from '../lib/format.js';
import { useMeta } from '../lib/meta.jsx';

export function Logo({ size = 34 }) {
  return (
    <span className="logo">
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
        <defs>
          <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ff7a59" />
            <stop offset=".5" stopColor="#ff2d87" />
            <stop offset="1" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="16" fill="url(#logo-g)" />
        <path fill="#fff" d="M32 10c1.6 9.6 6.4 14.4 16 16-9.6 1.6-14.4 6.4-16 16-1.6-9.6-6.4-14.4-16-16 9.6-1.6 14.4-6.4 16-16Z" />
        <circle cx="47" cy="45" r="4" fill="#fff" opacity=".85" />
      </svg>
      <span className="grad-text">Sparka</span>
    </span>
  );
}

/** Fondo para perfiles sin foto: degradado estable + inicial + emoji de su primer interés. */
export function PhotoPlaceholder({ user }) {
  const { interestById } = useMeta();
  const hue = hueFor(user.id);
  const emoji = interestById[user.interests?.[0]]?.emoji;
  return (
    <div
      className="swipe-placeholder"
      style={{ background: `linear-gradient(150deg, hsl(${hue} 85% 66%), hsl(${(hue + 50) % 360} 75% 52%))` }}
    >
      <span className="big-initial">{initials(user.name)}</span>
      {emoji && (
        <span className="big-emoji" style={{ top: '18%', right: '18%' }} aria-hidden="true">
          {emoji}
        </span>
      )}
    </div>
  );
}

export function Avatar({ user, size = 48 }) {
  const photo = user.photo ?? user.photos?.[0];
  const hue = hueFor(user.id);
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {photo ? (
        <img src={photo} alt="" loading="lazy" />
      ) : (
        <span
          className="avatar-fallback"
          style={{ background: `linear-gradient(150deg, hsl(${hue} 85% 66%), hsl(${(hue + 50) % 360} 75% 52%))` }}
        >
          {initials(user.name)}
        </span>
      )}
    </span>
  );
}

export function DemoBadge() {
  return (
    <span className="badge badge-demo" title="Perfil de ejemplo generado por Sparka (modo demo)">
      Demo
    </span>
  );
}

export function Modal({ title, onClose, children, footer, labelledBy }) {
  const id = useId();
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={labelledBy ?? id}>
        {title !== undefined && (
          <div className="modal-head">
            <h2 id={id}>{title}</h2>
            <button className="icon-btn" onClick={onClose} aria-label="Cerrar">
              <X size={22} />
            </button>
          </div>
        )}
        {children}
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Empty({ emoji, title, children, action }) {
  return (
    <div className="empty">
      <div className="empty-emoji" aria-hidden="true">
        {emoji}
      </div>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Spinner() {
  return (
    <div className="splash" style={{ minHeight: 240 }}>
      <div className="spinner" aria-label="Cargando" />
    </div>
  );
}
