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
  handle_request,
  me_request_init,
  type BridgeDeps,
} from "./session_bridge_core";

import {
  HANDOFF_GRANT_KEY_PREFIX,
  attach_grant_token,
} from "@/lib/session_handoff/session_handoff_grant";
import { parse_handoff_session } from "@/lib/session_handoff/session_handoff_protocol";

const FINDLEY_ID = "0b6f1c2e-4a3d-4c8e-9f10-2a3b4c5d6e7f";
const HELLO_ID = "7e6d5c4b-3a2b-4c1d-8e0f-9a8b7c6d5e4f";
const NOW = 1_800_000_000_000;
const AUDIENCE = "https://calendar.astermail.org";
const GRANT = "c".repeat(43);
const FINDLEY_TOKEN = "aGVhZGVy.ZmluZGxleQ.c2ln";
const PASSPHRASE = "findley passphrase";

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

function two_account_entries(): Record<string, string> {
  const entries: Record<string, string> = {};

  for (const id of [FINDLEY_ID, HELLO_ID]) {
    entries[`astermail_session_passphrase_${id}`] = encrypted_passphrase;
    entries[`astermail_session_passphrase_iv_${id}`] = passphrase_iv;
    entries[`astermail_encrypted_vault_${id}`] = "QUJDREVGR0g=";
    entries[`astermail_vault_nonce_${id}`] = "bm9uY2U=";
  }
  entries[HANDOFF_GRANT_KEY_PREFIX + GRANT] = JSON.stringify({
    user_id: FINDLEY_ID,
    audience: AUDIENCE,
    expires_at: NOW + 60_000,
    state: "approved",
  });

  return entries;
}

function me_for(id: string) {
  return {
    user_id: id,
    username: id === FINDLEY_ID ? "findley" : "hello",
    email: id === FINDLEY_ID ? "findley@astermail.org" : "hello@astermail.org",
    display_name: null,
    profile_color: "#123456",
    profile_picture: null,
  };
}

interface MeCall {
  expected_user_id: string;
  access_token: string | null;
}

function server_with_hello_cookie(calls: MeCall[]) {
  return async (expected_user_id: string, access_token: string | null) => {
    calls.push({ expected_user_id, access_token });
    if (access_token === FINDLEY_TOKEN) return me_for(FINDLEY_ID);
    if (expected_user_id !== HELLO_ID) return null;

    return me_for(HELLO_ID);
  };
}

function make_deps(
  entries: Record<string, string>,
  calls: MeCall[],
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
    fetch_current_user: server_with_hello_cookie(calls),
    decrypt: (key, ciphertext, iv) =>
      crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv as BufferSource },
        key,
        ciphertext as BufferSource,
      ),
  };
}

describe("bridge with two accounts on this device", () => {
  it("verifies the grant user with that user's token, not the shared cookie", async () => {
    const entries = two_account_entries();
    const calls: MeCall[] = [];

    expect(
      attach_grant_token(
        make_deps(entries, calls).storage,
        GRANT,
        FINDLEY_ID,
        FINDLEY_TOKEN,
        NOW,
      ),
    ).toBe(true);

    const session = await handle_request(
      make_deps(entries, calls),
      GRANT,
      AUDIENCE,
      FINDLEY_ID,
    );

    expect(calls).toEqual([
      { expected_user_id: FINDLEY_ID, access_token: FINDLEY_TOKEN },
    ]);
    expect(session?.user.id).toBe(FINDLEY_ID);
    expect(session?.user.email).toBe("findley@astermail.org");
    expect(session?.access_token).toBe(FINDLEY_TOKEN);
    expect(entries[HANDOFF_GRANT_KEY_PREFIX + GRANT]).toBeUndefined();
  });

  it("refuses when only the other account's cookie is present", async () => {
    const entries = two_account_entries();
    const calls: MeCall[] = [];
    const session = await handle_request(
      make_deps(entries, calls),
      GRANT,
      AUDIENCE,
      FINDLEY_ID,
    );

    expect(calls).toEqual([{ expected_user_id: FINDLEY_ID, access_token: null }]);
    expect(session).toBeNull();
  });

  it("never attaches a token to a grant for another account", () => {
    const entries = two_account_entries();
    const storage = make_deps(entries, []).storage;

    expect(
      attach_grant_token(storage, GRANT, HELLO_ID, FINDLEY_TOKEN, NOW),
    ).toBe(false);
    expect(attach_grant_token(storage, GRANT, FINDLEY_ID, "not a jwt", NOW)).toBe(
      false,
    );
    expect(
      attach_grant_token(storage, GRANT, FINDLEY_ID, FINDLEY_TOKEN, NOW + 61_000),
    ).toBe(false);
  });

  it("keeps the grant single use after a token is attached", async () => {
    const entries = two_account_entries();
    const calls: MeCall[] = [];
    const deps = make_deps(entries, calls);

    attach_grant_token(deps.storage, GRANT, FINDLEY_ID, FINDLEY_TOKEN, NOW);
    await handle_request(deps, GRANT, AUDIENCE, FINDLEY_ID);

    expect(await handle_request(deps, GRANT, AUDIENCE, FINDLEY_ID)).toBeNull();
  });

  it("sends the expected account header and drops the cookie with a token", () => {
    const with_token = me_request_init(FINDLEY_ID, FINDLEY_TOKEN);
    const headers = with_token.headers as Record<string, string>;

    expect(headers["X-Aster-Expected-User"]).toBe(FINDLEY_ID);
    expect(headers.Authorization).toBe(`Bearer ${FINDLEY_TOKEN}`);
    expect(with_token.credentials).toBe("omit");

    const cookie_only = me_request_init(FINDLEY_ID, null);

    expect(
      (cookie_only.headers as Record<string, string>)["X-Aster-Expected-User"],
    ).toBe(FINDLEY_ID);
    expect(cookie_only.credentials).toBe("same-origin");
  });

  it("carries the token through the protocol and rejects a malformed one", () => {
    const base = {
      user: { id: FINDLEY_ID, username: "findley", email: "findley@astermail.org" },
      passphrase: "p",
      encrypted_vault: "QUJD",
      vault_nonce: "bm9u",
    };

    expect(
      parse_handoff_session({ ...base, access_token: FINDLEY_TOKEN })?.access_token,
    ).toBe(FINDLEY_TOKEN);
    expect(parse_handoff_session({ ...base, access_token: "x y" })).toBeNull();
    expect(parse_handoff_session(base)?.access_token).toBeUndefined();
  });
});
