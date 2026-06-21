/// <reference types="vitest" />
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createHmac, randomUUID } from 'crypto';

// Serves the ImageKit auth endpoint during `vite dev` so client uploads work
// locally (in production Vercel serves api/imagekit-auth.ts instead).
const imagekitAuthDevPlugin = (privateKey?: string): Plugin => ({
  name: 'imagekit-auth-dev',
  configureServer(server) {
    server.middlewares.use('/api/imagekit-auth', (_req, res) => {
      if (!privateKey) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: 'IMAGEKIT_PRIVATE_KEY is not configured.' }));
        return;
      }
      const token = randomUUID();
      const expire = Math.floor(Date.now() / 1000) + 30 * 60;
      const signature = createHmac('sha1', privateKey).update(token + expire).digest('hex');
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ token, expire, signature }));
    });
  },
});

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
  plugins: [react(), imagekitAuthDevPlugin(env.IMAGEKIT_PRIVATE_KEY)],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    proxy: {
      '/ingest/static': {
        target: 'https://us-assets.i.posthog.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ingest/, ''),
      },
      '/ingest': {
        target: 'https://us.i.posthog.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ingest/, ''),
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
  },
  };
});
