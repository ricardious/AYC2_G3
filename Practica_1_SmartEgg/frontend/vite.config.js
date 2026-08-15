import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // host: true expone el servidor en la red local para poder abrir la app
    // desde el celular o la tablet (requisito de la rúbrica 5.3)
    host: true,
    port: 5173,
    proxy: {
      // Todo lo que empiece con /api y /socket.io se redirige al backend,
      // así el frontend no necesita saber la IP del servidor.
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:4000', ws: true },
    },
  },
});
