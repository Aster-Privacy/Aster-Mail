import fs from "node:fs";
import path from "node:path";

const SRC = path.resolve("src");

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const s = fs.statSync(p);

    if (s.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(p)) out.push(p);
  }

  return out;
}

const bad_re =
  /^(import(?:\s+type)?\s*\{\s*\r?\n)(import \{ decrypt_aes_gcm_with_fallback \} from "@\/services\/crypto\/legacy_keks";\r?\n)/m;

let fixed = 0;

for (const file of walk(SRC)) {
  const src = fs.readFileSync(file, "utf8");

  if (bad_re.test(src)) {
    const next = src.replace(bad_re, (_m, a, b) => `${b}${a}`);

    fs.writeFileSync(file, next);
    fixed++;
    console.log(path.relative(SRC, file));
  }
}

console.log(`\nFixed ${fixed} files`);
