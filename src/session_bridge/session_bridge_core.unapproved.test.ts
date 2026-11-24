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
import { beforeAll, describe, expect, it } from "vitest";

import { answer_port_message, type BridgeDeps } from "./session_bridge_core";

import {
  CALENDAR_WEB_ORIGIN,
  SESSION_HANDOFF_PROTOCOL,
} from "@/lib/session_handoff/session_handoff_protocol";

const USER_ID = "3f2a8c1e-5b4d-4e6f-9a7b-1c2d3e4f5a6b";
const NEVER_APPROVED_GRANT = "c".repeat(43);
const PASSPHRASE = "vault passphrase";

let entries: Record<string, string> = {};
let session_key: CryptoKey;

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

  entries = {
    [`astermail_session_passphrase_${USER_ID}`]: to_base64(
      new Uint8Array(cipher),
    ),
    [`astermail_session_passphrase_iv_${USER_ID}`]: to_base64(iv),
    [`astermail_encrypted_vault_${USER_ID}`]: "QUJDREVGR0g=",
    [`astermail_vault_nonce_${USER_ID}`]: "bm9uY2U=",
  };
});

function signed_in_deps(): BridgeDeps {
  return {
    storage: {
      get: (key: string) => (key in entries ? entries[key] : null),
      set: (key: string, value: string) => {
        entries[key] = value;
      },
      remove: (key: string) => {
        delete entries[key];
      },
      keys: () => Object.keys(entries),
    },
    now: () => 1_800_000_000_000,
    sleep: async () => undefined,
    load_session_key: async () => session_key,
    fetch_current_user: async () => ({
      user_id: USER_ID,
      username: "alex",
      email: "alex@astermail.org",
    }),
    decrypt: (key: CryptoKey, ciphertext: Uint8Array, iv: Uint8Array) =>
      crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv as BufferSource },
        key,
        ciphertext as BufferSource,
      ),
  } as BridgeDeps;
}

const requests: Record<string, unknown>[] = [
  { protocol: SESSION_HANDOFF_PROTOCOL, type: "request", user_id: USER_ID },
  {
    protocol: SESSION_HANDOFF_PROTOCOL,
    type: "request",
    user_id: USER_ID,
    grant: NEVER_APPROVED_GRANT,
  },
];

type AnswerWithAudience = (
  deps: BridgeDeps,
  audience: string,
  data: unknown,
) => Promise<unknown>;
type AnswerWithoutAudience = (
  deps: BridgeDeps,
  data: unknown,
) => Promise<unknown>;

async function every_reply(): Promise<unknown[]> {
  const replies: unknown[] = [];

  for (const request of requests) {
    replies.push(
      await (answer_port_message as unknown as AnswerWithoutAudience)(
        signed_in_deps(),
        request,
      ),
    );
    replies.push(
      await (answer_port_message as unknown as AnswerWithAudience)(
        signed_in_deps(),
        CALENDAR_WEB_ORIGIN,
        request,
      ),
    );
  }

  return replies;
}

describe("session bridge without the signed-in user's approval", () => {
  it("never hands the vault passphrase to a sibling page", async () => {
    const replies = await every_reply();

    for (const reply of replies) {
      expect(JSON.stringify(reply ?? null)).not.toContain(PASSPHRASE);
      expect(reply).not.toMatchObject({ type: "session" });
    }
  });
});
