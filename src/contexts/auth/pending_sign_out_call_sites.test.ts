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
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

function read(name: string): string {
  return readFileSync(resolve(here, name), "utf8").replace(/\r\n/g, "\n");
}

function body_of(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);

  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);

  return source.slice(from, to);
}

describe("sign-out marker call sites", () => {
  const provider = read("use_auth_provider_state.ts");

  it("marks a sign-out pending before anything is awaited", () => {
    for (const [start, end] of [
      ["const logout = useCallback(", "const logout_all_handler"],
      ["const logout_all_handler = useCallback(", "useEffect("],
    ]) {
      const body = body_of(provider, start, end);
      const mark = body.indexOf("mark_sign_out_pending(");

      expect(mark).toBeGreaterThan(0);
      expect(mark).toBeLessThan(body.indexOf("await "));
      expect(mark).toBeLessThan(body.indexOf("window.setTimeout("));
    }
  });

  it("wipes before the session is released by the browser redirect", () => {
    const logout = body_of(
      provider,
      "const logout = useCallback(",
      "const logout_all_handler",
    );

    expect(logout.indexOf("run_pending_sign_out(")).toBeGreaterThan(0);
    expect(logout.indexOf("clear_local_auth_data()")).toBeGreaterThan(0);
    expect(logout).toContain("SIGN_OUT_FALLBACK_MS");
    expect(logout).not.toContain("}, 6000);");
  });

  it("clears the marker once a full wipe completes", () => {
    const clear = body_of(
      provider,
      "const clear_local_auth_data = useCallback(",
      "const logout_in_flight",
    );

    expect(clear.indexOf("clear_pending_sign_out()")).toBeGreaterThan(
      clear.indexOf("await purge_all_local_data("),
    );
  });

  it("finishes a pending sign-out before restoring any session", () => {
    const account_state = read("use_auth_account_state.ts");
    const init = body_of(account_state, "const init = async", "init().finally(");
    const finish = init.indexOf("await finish_pending_sign_out()");

    expect(finish).toBeGreaterThan(0);
    expect(finish).toBeLessThan(init.indexOf("initialize_accounts()"));
    expect(finish).toBeLessThan(init.indexOf("load_tokens_for_account("));
  });

  it("bounds the server sign-out inside the local wipe", () => {
    const purge = read("purge_local_data.ts");
    const local = body_of(
      purge,
      "async function sign_out_locally(",
      "function runs_in_desktop_shell",
    );

    expect(local).toMatch(
      /settle_within\(\s*Promise\.resolve\(\)\.then\(logout_user\)/,
    );
    expect(local).not.toMatch(/await logout_user\(\)/);
  });
});

describe("account memory clearers", () => {
  it("drop the cached image proxy grant", () => {
    const stores = read("account_memory_stores.ts");

    expect(stores).toContain("() => reset_image_proxy_grant_state(),");
    expect(read("purge_local_data.ts")).toContain(
      "clear_account_memory_stores();",
    );
    expect(read("auth_helpers.ts")).toContain("clear_account_memory_stores();");
  });
});
