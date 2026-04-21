import fs from "node:fs";
import path from "node:path";

const SRC = path.resolve("src");
const SKIP = new Set([
  path.resolve("src/services/crypto/legacy_keks.ts"),
  path.resolve("src/services/crypto/key_manager_core.ts"),
  path.resolve("src/services/crypto/key_manager_pgp.ts"),
  path.resolve("src/services/crypto/recovery_key.ts"),
]);

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const s = fs.statSync(p);

    if (s.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(p)) out.push(p);
  }

  return out;
}

function find_matching_paren(src, open_idx) {
  let depth = 0;

  for (let i = open_idx; i < src.length; i++) {
    const c = src[i];

    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }

  return -1;
}

function split_top_level_commas(s) {
  const out = [];
  let depth = 0;
  let start = 0;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];

    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === "," && depth === 0) {
      out.push(s.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(s.slice(start).trim());

  return out.filter((x) => x.length);
}

function extract_iv(alg_obj) {
  const inner = alg_obj.replace(/^\s*\{/, "").replace(/\}\s*$/, "");
  const parts = split_top_level_commas(inner);

  for (const p of parts) {
    const m = p.match(/^\s*iv\s*:\s*([\s\S]+)$/);

    if (m) return m[1].trim();

    if (/^\s*iv\s*$/.test(p)) return "iv";
  }

  return null;
}

function process_file(src) {
  const marker = "crypto.subtle.decrypt";
  let result = "";
  let i = 0;
  let count = 0;

  while (i < src.length) {
    const idx = src.indexOf(marker, i);

    if (idx === -1) {
      result += src.slice(i);
      break;
    }

    const paren = src.indexOf("(", idx + marker.length);

    if (paren === -1) {
      result += src.slice(i);
      break;
    }

    const end = find_matching_paren(src, paren);

    if (end === -1) {
      result += src.slice(i);
      break;
    }

    const inner = src.slice(paren + 1, end);
    const args = split_top_level_commas(inner);

    if (args.length !== 3 || !args[0].trim().startsWith("{")) {
      result += src.slice(i, end + 1);
      i = end + 1;
      continue;
    }

    if (!/"AES-GCM"|'AES-GCM'/.test(args[0])) {
      result += src.slice(i, end + 1);
      i = end + 1;
      continue;
    }

    const iv = extract_iv(args[0]);

    if (!iv) {
      result += src.slice(i, end + 1);
      i = end + 1;
      continue;
    }

    const key = args[1];
    const ct = args[2];

    result += src.slice(i, idx);
    result += `decrypt_aes_gcm_with_fallback(${key}, ${ct}, ${iv})`;
    count++;
    i = end + 1;
  }

  return { result, count };
}

let total_files = 0;
let total_replacements = 0;

for (const file of walk(SRC)) {
  if (SKIP.has(path.resolve(file))) continue;

  const src = fs.readFileSync(file, "utf8");
  const { result, count } = process_file(src);

  if (count === 0) continue;

  let final = result;

  if (!/from\s+["']@\/services\/crypto\/legacy_keks["']/.test(final)) {
    const import_line = `import { decrypt_aes_gcm_with_fallback } from "@/services/crypto/legacy_keks";\n`;
    const last_import = final.match(/^(?:import[^\n]*\n)+/m);

    if (last_import) {
      const idx = last_import.index + last_import[0].length;

      final = final.slice(0, idx) + import_line + final.slice(idx);
    } else {
      final = import_line + final;
    }
  }

  fs.writeFileSync(file, final);
  total_files++;
  total_replacements += count;
  console.log(`${path.relative(SRC, file)}: ${count}`);
}

console.log(`\nTotal: ${total_replacements} across ${total_files} files`);
