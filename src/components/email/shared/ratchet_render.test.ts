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
import { describe, it, expect, beforeEach, vi } from "vitest";

import type { EncryptedVault } from "@/services/crypto/key_manager";
import type { DecryptedEnvelope } from "@/types/email";

const h = vi.hoisted(() => ({
  vault: null as unknown,
  bundle: null as unknown,
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_vault_from_memory: () => h.vault,
  get_passphrase_from_memory: () => null,
  get_passphrase_bytes: () => null,
  get_derived_encryption_key: () => new Uint8Array(32).fill(7),
  has_vault_in_memory: () => h.vault !== null,
}));

vi.mock("@/services/crypto/encrypted_storage", () => ({
  encrypted_get: vi.fn(async () => undefined),
  encrypted_set: vi.fn(async () => {}),
  encrypted_delete: vi.fn(async () => {}),
}));

vi.mock("@/services/crypto/ratchet_plaintext_cache", () => ({
  get_cached_ratchet_plaintext: vi.fn(async () => null),
  set_cached_ratchet_plaintext: vi.fn(async () => {}),
}));

vi.mock("@/utils/unsubscribe_detector", () => ({
  detect_unsubscribe_info: () => undefined,
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: vi.fn(async (url: string) =>
      url.includes("prekey-bundle")
        ? { data: h.bundle }
        : { code: "NOT_FOUND" },
    ),
    put: vi.fn(async () => ({ data: { state_version: 1 } })),
    post: vi.fn(async () => ({ data: { state_version: 1 } })),
    delete: vi.fn(async () => ({})),
  },
}));

import {
  generate_ratchet_keys,
  encrypt_for_ratchet_recipient,
  build_ratchet_envelope,
} from "@/services/crypto/ratchet_manager";
import { api_client } from "@/services/api/client";
import { process_envelope_body } from "./build_email_from_envelope";

const SENDER = "sender@astermail.org";
const RECIPIENT = "recipient@astermail.org";

function make_vault(keys: {
  identity_jwk: string;
  identity_public: string;
  signed_prekey_jwk: string;
  signed_prekey_public: string;
}): EncryptedVault {
  return {
    identity_key: "",
    signed_prekey: "",
    signed_prekey_private: "",
    recovery_codes: [],
    ratchet_identity_key: keys.identity_jwk,
    ratchet_identity_public: keys.identity_public,
    ratchet_signed_prekey: keys.signed_prekey_jwk,
    ratchet_signed_prekey_public: keys.signed_prekey_public,
  } as unknown as EncryptedVault;
}

async function build_real_internal_envelope(
  plaintext: string,
): Promise<{ envelope_json: string; receiver_vault: EncryptedVault }> {
  const sender_keys = (await generate_ratchet_keys())!;
  const receiver_keys = (await generate_ratchet_keys())!;

  const sender_vault = make_vault(sender_keys);
  const receiver_vault = make_vault(receiver_keys);

  h.bundle = {
    kem_identity_key: receiver_keys.identity_public,
    signed_prekey: receiver_keys.signed_prekey_public,
    signed_prekey_signature: "",
    one_time_prekey: null,
    pq_prekey: null,
  };

  h.vault = sender_vault;

  const recipient_data = await encrypt_for_ratchet_recipient(
    SENDER,
    RECIPIENT,
    "recipient",
    plaintext,
    sender_vault,
  );

  expect(recipient_data).not.toBeNull();
  expect(recipient_data!.header.message_number).toBe(0);

  const envelope_json = build_ratchet_envelope(sender_vault.ratchet_identity_public!, {
    [RECIPIENT]: recipient_data!,
  });

  // This mirrors how the backend stores internal ratchet mail: the same
  // double_ratchet_v2 envelope is placed in BOTH body_text and body_html.
  expect(envelope_json).toContain("double_ratchet_v2");

  return { envelope_json, receiver_vault };
}

function envelope_with(body: string): DecryptedEnvelope {
  return {
    from: { name: "Support", email: SENDER },
    to: [{ name: "", email: RECIPIENT }],
    cc: [],
    bcc: [],
    subject: "",
    body_text: body,
    body_html: body,
  } as unknown as DecryptedEnvelope;
}

describe("internal ratchet mail rendering", () => {
  beforeEach(() => {
    h.vault = null;
    h.bundle = null;
  });

  it("renders the decrypted plaintext, never the raw double_ratchet_v2 envelope (success path)", async () => {
    const secret = "Here is how to sign in to the browser. Use the code 481920.";
    const { envelope_json, receiver_vault } =
      await build_real_internal_envelope(secret);

    h.vault = receiver_vault;

    const result = await process_envelope_body(
      envelope_with(envelope_json),
      RECIPIENT,
      "msg-1",
    );

    // The body the UI shows must be the real plaintext.
    expect(result.body_text).toBe(secret);

    // The HTML the UI prefers (html_content) must NOT be the raw envelope.
    expect(result.safe_html ?? "").not.toContain("double_ratchet_v2");
    expect(result.safe_html ?? "").not.toContain("sender_identity_key");

    // Nothing anywhere in the rendered output may leak the envelope JSON.
    expect(JSON.stringify(result)).not.toContain("double_ratchet_v2");
  });

  it("falls back to the undecryptable sentinel (not the raw envelope) when keys do not match (failure path)", async () => {
    const { envelope_json } = await build_real_internal_envelope("secret body");

    // A receiver whose vault keys do not match the bundle the sender used.
    const wrong_keys = (await generate_ratchet_keys())!;
    h.vault = make_vault(wrong_keys);

    const result = await process_envelope_body(
      envelope_with(envelope_json),
      RECIPIENT,
      "msg-2",
    );

    // Failure must surface the sentinel (UI turns this into "message
    // unavailable"), and must NEVER surface the raw envelope.
    expect(result.body_text).toBe("\x00ASTER_RATCHET_UNDECRYPTABLE\x00");
    expect(result.safe_html ?? "").not.toContain("double_ratchet_v2");
    expect(JSON.stringify(result)).not.toContain("double_ratchet_v2");
  });

  it("does not push ratchet state to the server when decrypting a fresh-bootstrap message", async () => {
    const { envelope_json, receiver_vault } =
      await build_real_internal_envelope("a short reply");

    h.vault = receiver_vault;

    // Ignore the writes the sender made while building the envelope; we only
    // care about what the RECEIVE/decrypt path does.
    (api_client.put as ReturnType<typeof vi.fn>).mockClear();
    (api_client.post as ReturnType<typeof vi.fn>).mockClear();

    const result = await process_envelope_body(
      envelope_with(envelope_json),
      RECIPIENT,
      "msg-3",
    );

    expect(result.body_text).toBe("a short reply");

    // A fresh bootstrap is reconstructed from the message itself on every
    // decrypt, so the receive path must not persist ratchet state server-side.
    expect((api_client.put as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(
      0,
    );
    expect(
      (api_client.post as ReturnType<typeof vi.fn>).mock.calls,
    ).toHaveLength(0);
  });

  it("does not push ratchet state to the server when SENDING a fresh-bootstrap message", async () => {
    const sender_keys = (await generate_ratchet_keys())!;
    const receiver_keys = (await generate_ratchet_keys())!;

    h.bundle = {
      kem_identity_key: receiver_keys.identity_public,
      signed_prekey: receiver_keys.signed_prekey_public,
      signed_prekey_signature: "",
      one_time_prekey: null,
      pq_prekey: null,
    };

    const sender_vault = make_vault(sender_keys);
    h.vault = sender_vault;

    (api_client.put as ReturnType<typeof vi.fn>).mockClear();
    (api_client.post as ReturnType<typeof vi.fn>).mockClear();

    const recipient_data = await encrypt_for_ratchet_recipient(
      SENDER,
      RECIPIENT,
      "recipient",
      "a brand new conversation",
      sender_vault,
    );

    expect(recipient_data).not.toBeNull();
    expect(recipient_data!.header.message_number).toBe(0);
    expect((api_client.put as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(
      0,
    );
    expect(
      (api_client.post as ReturnType<typeof vi.fn>).mock.calls,
    ).toHaveLength(0);
  });
});
