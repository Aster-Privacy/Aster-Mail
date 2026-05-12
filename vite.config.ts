//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the AGPLv3 as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// AGPLv3 for more details.
//
// You should have received a copy of the AGPLv3
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { execSync } from "child_process";

import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { browserslistToTargets } from "lightningcss";
import browserslist from "browserslist";

import pkg from "./package.json";

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

const api_target = process.env.VITE_API_TARGET || "http://127.0.0.1:3000";
const ws_target = process.env.VITE_WS_TARGET || "ws://127.0.0.1:3000";

function get_build_hash(): string {
  const nonce = Date.now().toString(36).slice(-5).toUpperCase();

  try {
    const git = execSync("git rev-parse --short HEAD")
      .toString()
      .trim()
      .toUpperCase();

    return `${git}-${nonce}`;
  } catch {
    return nonce;
  }
}

function version_manifest_plugin(version: string, build: string): Plugin {
  return {
    name: "version-manifest",
    apply: "build",
    generateBundle() {
      const manifest = {
        version,
        build,
        ts: Date.now(),
      };

      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: JSON.stringify(manifest),
      });
    },
  };
}

const build_hash = get_build_hash();

const css_targets = browserslistToTargets(
  browserslist("chrome >= 100, edge >= 100, firefox >= 100, safari >= 15"),
);

export default defineConfig({
  base: "/",
  css: {
    lightningcss: {
      targets: css_targets,
    },
  },
  build: {
    cssMinify: "lightningcss",
    chunkSizeWarningLimit: 2600,
    sourcemap: "hidden",
    rollupOptions: {
      onwarn(warning, defaultHandler) {
        if (
          warning.message?.includes(
            "has been externalized for browser compatibility",
          )
        )
          return;
        if (
          warning.message?.includes(
            "dynamic import will not move module into another chunk",
          )
        )
          return;
        defaultHandler(warning);
      },
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-crypto": ["openpgp"],
          "vendor-ui": [
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-popover",
            "@radix-ui/react-context-menu",
            "@radix-ui/react-select",
            "@radix-ui/react-tooltip",
            "@radix-ui/react-alert-dialog",
          ],
          "vendor-motion": ["framer-motion"],
          "vendor-date": ["date-fns"],
          "vendor-sanitize": ["dompurify"],
          "vendor-pdf": ["pdfjs-dist"],
        },
      },
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_HASH__: JSON.stringify(build_hash),
  },
  server: {
    host: "app.localhost",
    port: 5173,
    allowedHosts: true,
    proxy: {
      "/ws": {
        target: ws_target,
        ws: true,
        changeOrigin: false,
      },
      "/api": {
        target: api_target,
        changeOrigin: true,
        secure: true,
        headers: {
          origin: api_target,
        },
      },
    },
  },
  plugins: [
    version_manifest_plugin(pkg.version, build_hash),
    source_map_fix_plugin(),
    react(),
    tsconfigPaths(),
    tailwindcss(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
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
        scope: "/",
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
            purpose: "any",
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
      injectManifest: {
        injectionPoint: undefined,
        globPatterns: [],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
});
