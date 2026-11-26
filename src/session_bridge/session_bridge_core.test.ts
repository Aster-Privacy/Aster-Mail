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
  read_local_session,
  type BridgeDeps,
} from "./session_bridge_core";

import { build_handoff_message } from "@/lib/session_handoff/session_handoff_protocol";
import {
  HANDOFF_GRANT_KEY_PREFIX,
  HANDOFF_GRANT_WAIT_MS,
} from "@/lib/session_handoff/session_handoff_grant";

const USER_ID = "3f2a8c1e-5b4d-4e6f-9a7b-1c2d3e4f5a6b";
const OTHER_ID = "9b8a7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const NOW = 1_800_000_000_000;
const PASSPHRASE = "vault passphrase é✓";
const AUDIENCE = "https://calendar.astermail.org";
const GRANT = "a".repeat(43);
const OTHER_GRANT = "b".repeat(43);
const GRANT_KEY = HANDOFF_GRANT_KEY_PREFIX + GRANT;

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

interface GrantFields {
  user_id: string | null;
  audience: string;
  expires_at: number;
  state: string;
}

function with_grant(
  entries: Record<string, string>,
  fields: Partial<GrantFields> = {},
  grant_id: string = GRANT,
): Record<string, string> {
  entries[HANDOFF_GRANT_KEY_PREFIX + grant_id] = JSON.stringify({
    user_id: USER_ID,
    audience: AUDIENCE,
    expires_at: NOW + 60_000,
    state: "approved",
    ...fields,
  });

  return entries;
}

function approved(): Record<string, string> {
  return with_grant(base_entries());
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
      set: (key, value) => {
        entries[key] = value;
      },
      remove: (key) => {
        delete entries[key];
      },
      keys: () => Object.keys(entries),
    },
    now: () => NOW,
    sleep: async () => undefined,
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

  it("refuses a shared mailbox session", () => {
    const shared = {
      ...base_entries(),
      [`astermail_shared_grant_epoch_${USER_ID}`]: "3",
    };

    expect(
      read_local_session(make_deps(shared).storage, USER_ID, NOW),
    ).toBeNull();
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

describe("handle_probe", () => {
  it("reports availability only for an approved grant and a usable session", async () => {
    expect(
      await handle_probe(make_deps(approved()), GRANT, AUDIENCE, false),
    ).toBe(true);
    expect(
      await handle_probe(make_deps(base_entries()), GRANT, AUDIENCE, false),
    ).toBe(false);
    expect(
      await handle_probe(make_deps(with_grant({})), GRANT, AUDIENCE, false),
    ).toBe(false);
    expect(
      await handle_probe(
        make_deps(approved(), { load_session_key: async () => null }),
        GRANT,
        AUDIENCE,
        false,
      ),
    ).toBe(false);
    expect(
      await handle_probe(
        make_deps(approved(), {
          load_session_key: async () => {
            throw new Error("idb");
          },
        }),
        GRANT,
        AUDIENCE,
        false,
      ),
    ).toBe(false);
  });

  it("refuses a grant with the wrong audience, state, lifetime, or id", async () => {
    const cases = [
      with_grant(base_entries(), { audience: "https://other.example" }),
      with_grant(base_entries(), { state: "denied" }),
      with_grant(base_entries(), { expires_at: NOW }),
      with_grant(base_entries(), {
        expires_at: NOW + HANDOFF_GRANT_WAIT_MS + 1,
      }),
      with_grant(base_entries(), { user_id: null }),
      with_grant(base_entries(), {}, OTHER_GRANT),
    ];

    for (const entries of cases) {
      expect(
        await handle_probe(make_deps(entries), GRANT, AUDIENCE, false),
      ).toBe(false);
    }
  });

  it("leaves the grant in place", async () => {
    const entries = approved();

    await handle_probe(make_deps(entries), GRANT, AUDIENCE, false);
    expect(entries[GRANT_KEY]).toBeDefined();
  });

  it("waits for a decision when asked to", async () => {
    const entries = base_entries();
    let clock = NOW;
    let sleeps = 0;
    const deps = make_deps(entries, {
      now: () => clock,
      sleep: async (ms) => {
        sleeps += 1;
        clock += ms;
        if (sleeps === 3) with_grant(entries, { expires_at: clock + 60_000 });
      },
    });

    expect(await handle_probe(deps, GRANT, AUDIENCE, true)).toBe(true);
    expect(sleeps).toBe(3);
  });

  it("stops waiting at the deadline or on a denial", async () => {
    let clock = NOW;
    const pending = make_deps(base_entries(), {
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
    });

    expect(await handle_probe(pending, GRANT, AUDIENCE, true)).toBe(false);
    expect(clock).toBeGreaterThanOrEqual(NOW + HANDOFF_GRANT_WAIT_MS);

    let slept = false;
    const denied = make_deps(with_grant(base_entries(), { state: "denied" }), {
      sleep: async () => {
        slept = true;
      },
    });

    expect(await handle_probe(denied, GRANT, AUDIENCE, true)).toBe(false);
    expect(slept).toBe(false);
  });
});

describe("handle_request", () => {
  it("returns the session for an approved grant exactly once", async () => {
    const entries = approved();
    const deps = make_deps(entries);

    expect(await handle_request(deps, GRANT, AUDIENCE, USER_ID)).toEqual({
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
    expect(entries[GRANT_KEY]).toBeUndefined();
    expect(await handle_request(deps, GRANT, AUDIENCE, USER_ID)).toBeNull();
  });

  it("refuses without an approved grant", async () => {
    expect(
      await handle_request(make_deps(base_entries()), GRANT, AUDIENCE, USER_ID),
    ).toBeNull();
    expect(
      await handle_request(
        make_deps(with_grant(base_entries(), { state: "denied" })),
        GRANT,
        AUDIENCE,
        USER_ID,
      ),
    ).toBeNull();
  });

  it("burns a grant presented with the wrong audience or user", async () => {
    const wrong_audience = approved();

    expect(
      await handle_request(
        make_deps(wrong_audience),
        GRANT,
        "https://other.example",
        USER_ID,
      ),
    ).toBeNull();
    expect(wrong_audience[GRANT_KEY]).toBeUndefined();

    const wrong_user = approved();

    expect(
      await handle_request(make_deps(wrong_user), GRANT, AUDIENCE, OTHER_ID),
    ).toBeNull();
    expect(wrong_user[GRANT_KEY]).toBeUndefined();
  });

  it("refuses when the server session belongs to someone else", async () => {
    const deps = make_deps(approved(), {
      fetch_current_user: async () => me_for(OTHER_ID),
    });

    expect(await handle_request(deps, GRANT, AUDIENCE, USER_ID)).toBeNull();
  });

  it("refuses when the server session is gone", async () => {
    const gone = make_deps(approved(), {
      fetch_current_user: async () => null,
    });
    const throwing = make_deps(approved(), {
      fetch_current_user: async () => {
        throw new Error("network");
      },
    });

    expect(await handle_request(gone, GRANT, AUDIENCE, USER_ID)).toBeNull();
    expect(
      await handle_request(throwing, GRANT, AUDIENCE, USER_ID),
    ).toBeNull();
  });

  it("refuses a user without a local session", async () => {
    const deps = make_deps(with_grant(base_entries(), { user_id: OTHER_ID }), {
      fetch_current_user: async () => me_for(OTHER_ID),
    });

    expect(await handle_request(deps, GRANT, AUDIENCE, OTHER_ID)).toBeNull();
  });

  it("refuses when decryption fails", async () => {
    const wrong_key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
    const bad_iv = with_grant({
      ...base_entries(),
      [`astermail_session_passphrase_iv_${USER_ID}`]: btoa("short"),
    });

    expect(
      await handle_request(
        make_deps(approved(), { load_session_key: async () => wrong_key }),
        GRANT,
        AUDIENCE,
        USER_ID,
      ),
    ).toBeNull();
    expect(
      await handle_request(make_deps(bad_iv), GRANT, AUDIENCE, USER_ID),
    ).toBeNull();
  });
});

describe("answer_port_message", () => {
  it("ignores messages outside the protocol", async () => {
    const deps = make_deps(approved());

    expect(
      await answer_port_message(deps, AUDIENCE, { type: "probe" }),
    ).toBeNull();
    expect(await answer_port_message(deps, AUDIENCE, "probe")).toBeNull();
    expect(
      await answer_port_message(
        deps,
        AUDIENCE,
        build_handoff_message({ type: "probe" }),
      ),
    ).toBeNull();
    expect(
      await answer_port_message(
        deps,
        AUDIENCE,
        build_handoff_message({ type: "request", grant: GRANT, user_id: "x" }),
      ),
    ).toBeNull();
  });

  it("answers a probe and then a request for an approved grant", async () => {
    const deps = make_deps(approved());

    expect(
      await answer_port_message(
        deps,
        AUDIENCE,
        build_handoff_message({ type: "probe", grant: GRANT, wait: false }),
      ),
    ).toEqual({ type: "probe_result", available: true });

    const reply = await answer_port_message(
      deps,
      AUDIENCE,
      build_handoff_message({ type: "request", grant: GRANT, user_id: USER_ID }),
    );

    expect(reply?.type).toBe("session");
  });

  it("answers unavailable on a refused request", async () => {
    const deps = make_deps(approved(), {
      fetch_current_user: async () => me_for(OTHER_ID),
    });

    expect(
      await answer_port_message(
        deps,
        AUDIENCE,
        build_handoff_message({
          type: "request",
          grant: GRANT,
          user_id: USER_ID,
        }),
      ),
    ).toEqual({ type: "unavailable" });
  });
});
