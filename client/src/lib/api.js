export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || 'Algo ha fallado. Inténtalo de nuevo.');
    this.status = status;
    this.code = body?.code;
    this.field = body?.field;
  }
}

async function request(method, url, body) {
  const init = { method, credentials: 'same-origin', headers: {} };
  if (body instanceof FormData) {
    init.body = body;
  } else if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError(0, { error: 'Sin conexión. Revisa tu internet.' });
  }
  const data = res.headers.get('content-type')?.includes('application/json') ? await res.json() : null;
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, body ?? {}),
  put: (url, body) => request('PUT', url, body),
  del: (url, body) => request('DELETE', url, body),
};
