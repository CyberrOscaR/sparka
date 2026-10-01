import { Server } from 'socket.io';
import { SESSION_COOKIE, userIdFromToken } from './auth.js';
import { getMatchFor } from './store.js';

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    try {
      out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      // Cookie mal formada: la ignoramos.
    }
  }
  return out;
}

/** Socket.IO autenticado con la misma cookie de sesión que la API. Cada usuario tiene su sala. */
export function attachRealtime(httpServer, db) {
  const io = new Server(httpServer, { serveClient: false });

  io.use((socket, next) => {
    const token = parseCookies(socket.handshake.headers.cookie)[SESSION_COOKIE];
    const userId = userIdFromToken(db, token);
    if (!userId) return next(new Error('unauthorized'));
    socket.data.userId = userId;
    next();
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId;
    socket.join(`user:${userId}`);
    db.prepare('UPDATE profiles SET last_active = ? WHERE user_id = ?').run(Date.now(), userId);

    socket.on('typing', (payload) => {
      const matchId = Number(payload?.matchId);
      if (!Number.isInteger(matchId)) return;
      const match = getMatchFor(db, matchId, userId);
      if (match) io.to(`user:${match.otherId}`).emit('typing', { matchId, userId });
    });
  });

  const notify = (userId, event, payload) => io.to(`user:${userId}`).emit(event, payload);
  return { io, notify };
}
