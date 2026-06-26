import fs from "fs";

const codes = ["ar","de","es","fr","it","ja","ko","nl","pl","pt","ru","tr","zh-CN","en"];
let ok = true;
for (const code of codes) {
  const txt = fs.readFileSync(`src/lib/i18n/translations/${code}.ts`, "utf8");
  let depth = 0, inStr = null, inTpl = false, esc = false, started = false;
  let lineNo = 1, colNo = 0;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (c === "\n") { lineNo++; colNo = 0; } else { colNo++; }
    if (esc) { esc = false; continue; }
    if (inStr) {
      if (c === "\\") { esc = true; continue; }
      if (c === inStr) { inStr = null; }
      continue;
    }
    if (inTpl) {
      if (c === "\\") { esc = true; continue; }
      if (c === "`") { inTpl = false; }
      continue;
    }
    if (c === '"' || c === "'") { inStr = c; continue; }
    if (c === "`") { inTpl = true; continue; }
    if (c === "{") { if (!started) { started = true; } depth++; }
    else if (c === "}") { depth--; if (depth === 0 && started) { break; } }
  }
  const status = depth === 0 && !inStr && !inTpl ? "OK" : `FAIL depth=${depth} inStr=${inStr} inTpl=${inTpl}`;
  if (status !== "OK") ok = false;
  console.log(`${code}: ${status}`);
}
process.exit(ok ? 0 : 1);
