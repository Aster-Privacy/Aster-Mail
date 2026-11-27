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
import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  answer_port_message,
  handle_request,
  holds_issued_token,
  type BridgeDeps,
} from "./session_bridge_core";

import {
  HANDOFF_GRANT_KEY_PREFIX,
  attach_grant_token,
} from "@/lib/session_handoff/session_handoff_grant";
import { build_handoff_message } from "@/lib/session_handoff/session_handoff_protocol";

const FINDLEY_ID = "0b6f1c2e-4a3d-4c8e-9f10-2a3b4c5d6e7f";
const HELLO_ID = "7e6d5c4b-3a2b-4c1d-8e0f-9a8b7c6d5e4f";
const NOW = 1_800_000_000_000;
const AUDIENCE = "https://calendar.astermail.org";
const FIRST_GRANT = "c".repeat(43);
const RENEWAL_GRANT = "d".repeat(43);
const FIRST_TOKEN = "aGVhZGVy.Zmlyc3Q.c2ln";
const RENEWED_TOKEN = "aGVhZGVy.cmVuZXdlZA.c2ln";
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

function base_entries(): Record<string, string> {
  const entries: Record<string, string> = {};

  for (const id of [FINDLEY_ID, HELLO_ID]) {
    entries[`astermail_session_passphrase_${id}`] = encrypted_passphrase;
    entries[`astermail_session_passphrase_iv_${id}`] = passphrase_iv;
    entries[`astermail_encrypted_vault_${id}`] = "QUJDREVGR0g=";
    entries[`astermail_vault_nonce_${id}`] = "bm9uY2U=";
  }

  return entries;
}

function write_approved_grant(
  entries: Record<string, string>,
  grant: string,
  user_id: string,
): void {
  entries[HANDOFF_GRANT_KEY_PREFIX + grant] = JSON.stringify({
    user_id,
    audience: AUDIENCE,
    expires_at: NOW + 60_000,
    state: "approved",
  });
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

function make_deps(
  entries: Record<string, string>,
  request_renewal: BridgeDeps["request_renewal"],
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
    fetch_current_user: async (expected_user_id, access_token) => {
      if (access_token !== FIRST_TOKEN && access_token !== RENEWED_TOKEN) {
        return expected_user_id === HELLO_ID ? me_for(HELLO_ID) : null;
      }

      return expected_user_id === FINDLEY_ID ? me_for(FINDLEY_ID) : null;
    },
    request_renewal,
    decrypt: (key, ciphertext, iv) =>
      crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv as BufferSource },
        key,
        ciphertext as BufferSource,
      ),
  };
}

function attach(
  entries: Record<string, string>,
  deps: BridgeDeps,
  grant: string,
  token: string,
): void {
  write_approved_grant(entries, grant, FINDLEY_ID);
  expect(attach_grant_token(deps.storage, grant, FINDLEY_ID, token, NOW)).toBe(
    true,
  );
}

function renew_message(user_id: string, access_token: string): object {
  return build_handoff_message({ type: "renew", user_id, access_token });
}

async function issue_first_token(
  entries: Record<string, string>,
  deps: BridgeDeps,
): Promise<void> {
  attach(entries, deps, FIRST_GRANT, FIRST_TOKEN);
  const session = await handle_request(deps, FIRST_GRANT, AUDIENCE, FINDLEY_ID);

  expect(session?.access_token).toBe(FIRST_TOKEN);
}

describe("bridge session renewal", () => {
  it("refuses a renewal for a token the bridge never issued", async () => {
    const entries = base_entries();
    const request_renewal = vi.fn(async () => RENEWAL_GRANT);
    const deps = make_deps(entries, request_renewal);

    const reply = await answer_port_message(
      deps,
      AUDIENCE,
      renew_message(FINDLEY_ID, FIRST_TOKEN),
    );

    expect(reply).toEqual({ type: "unavailable" });
    expect(request_renewal).not.toHaveBeenCalled();
  });

  it("hands back a fresh token for the same account and retires the old one", async () => {
    const entries = base_entries();
    const deps: BridgeDeps = make_deps(entries, async (user_id, audience) => {
      expect(user_id).toBe(FINDLEY_ID);
      expect(audience).toBe(AUDIENCE);
      attach(entries, deps, RENEWAL_GRANT, RENEWED_TOKEN);

      return RENEWAL_GRANT;
    });

    await issue_first_token(entries, deps);

    const reply = await answer_port_message(
      deps,
      AUDIENCE,
      renew_message(FINDLEY_ID, FIRST_TOKEN),
    );

    expect(reply?.type).toBe("session");
    if (reply?.type !== "session") return;
    expect(reply.session.user.id).toBe(FINDLEY_ID);
    expect(reply.session.access_token).toBe(RENEWED_TOKEN);
    expect(entries[HANDOFF_GRANT_KEY_PREFIX + RENEWAL_GRANT]).toBeUndefined();
    expect(
      await holds_issued_token(deps, AUDIENCE, FINDLEY_ID, FIRST_TOKEN),
    ).toBe(false);
    expect(
      await holds_issued_token(deps, AUDIENCE, FINDLEY_ID, RENEWED_TOKEN),
    ).toBe(true);
  });

  it("refuses when no Mail tab is still signed in to the account", async () => {
    const entries = base_entries();
    const deps = make_deps(entries, async () => null);

    await issue_first_token(entries, deps);

    const reply = await answer_port_message(
      deps,
      AUDIENCE,
      renew_message(FINDLEY_ID, FIRST_TOKEN),
    );

    expect(reply).toEqual({ type: "unavailable" });
  });

  it("never renews into another account with a token issued for the first", async () => {
    const entries = base_entries();
    const request_renewal = vi.fn(async () => RENEWAL_GRANT);
    const deps = make_deps(entries, request_renewal);

    await issue_first_token(entries, deps);

    const reply = await answer_port_message(
      deps,
      AUDIENCE,
      renew_message(HELLO_ID, FIRST_TOKEN),
    );

    expect(reply).toEqual({ type: "unavailable" });
    expect(request_renewal).not.toHaveBeenCalled();
  });

  it("refuses a renewal grant that belongs to the account the tab switched to", async () => {
    const entries = base_entries();
    const deps = make_deps(entries, async () => {
      write_approved_grant(entries, RENEWAL_GRANT, HELLO_ID);

      return RENEWAL_GRANT;
    });

    await issue_first_token(entries, deps);

    const reply = await answer_port_message(
      deps,
      AUDIENCE,
      renew_message(FINDLEY_ID, FIRST_TOKEN),
    );

    expect(reply).toEqual({ type: "unavailable" });
  });

  it("refuses a renewal from another audience", async () => {
    const entries = base_entries();
    const request_renewal = vi.fn(async () => RENEWAL_GRANT);
    const deps = make_deps(entries, request_renewal);

    await issue_first_token(entries, deps);

    const reply = await answer_port_message(
      deps,
      "https://mail.astermail.org",
      renew_message(FINDLEY_ID, FIRST_TOKEN),
    );

    expect(reply).toEqual({ type: "unavailable" });
    expect(request_renewal).not.toHaveBeenCalled();
  });
});
