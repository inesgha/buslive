import react from '@vitejs/plugin-react';
import { loadEnv, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Politique de sécurité du contenu (CSP), ajoutée à index.html au BUILD
 * seulement (en développement, Vite injecte des scripts intégrés pour le
 * rechargement à chaud) :
 * - scripts : seulement ceux du site, aucun script intégré ;
 * - images : le site et les tuiles OpenStreetMap (carte des arrêts) ;
 * - requêtes : le site et l'API.
 */
function contentSecurityPolicy(apiUrl: string): Plugin {
  const apiOrigin = apiUrl.startsWith('http') ? new URL(apiUrl).origin : '';
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://*.tile.openstreetmap.org",
    `connect-src 'self' ${apiOrigin}`.trim(),
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  return {
    name: 'buslive-csp',
    apply: 'build',
    transformIndexHtml: (html) =>
      html.replace(
        '<head>',
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`,
      ),
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    // En production, l'admin est servi sous /admin/ (même domaine que l'API, voir deploy/).
    base: env.VITE_BASE_PATH ?? '/',
    plugins: [react(), contentSecurityPolicy(env.VITE_API_URL ?? '/api/v1')],
    server: {
      port: 5173,
      strictPort: true,
      // En développement, /api passe par Vite vers l'API : même origine, donc le
      // cookie de session (SameSite=Strict) circule sans configuration CORS.
      proxy: { '/api': 'http://localhost:3000' },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
    },
  };
});
