/**
 * services/socket.js — conexión WebSocket única para toda la aplicación.
 */

import { io } from 'socket.io-client';

const URL = import.meta.env.VITE_API_URL ?? undefined;

export const socket = io(URL, {
  autoConnect: true,
  transports: ['websocket', 'polling'],
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
});

export default socket;
