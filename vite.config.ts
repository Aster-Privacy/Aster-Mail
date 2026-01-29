import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

function source_map_fix_plugin(): Plugin {
  const extension_patterns = [
    "installHook.js.map",
    "react_devtools_backend_compact.js.map",
    "react_devtools_backend.js.map",
    "contentScript.js.map",
    "%3Canonymous",
  ];
  const empty_source_map = JSON.stringify({
    version: 3,
    sources: ["extension://stub"],
    sourcesContent: [""],
    mappings: "AAAA",
    names: [],
  });

  return {
    name: "source-map-fix",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url || "";
        const is_extension_map = extension_patterns.some((p) =>
          url.includes(p),
        );

        if (is_extension_map) {
          res.setHeader("Content-Type", "application/json");
          res.end(empty_source_map);

          return;
        }
        next();
      });
    },
  };
}

// https://vitejs.dev/config/
const api_target = process.env.VITE_API_TARGET || "http://localhost:3000";
const ws_target = process.env.VITE_WS_TARGET || "ws://localhost:3000";

export default defineConfig({
  base: "./",
  server: {
    port: 5173,
    allowedHosts: true,
    watch: {
      usePolling: true,
      interval: 1000,
    },
    proxy: {
      "/ws": {
        target: ws_target,
        ws: true,
        changeOrigin: true,
      },
      "/api": {
        target: api_target,
        changeOrigin: true,
        secure: false,
      },
    },
  },
  plugins: [
    source_map_fix_plugin(),
    react(),
    tsconfigPaths(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "favicon-16x16.png",
        "favicon-32x32.png",
        "apple-touch-icon.png",
        "logo.png",
        "mail_logo.png",
        "text_logo.png",
      ],
      manifest: {
        name: "AsterMail",
        short_name: "AsterMail",
        description: "Secure, private email for everyone.",
        theme_color: "#ffffff",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        orientation: "portrait-primary",
        categories: ["email", "productivity", "security"],
        icons: [
          {
            src: "/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "/apple-touch-icon.png",
            sizes: "180x180",
            type: "image/png",
            purpose: "apple touch icon",
          },
        ],
        shortcuts: [
          {
            name: "Compose Email",
            short_name: "Compose",
            url: "/mail?compose=true",
            icons: [{ src: "/pwa-192x192.png", sizes: "192x192" }],
          },
          {
            name: "Inbox",
            short_name: "Inbox",
            url: "/mail/inbox",
            icons: [{ src: "/pwa-192x192.png", sizes: "192x192" }],
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2,json}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "gstatic-fonts-cache",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /\/api\/auth\/me$/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "auth-cache",
              expiration: {
                maxEntries: 1,
                maxAgeSeconds: 60 * 5,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
              networkTimeoutSeconds: 3,
            },
          },
          {
            urlPattern: /\/api\/mail\/stats$/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "mail-stats-cache",
              expiration: {
                maxEntries: 1,
                maxAgeSeconds: 60 * 2,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
              networkTimeoutSeconds: 5,
            },
          },
          {
            urlPattern: /\/api\/mail\?/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "mail-list-cache",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 5,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
              networkTimeoutSeconds: 10,
            },
          },
          {
            urlPattern: /\/api\/folders/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "folders-cache",
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 10,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
              networkTimeoutSeconds: 5,
            },
          },
          {
            urlPattern: /\/api\/preferences/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "preferences-cache",
              expiration: {
                maxEntries: 5,
                maxAgeSeconds: 60 * 30,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
              networkTimeoutSeconds: 3,
            },
          },
          {
            urlPattern: /\/api\/.*/i,
            handler: "NetworkOnly",
            options: {
              backgroundSync: {
                name: "api-queue",
                options: {
                  maxRetentionTime: 60 * 24,
                },
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
});
