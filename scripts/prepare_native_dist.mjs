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
import {
  cpSync,
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const WEB_ONLY_FILES = [
  "aster.webp",
  "profile.png",
  "text_logo_white.png",
  "welcome_encrypted.png",
  "welcome_import.png",
  "welcome_opensource.png",
  "welcome_quantum.png",
];

const CAPACITOR_CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' https://challenges.cloudflare.com https://js.stripe.com https://m.stripe.network",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: cid: https:",
  "media-src 'self' data: blob:",
  "font-src 'self' data: blob: https:",
  "connect-src 'self' https://astermail.org https://*.astermail.org wss://*.astermail.org https://aster-wallpapers.pages.dev https://challenges.cloudflare.com https://api.stripe.com https://m.stripe.network https://r.stripe.com https://q.stripe.com https://*.stripe.network",
  "frame-src 'self' blob: https://challenges.cloudflare.com https://js.stripe.com https://hooks.stripe.com https://m.stripe.network https://*.stripe.network https://*.hcaptcha.com https://hcaptcha.com https://calendar.astermail.org",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://js.stripe.com https://hooks.stripe.com",
].join("; ");

const flags = process.argv.slice(2).filter((arg) => arg.startsWith("--"));
const paths = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const unknown_flags = flags.filter((flag) => flag !== "--capacitor");

if (unknown_flags.length > 0) {
  console.error(`native dist: unknown option ${unknown_flags.join(" ")}`);
  process.exit(1);
}

const for_capacitor = flags.includes("--capacitor");
const source = resolve(root, paths[0] ?? "dist");
const target = resolve(root, paths[1] ?? "dist-native");

if (!existsSync(resolve(source, "index.html"))) {
  console.error(
    `native dist: ${join(source, "index.html")} is missing. Run: npx vite build`,
  );
  process.exit(1);
}

if (target === source || target === root) {
  console.error(`native dist: refusing to replace ${target}`);
  process.exit(1);
}

let skipped = 0;

rmSync(target, { recursive: true, force: true });
cpSync(source, target, {
  recursive: true,
  filter(path) {
    const name = relative(source, path).split(sep).join("/");
    const ship = !path.endsWith(".map") && !WEB_ONLY_FILES.includes(name);

    if (!ship) skipped += 1;

    return ship;
  },
});

function add_csp_meta(html, policy) {
  const tag = `<meta http-equiv="Content-Security-Policy" content="${policy}" />`;
  const cleaned = html.replace(
    /\s*<meta\s+http-equiv=["']content-security-policy["'][^>]*>/gi,
    "",
  );
  const anchor =
    cleaned.match(/<meta\s+charset=[^>]*>/i) ??
    cleaned.match(/<head(\s[^>]*)?>/i);

  if (!anchor) {
    console.error(
      "native dist: index.html has no <head> for the security policy",
    );
    process.exit(1);
  }

  const end = anchor.index + anchor[0].length;

  return `${cleaned.slice(0, end)}\n    ${tag}${cleaned.slice(end)}`;
}

if (for_capacitor) {
  const index_path = join(target, "index.html");

  writeFileSync(
    index_path,
    add_csp_meta(readFileSync(index_path, "utf8"), CAPACITOR_CSP),
  );
}

console.log(
  `native dist: copied ${basename(source)} to ${basename(target)} without ${skipped} source maps and web-only files${for_capacitor ? ", with the Capacitor security policy" : ""}`,
);
