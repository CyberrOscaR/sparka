import { BrowserRouter, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Flame, Heart, MessageCircle, UserRound } from 'lucide-react';
import { AuthProvider, useAuth } from './lib/auth.jsx';
import { MetaProvider } from './lib/meta.jsx';
import { RealtimeProvider, useRealtime, useSocketEvent } from './lib/realtime.jsx';
import { ToastProvider, useToast } from './lib/toast.jsx';
import { Logo } from './components/ui.jsx';
import { Chat } from './pages/Chat.jsx';
import { Discover } from './pages/Discover.jsx';
import { Landing } from './pages/Landing.jsx';
import { Likes } from './pages/Likes.jsx';
import { Matches } from './pages/Matches.jsx';
import { Onboarding } from './pages/Onboarding.jsx';
import { Profile } from './pages/Profile.jsx';

function NavItem({ to, icon: Icon, label, badge, end }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
      <Icon size={24} />
      <span>{label}</span>
      {badge > 0 && <span className="nav-badge">{badge > 99 ? '99+' : badge}</span>}
    </NavLink>
  );
}

function Shell() {
  const { counts } = useRealtime();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const toast = useToast();

  // Avisos globales cuando alguien hace match contigo o te escribe estando en otra pantalla.
  useSocketEvent('match:new', ({ matchId, user }) => {
    toast(`¡Nuevo match con ${user.name}! 💘 Toca para escribirle`, {
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
        <NavItem to="/le-gustas" icon={Heart} label="Le gustas" badge={counts.likes} />
        <NavItem to="/matches" icon={MessageCircle} label="Matches" badge={counts.unread} />
        <NavItem to="/perfil" icon={UserRound} label="Perfil" />
      </nav>
      <main className="shell-main">
        <Routes>
          <Route path="/" element={<Discover />} />
          <Route path="/le-gustas" element={<Likes />} />
          <Route path="/matches" element={<Matches />} />
          <Route path="/chat/:matchId" element={<Chat />} />
          <Route path="/perfil" element={<Profile />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
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
