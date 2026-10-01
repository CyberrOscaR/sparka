import { useState } from 'react';
import { Briefcase, ChevronLeft, ChevronRight, Heart, MapPin, MessageCircle, Sparkles, X } from 'lucide-react';
import { useMeta } from '../lib/meta.jsx';
import { DemoBadge, PhotoPlaceholder } from './ui.jsx';

/**
 * Perfil completo. Opcionalmente con acciones (like/paso), comentar una respuesta
 * (like con mensaje) y denunciar.
 */
export function ProfileDetails({ profile, onLike, onPass, onSpark, onCommentPrompt, onReport, superlikesLeft }) {
  const { interestById, intentionById, genderById } = useMeta();
  const [photo, setPhoto] = useState(0);
  const shared = new Set(profile.compatibility?.sharedInterests ?? []);
  const intention = intentionById[profile.intention];
  const photos = profile.photos;

  return (
    <div className="profile-detail">
      <div className="detail-photos">
        {photos.length ? <img src={photos[photo]} alt={`Foto ${photo + 1} de ${profile.name}`} /> : <PhotoPlaceholder user={profile} />}
        {photos.length > 1 && (
          <>
            <div className="photo-bars" aria-hidden="true">
              {photos.map((p, i) => (
                <span key={p} className={i === photo ? 'on' : ''} />
              ))}
            </div>
            <button
              className="info-btn"
              style={{ left: 12, right: 'auto', top: '45%', bottom: 'auto' }}
              onClick={() => setPhoto((i) => (i - 1 + photos.length) % photos.length)}
              aria-label="Foto anterior"
            >
              <ChevronLeft />
            </button>
            <button
              className="info-btn"
              style={{ top: '45%', bottom: 'auto' }}
              onClick={() => setPhoto((i) => (i + 1) % photos.length)}
              aria-label="Foto siguiente"
            >
              <ChevronRight />
            </button>
          </>
        )}
      </div>

      <div className="detail-head">
        <h2>
          {profile.name} <span className="age">{profile.age}</span>
          {profile.isDemo && <DemoBadge />}
        </h2>
        <div className="facts">
          {profile.activity && (
            <span>
              <span className="activity-dot" /> {profile.activity}
            </span>
          )}
          {profile.distanceKm != null ? (
            <span>
              <MapPin size={16} /> {profile.city} · a {profile.distanceKm} km
            </span>
          ) : (
            profile.city && (
              <span>
                <MapPin size={16} /> {profile.city}
              </span>
            )
          )}
          {profile.job && (
            <span>
              <Briefcase size={16} /> {profile.job}
            </span>
          )}
          {genderById[profile.gender] && <span>{genderById[profile.gender].label}</span>}
        </div>
        {intention && (
          <div>
            <span className="badge badge-brand">
              {intention.emoji} Busca: {intention.label}
            </span>
          </div>
        )}
      </div>

      {profile.compatibility && (
        <div className="compat-box">
          <header>
            <span>Vuestra afinidad</span>
            <span className="compat-score grad-text">{profile.compatibility.score}%</span>
          </header>
          <div className="compat-bar">
            <div style={{ width: `${profile.compatibility.score}%` }} />
          </div>
          {profile.compatibility.reasons.length > 0 && (
            <ul>
              {profile.compatibility.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {profile.bio && (
        <div>
          <h3 className="section-title">Sobre mí</h3>
          <p style={{ margin: 0 }}>{profile.bio}</p>
        </div>
      )}

      {profile.prompts.map((p) => (
        <div className="prompt-card" key={p.id}>
          <p className="q">{p.question}</p>
          <p className="a">{p.answer}</p>
          {onCommentPrompt && (
            <button className="comment-btn" onClick={() => onCommentPrompt(p)} aria-label={`Comentar: ${p.question}`}>
              <MessageCircle size={18} />
            </button>
          )}
        </div>
      ))}

      <div>
        <h3 className="section-title">Intereses</h3>
        <div className="chips">
          {profile.interests.map((id) => (
            <span key={id} className={`chip ${shared.has(id) ? 'shared' : ''}`}>
              {interestById[id]?.emoji} {interestById[id]?.label}
            </span>
          ))}
        </div>
      </div>

      {onReport && (
        <div style={{ textAlign: 'center' }}>
          <button className="link-btn" onClick={onReport}>
            Bloquear o denunciar a {profile.name}
          </button>
        </div>
      )}

      {(onLike || onPass) && (
        <div className="detail-actions">
          {onPass && (
            <button className="action nope" onClick={onPass} aria-label="Paso">
              <X size={30} strokeWidth={3} />
            </button>
          )}
          {onSpark && (
            <button
              className="action spark"
              onClick={onSpark}
              disabled={superlikesLeft === 0}
              aria-label="Enviar Chispa"
              title={superlikesLeft === 0 ? 'Sin Chispas hasta mañana' : 'Chispa'}
            >
              <Sparkles size={26} />
            </button>
          )}
          {onLike && (
            <button className="action like" onClick={onLike} aria-label="Me gusta">
              <Heart size={30} strokeWidth={2.5} fill="currentColor" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
