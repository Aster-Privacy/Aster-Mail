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
import { describe, it, expect, beforeAll } from "vitest";

import {
  answer_port_message,
  handle_probe,
  handle_request,
  list_local_session_user_ids,
  read_local_session,
  type BridgeDeps,
} from "./session_bridge_core";

import { build_handoff_message } from "@/lib/session_handoff/session_handoff_protocol";

const USER_ID = "3f2a8c1e-5b4d-4e6f-9a7b-1c2d3e4f5a6b";
const OTHER_ID = "9b8a7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const NOW = 1_800_000_000_000;
const PASSPHRASE = "vault passphrase é✓";

let session_key: CryptoKey;
let encrypted_passphrase: string;
let passphrase_iv: string;

function to_base64(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary);
}

beforeAll(async () => {
  session_key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    session_key,
    new TextEncoder().encode(PASSPHRASE),
  );

  encrypted_passphrase = to_base64(new Uint8Array(cipher));
  passphrase_iv = to_base64(iv);
});

function base_entries(): Record<string, string> {
  return {
    [`astermail_session_passphrase_${USER_ID}`]: encrypted_passphrase,
    [`astermail_session_passphrase_iv_${USER_ID}`]: passphrase_iv,
    [`astermail_encrypted_vault_${USER_ID}`]: "QUJDREVGR0g=",
    [`astermail_vault_nonce_${USER_ID}`]: "bm9uY2U=",
  };
}

function me_for(id: string) {
  return {
    user_id: id,
    username: "alex",
    email: "alex@astermail.org",
    display_name: null,
    profile_color: "#123456",
    profile_picture: null,
    lockdown_mode_enabled: false,
  };
}

function make_deps(
  entries: Record<string, string>,
  overrides: Partial<BridgeDeps> = {},
): BridgeDeps {
  return {
    storage: {
      get: (key) => (key in entries ? entries[key] : null),
      keys: () => Object.keys(entries),
    },
    now: () => NOW,
    load_session_key: async () => session_key,
    fetch_current_user: async () => me_for(USER_ID),
    decrypt: (key, ciphertext, iv) =>
      crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv as BufferSource },
        key,
        ciphertext as BufferSource,
      ),
    ...overrides,
  };
}

function with_timeout_config(
  config: string,
  last_activity: number | null,
): Record<string, string> {
  const entries: Record<string, string> = {
    ...base_entries(),
    astermail_session_timeout_migrated_v2: "1",
    astermail_session_timeout_config: config,
  };

  if (last_activity !== null) {
    entries[`astermail_last_activity_${USER_ID}`] = String(last_activity);
  }

  return entries;
}

const thirty_minutes = JSON.stringify({ enabled: true, timeout_minutes: 30 });

describe("read_local_session", () => {
  it("returns the stored session", () => {
    expect(
      read_local_session(make_deps(base_entries()).storage, USER_ID, NOW),
    ).not.toBeNull();
  });

  it("requires every piece", () => {
    for (const key of Object.keys(base_entries())) {
      const entries = base_entries();

      delete entries[key];
      expect(
        read_local_session(make_deps(entries).storage, USER_ID, NOW),
      ).toBeNull();
    }
  });

  it("refuses when an app lock is configured", () => {
    const lock_key = `aster:app_lock:${USER_ID}`;
    const locked = {
      ...base_entries(),
      [lock_key]: JSON.stringify({ enabled: true }),
    };
    const unparseable = { ...base_entries(), [lock_key]: "{" };
    const disabled = {
      ...base_entries(),
      [lock_key]: JSON.stringify({ enabled: false }),
    };

    expect(
      read_local_session(make_deps(locked).storage, USER_ID, NOW),
    ).toBeNull();
    expect(
      read_local_session(make_deps(unparseable).storage, USER_ID, NOW),
    ).toBeNull();
    expect(
      read_local_session(make_deps(disabled).storage, USER_ID, NOW),
    ).not.toBeNull();
  });

  it("refuses when the session timeout has passed", () => {
    const recent = with_timeout_config(thirty_minutes, NOW - 10 * 60 * 1000);
    const stale = with_timeout_config(thirty_minutes, NOW - 31 * 60 * 1000);
    const missing = with_timeout_config(thirty_minutes, null);

    expect(
      read_local_session(make_deps(recent).storage, USER_ID, NOW),
    ).not.toBeNull();
    expect(
      read_local_session(make_deps(stale).storage, USER_ID, NOW),
    ).toBeNull();
    expect(
      read_local_session(make_deps(missing).storage, USER_ID, NOW),
    ).toBeNull();
  });

  it("ignores the timeout when it is turned off", () => {
    const off = with_timeout_config(
      JSON.stringify({ enabled: false, timeout_minutes: 30 }),
      null,
    );

    expect(
      read_local_session(make_deps(off).storage, USER_ID, NOW),
    ).not.toBeNull();
  });

  it("enforces the minimum timeout", () => {
    const entries = with_timeout_config(
      JSON.stringify({ enabled: true, timeout_minutes: 1 }),
      NOW - 3 * 60 * 1000,
    );

    expect(
      read_local_session(make_deps(entries).storage, USER_ID, NOW),
    ).not.toBeNull();
  });

  it("treats a corrupt timeout config as timed out", () => {
    const entries = with_timeout_config("{", NOW);

    expect(
      read_local_session(make_deps(entries).storage, USER_ID, NOW),
    ).toBeNull();
  });

  it("rejects a malformed user id", () => {
    expect(
      read_local_session(make_deps(base_entries()).storage, "../x", NOW),
    ).toBeNull();
  });
});

describe("list_local_session_user_ids", () => {
  it("lists user ids without the iv keys", () => {
    const entries = {
      ...base_entries(),
      astermail_session_passphrase_garbage: "x",
    };

    expect(list_local_session_user_ids(make_deps(entries).storage)).toEqual([
      USER_ID,
    ]);
  });
});

describe("handle_probe", () => {
  it("reports availability only when a session and key exist", async () => {
    expect(await handle_probe(make_deps(base_entries()))).toBe(true);
    expect(await handle_probe(make_deps({}))).toBe(false);
    expect(
      await handle_probe(
        make_deps(base_entries(), { load_session_key: async () => null }),
      ),
    ).toBe(false);
    expect(
      await handle_probe(
        make_deps(base_entries(), {
          load_session_key: async () => {
            throw new Error("idb");
          },
        }),
      ),
    ).toBe(false);
  });
});

describe("handle_request", () => {
  it("returns the session when the server user matches", async () => {
    expect(await handle_request(make_deps(base_entries()), USER_ID)).toEqual({
      user: {
        id: USER_ID,
        username: "alex",
        email: "alex@astermail.org",
        profile_color: "#123456",
      },
      passphrase: PASSPHRASE,
      encrypted_vault: "QUJDREVGR0g=",
      vault_nonce: "bm9uY2U=",
    });
  });

  it("refuses when the server session belongs to someone else", async () => {
    const deps = make_deps(base_entries(), {
      fetch_current_user: async () => me_for(OTHER_ID),
    });

    expect(await handle_request(deps, USER_ID)).toBeNull();
  });

  it("refuses when the server session is gone", async () => {
    const gone = make_deps(base_entries(), {
      fetch_current_user: async () => null,
    });
    const throwing = make_deps(base_entries(), {
      fetch_current_user: async () => {
        throw new Error("network");
      },
    });

    expect(await handle_request(gone, USER_ID)).toBeNull();
    expect(await handle_request(throwing, USER_ID)).toBeNull();
  });

  it("refuses a user without a local session", async () => {
    const deps = make_deps(base_entries(), {
      fetch_current_user: async () => me_for(OTHER_ID),
    });

    expect(await handle_request(deps, OTHER_ID)).toBeNull();
  });

  it("refuses when decryption fails", async () => {
    const wrong_key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
    const bad_iv = {
      ...base_entries(),
      [`astermail_session_passphrase_iv_${USER_ID}`]: btoa("short"),
    };

    expect(
      await handle_request(
        make_deps(base_entries(), { load_session_key: async () => wrong_key }),
        USER_ID,
      ),
    ).toBeNull();
    expect(await handle_request(make_deps(bad_iv), USER_ID)).toBeNull();
  });
});

describe("answer_port_message", () => {
  it("ignores messages outside the protocol", async () => {
    const deps = make_deps(base_entries());

    expect(await answer_port_message(deps, { type: "probe" })).toBeNull();
    expect(await answer_port_message(deps, "probe")).toBeNull();
    expect(
      await answer_port_message(
        deps,
        build_handoff_message({ type: "request", user_id: "x" }),
      ),
    ).toBeNull();
  });

  it("answers unavailable on a refused request", async () => {
    const deps = make_deps(base_entries(), {
      fetch_current_user: async () => me_for(OTHER_ID),
    });

    expect(
      await answer_port_message(
        deps,
        build_handoff_message({ type: "request", user_id: USER_ID }),
      ),
    ).toEqual({ type: "unavailable" });
  });
});
