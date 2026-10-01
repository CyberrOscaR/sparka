import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [me, setMe] = useState(undefined); // undefined = cargando, null = sin sesión

  const refresh = useCallback(async () => {
    try {
      setMe(await api.get('/api/me'));
    } catch (err) {
      if (err.status === 401) setMe(null);
      else throw err;
    }
  }, []);

  useEffect(() => {
    refresh().catch(() => setMe(null));
  }, [refresh]);

  const logout = useCallback(async () => {
    await api.post('/api/auth/logout').catch(() => {});
    setMe(null);
  }, []);

  const value = useMemo(() => ({ me, setMe, refresh, logout }), [me, refresh, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
