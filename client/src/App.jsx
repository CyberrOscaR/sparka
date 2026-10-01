import { BrowserRouter, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { Flame, Heart, MessageCircle, UserRound, VenetianMask } from 'lucide-react';
import { AuthProvider, useAuth } from './lib/auth.jsx';
import { MetaProvider } from './lib/meta.jsx';
import { RealtimeProvider, useRealtime, useSocketEvent } from './lib/realtime.jsx';
import { ToastProvider, useToast } from './lib/toast.jsx';
import { BlindReveal } from './components/BlindReveal.jsx';
import { Logo } from './components/ui.jsx';
import { Blind } from './pages/Blind.jsx';
import { Chat } from './pages/Chat.jsx';
import { Discover } from './pages/Discover.jsx';
import { Landing } from './pages/Landing.jsx';
import { Likes } from './pages/Likes.jsx';
import { Matches } from './pages/Matches.jsx';
import { Onboarding } from './pages/Onboarding.jsx';
import { Profile } from './pages/Profile.jsx';

function NavItem({ to, icon: Icon, label, badge, dot, end }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
      <Icon size={24} />
      <span>{label}</span>
      {badge > 0 && <span className="nav-badge">{badge > 99 ? '99+' : badge}</span>}
      {!badge && dot && <span className="nav-dot" aria-label="Novedad" />}
    </NavLink>
  );
}

function Shell() {
  const { counts } = useRealtime();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const [reveal, setReveal] = useState(null);

  // Avisos globales: matches, chispas anónimas y Pulsos pendientes, estés en la pantalla que estés.
  useSocketEvent('match:new', ({ matchId, user, source }) => {
    if (source === 'blind') return setReveal({ id: matchId, user });
    toast(`¡Nuevo match con ${user.name}! 💘 Toca para escribirle`, {
      type: 'match',
      duration: 6000,
      onClick: () => navigate(`/chat/${matchId}`),
    });
  });
  useSocketEvent('blind:liked', ({ likes }) => {
    if (!likes) return;
    toast('💫 A alguien le ha encantado tu respuesta de hoy. ¿Quién será?', {
      duration: 5000,
      onClick: () => navigate('/a-ciegas'),
    });
  });
  useSocketEvent('pulse:changed', ({ matchId, pending }) => {
    if (!pending || pathname === `/chat/${matchId}`) return;
    toast('💓 Tienes un Pulso pendiente: ¿seguís hablando?', {
      type: 'match',
      duration: 6000,
      onClick: () => navigate(`/chat/${matchId}`),
    });
  });

  const inChat = pathname.startsWith('/chat/');
  return (
    <div className={`shell ${inChat ? 'fullscreen' : ''}`}>
      <nav className="nav" aria-label="Principal">
        <Logo size={32} />
        <NavItem to="/" end icon={Flame} label="Descubrir" />
        <NavItem to="/a-ciegas" icon={VenetianMask} label="A ciegas" dot={counts.blind && !counts.blind.answered} />
        <NavItem to="/le-gustas" icon={Heart} label="Le gustas" badge={counts.likes} />
        <NavItem to="/matches" icon={MessageCircle} label="Matches" badge={counts.unread} />
        <NavItem to="/perfil" icon={UserRound} label="Perfil" />
      </nav>
      <main className="shell-main">
        <Routes>
          <Route path="/" element={<Discover />} />
          <Route path="/a-ciegas" element={<Blind />} />
          <Route path="/le-gustas" element={<Likes />} />
          <Route path="/matches" element={<Matches />} />
          <Route path="/chat/:matchId" element={<Chat />} />
          <Route path="/perfil" element={<Profile />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {reveal && <BlindReveal match={reveal} onClose={() => setReveal(null)} />}
    </div>
  );
}

function Gate() {
  const { me } = useAuth();
  if (me === undefined) {
    return (
      <div className="splash">
        <div className="spinner" aria-label="Cargando" />
      </div>
    );
  }
  if (me === null) return <Landing />;
  if (!me.profile.completed) return <Onboarding />;
  return (
    <RealtimeProvider key={me.id}>
      <Shell />
    </RealtimeProvider>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <MetaProvider>
          <AuthProvider>
            <Gate />
          </AuthProvider>
        </MetaProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
