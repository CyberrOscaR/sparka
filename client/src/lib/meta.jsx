import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';

const MetaContext = createContext(null);

export function MetaProvider({ children }) {
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/api/meta').then(setMeta, setError);
  }, []);

  const value = useMemo(() => {
    if (!meta) return null;
    const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
    return {
      ...meta,
      interestById: byId(meta.interests),
      intentionById: byId(meta.intentions),
      genderById: byId(meta.genders),
      promptById: byId(meta.prompts),
    };
  }, [meta]);

  if (error) {
    return (
      <div className="splash">
        <p>No se ha podido conectar con Sparka.</p>
        <button className="btn btn-primary" onClick={() => location.reload()}>
          Reintentar
        </button>
      </div>
    );
  }
  if (!value) return <div className="splash"><div className="spinner" aria-label="Cargando" /></div>;
  return <MetaContext.Provider value={value}>{children}</MetaContext.Provider>;
}

export const useMeta = () => useContext(MetaContext);
