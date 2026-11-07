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
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const src_root = resolve(here, "..");

function list_sources(dir: string): string[] {
  const out: string[] = [];

  for (const name of readdirSync(dir)) {
    const full = join(dir, name);

    if (statSync(full).isDirectory()) {
      if (name === "tests" || name === "node_modules") continue;
      out.push(...list_sources(full));
    } else if (
      /\.(ts|tsx)$/.test(name) &&
      !/\.test\.(ts|tsx)$/.test(name) &&
      !name.endsWith(".d.ts")
    ) {
      out.push(full);
    }
  }

  return out;
}

const sources = list_sources(src_root).map((path) => ({
  path: relative(src_root, path).replace(/\\/g, "/"),
  text: readFileSync(path, "utf8").replace(/\r\n/g, "\n"),
}));

function source(path: string): string {
  const found = sources.find((entry) => entry.path === path);

  if (!found) throw new Error(`missing source ${path}`);

  return found.text;
}

function function_body(text: string, name: string): string {
  const start = text.search(
    new RegExp(`\\n(export )?(async )?function ${name}\\(`),
  );

  if (start < 0) throw new Error(`missing function ${name}`);
  const rest = text.slice(start + 1);
  const next = rest.slice(1).search(/\n(export )?(async )?function /);

  return next < 0 ? rest : rest.slice(0, next + 1);
}

function functions_calling(text: string, callee: string): string[] {
  const names = Array.from(
    text.matchAll(/\n(?:export )?(?:async )?function (\w+)\(/g),
  ).map((match) => match[1]);

  return names.filter(
    (name) =>
      name !== callee &&
      function_body(text, name).includes(`${callee}(`),
  );
}

describe("app lock passphrase storage", () => {
  it("writes the readable passphrase from only two modules", () => {
    const writers = sources
      .filter((entry) => /\bstore_unwrapped_passphrase\(/.test(entry.text))
      .map((entry) => entry.path)
      .sort();

    expect(writers).toEqual([
      "contexts/auth/session_passphrase.ts",
      "services/app_lock_unlock.ts",
    ]);
  });

  it("routes every passphrase save through the PIN check", () => {
    const text = source("contexts/auth/session_passphrase.ts");

    expect(functions_calling(text, "store_unwrapped_passphrase")).toEqual([
      "store_session_passphrase",
    ]);
    const body = function_body(text, "store_session_passphrase");
    const guard = body.indexOf("is_account_server_wrapped(account_id)");
    const wrapped = body.indexOf("store_pin_wrapped_passphrase(");
    const plain = body.indexOf("store_unwrapped_passphrase(");

    expect(guard).toBeGreaterThan(-1);
    expect(wrapped).toBeGreaterThan(guard);
    expect(plain).toBeGreaterThan(wrapped);
    expect(body.slice(guard, plain)).toContain("return;");
  });

  it("turns the PIN off before the unlock module stores a readable passphrase", () => {
    const text = source("services/app_lock_unlock.ts");
    const callers = functions_calling(text, "store_unwrapped_passphrase");

    expect(callers.sort()).toEqual(["convert_to_unwrapped", "handle_lock_reset"]);
    for (const name of callers) {
      const body = function_body(text, name);
      const write = body.indexOf("store_unwrapped_passphrase(");
      const before = body.slice(0, write);

      expect(
        before.includes("clear_app_lock_config(account_id)") ||
          /save_app_lock_config\([^)]*enabled: false/s.test(before),
      ).toBe(true);
    }
  });

  it("keeps the readable passphrase keys inside the session module", () => {
    const writes = sources.filter(
      (entry) =>
        entry.path !== "contexts/auth/session_passphrase.ts" &&
        /(safe_local_set|safe_session_set|localStorage\.setItem|sessionStorage\.setItem|storage\.set)\([^)]*(SESSION_PASSPHRASE_KEY_PREFIX|astermail_session_passphrase_)/.test(
          entry.text,
        ),
    );

    expect(writes.map((entry) => entry.path)).toEqual([]);
  });

  it("skips the desktop stored passphrase while the PIN lock holds", () => {
    const text = source("contexts/auth/use_auth_account_state.ts");
    const call = text.indexOf('"device_get_stored_passphrase"');

    expect(call).toBeGreaterThan(-1);
    expect(text.slice(Math.max(0, call - 400), call)).toContain(
      "!pin_locked_at_start",
    );
  });

  it("does not let the lock screen release the passphrase without the server", () => {
    const text = source("components/mobile/app_lock.tsx");

    expect(text).not.toMatch(/\battempt_pin_unlock\(/);
    expect(text).toMatch(/\battempt_app_unlock\(/);
  });
});
