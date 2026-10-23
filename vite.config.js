import { defineConfig, loadEnv } from 'vite';
import tailwindcss from '@tailwindcss/vite';

// In `npm run dev`, serve api/*.js the way Vercel does, so sign-in and the leaderboard work locally.
function localApi() {
  return {
    name: 'local-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const match = req.url.match(/^\/api\/([a-z]+)(?:\?|$)/);
        if (!match) return next();
        try {
          const mod = await server.ssrLoadModule(`/api/${match[1]}.js`);
          await mod.default(req, res);
        } catch (err) {
          if (err.code === 'ERR_LOAD_URL' || /Failed to load url/.test(err.message)) {
            res.statusCode = 404;
            return res.end('{"error":"Not found"}');
          }
          next(err);
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Make .env / .env.local values (e.g. the Upstash keys) visible to the API code in dev.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''), process.env);
  return {
    base: './',
    plugins: [tailwindcss(), localApi()],
  };
});
