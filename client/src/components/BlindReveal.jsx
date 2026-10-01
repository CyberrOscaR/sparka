import { useNavigate } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { DemoBadge, PhotoPlaceholder } from './ui.jsx';

/** El momento mágico de "A ciegas": os gustó lo que pensáis… y ahora os veis por primera vez. */
export function BlindReveal({ match, onClose }) {
  const navigate = useNavigate();
  const { user } = match;
  const photo = user.photos?.[0];
  return (
    <div className="reveal-overlay" role="dialog" aria-modal="true" aria-labelledby="reveal-title">
      <div className="reveal-inner">
        <p className="reveal-eyebrow">🙈 Match a ciegas</p>
        <h2 id="reveal-title">Os encantó lo que pensáis</h2>
        <p className="reveal-lead">Antes de ver ninguna foto. Ahora sí: os presentamos.</p>
        <div className="reveal-photo">
          {photo ? <img src={photo} alt={`Foto de ${user.name}`} /> : <PhotoPlaceholder user={user} />}
        </div>
        <div className="reveal-who">
          <strong>
            {user.name}, {user.age}
          </strong>
          {user.isDemo && <DemoBadge />}
          {user.city && (
            <span>
              <MapPin size={15} /> {user.city}
              {user.distanceKm != null && ` · a ${user.distanceKm} km`}
            </span>
          )}
        </div>
        <div className="reveal-actions">
          <button
            className="btn btn-light"
            autoFocus
            onClick={() => {
              onClose();
              navigate(`/chat/${match.id}`);
            }}
          >
            Escribirle
          </button>
          <button className="btn btn-outline" onClick={onClose}>
            Seguir leyendo respuestas
          </button>
        </div>
      </div>
    </div>
  );
}
