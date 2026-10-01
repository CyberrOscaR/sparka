import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { api } from './api.js';
import { useAuth } from './auth.jsx';

const RealtimeContext = createContext(null);

export function RealtimeProvider({ children }) {
  const { me } = useAuth();
  const [socket, setSocket] = useState(null);
  const [counts, setCounts] = useState(() => ({ ...me.counts, superlikesLeft: me.superlikesLeft }));

  const refreshCounts = useCallback(() => {
    api.get('/api/me/counts').then(setCounts, () => {});
  }, []);

  useEffect(() => {
    const s = io({ withCredentials: true });
    setSocket(s);
    const refresh = () => refreshCounts();
    s.on('connect', refresh); // al reconectar puede que nos hayamos perdido algo
    s.on('likes:changed', refresh);
    s.on('match:new', refresh);
    s.on('match:removed', refresh);
    s.on('message:new', refresh);
    s.on('blind:liked', refresh);
    s.on('pulse:changed', refresh);
    s.on('coincide:changed', refresh);
    s.on('autocita:new', refresh);
    s.on('autocita:changed', refresh);
    return () => {
      s.close();
      setSocket(null);
    };
  }, [refreshCounts]);

  return (
    <RealtimeContext.Provider value={{ socket, counts, setCounts, refreshCounts }}>{children}</RealtimeContext.Provider>
  );
}

export const useRealtime = () => useContext(RealtimeContext);

/** Se suscribe a un evento del socket con un handler que siempre ve el estado más reciente. */
export function useSocketEvent(event, handler) {
  const { socket } = useRealtime();
  const ref = useRef(handler);
  useLayoutEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    if (!socket) return;
    const fn = (payload) => ref.current(payload);
    socket.on(event, fn);
    return () => socket.off(event, fn);
  }, [socket, event]);
}
