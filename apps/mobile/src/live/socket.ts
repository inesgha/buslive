import { LIVE_EVENTS, type LineVehicles, LineVehiclesSchema } from '@buslive/shared';
import { io, type Socket } from 'socket.io-client';

import { apiBaseUrl } from '@/api/http';

/**
 * Connexion Socket.io unique de l'app (espace « /live ») pour recevoir les bus
 * en direct. Plusieurs écrans peuvent suivre la même ligne : un compteur par
 * ligne évite qu'un écran qui se ferme désabonne les autres.
 */

type Listener = (payload: LineVehicles) => void;

let socket: Socket | null = null;
const watchCounts = new Map<string, number>();
const listeners = new Set<Listener>();

/** « http://10.35.111.93:3000/api/v1 » → « http://10.35.111.93:3000 ». */
export function socketOrigin(apiUrl: string): string {
  const match = /^(https?:\/\/[^/]+)/.exec(apiUrl);
  if (!match?.[1]) throw new Error(`Adresse d'API invalide : ${apiUrl}`);
  return match[1];
}

function getSocket(): Socket {
  if (socket) return socket;
  socket = io(`${socketOrigin(apiBaseUrl())}/live`, {
    // WebSocket directement (pas de « long polling ») : plus économe sur mobile.
    transports: ['websocket'],
    reconnection: true,
  });
  // À chaque (re)connexion, on se réabonne aux lignes suivies.
  socket.on('connect', () => {
    for (const lineId of watchCounts.keys()) socket?.emit(LIVE_EVENTS.watchLine, { lineId });
  });
  socket.on(LIVE_EVENTS.vehicles, (payload: unknown) => {
    const parsed = LineVehiclesSchema.safeParse(payload);
    if (!parsed.success) return;
    for (const listener of listeners) listener(parsed.data);
  });
  return socket;
}

export function watchLine(lineId: string): void {
  const count = watchCounts.get(lineId) ?? 0;
  watchCounts.set(lineId, count + 1);
  const current = getSocket();
  if (count === 0 && current.connected) current.emit(LIVE_EVENTS.watchLine, { lineId });
}

export function unwatchLine(lineId: string): void {
  const count = watchCounts.get(lineId) ?? 0;
  if (count <= 1) {
    watchCounts.delete(lineId);
    socket?.emit(LIVE_EVENTS.unwatchLine, { lineId });
  } else {
    watchCounts.set(lineId, count - 1);
  }
}

export function onVehicles(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
