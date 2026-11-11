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
import type { EncryptedVault } from "@/services/crypto/key_manager";
import type { DecryptedEnvelope } from "@/types/email";

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/services/crypto/key_manager_pgp", async (import_original) => ({
  ...(await import_original<
    typeof import("@/services/crypto/key_manager_pgp")
  >()),
  verify_ratchet_prekey_bundle_detailed: async () => ({
    verdict: "verified" as const,
    format: "v2" as const,
    strict: true,
  }),
}));

const h = vi.hoisted(() => ({
  vault: null as unknown,
  bundle: null as unknown,
  names: new Map<string, unknown>(),
  continuity: "known" as "known" | "new" | "changed",
}));

vi.mock(
  "@/services/crypto/sender_identity_authentication",
  async (import_original) => ({
    ...(await import_original<
      typeof import("@/services/crypto/sender_identity_authentication")
    >()),
    check_sender_identity_continuity: vi.fn(async () => h.continuity),
  }),
);

vi.mock("@/services/crypto/memory_key_store", () => ({
  on_vault_cleared: () => () => {},
  on_vault_stored: () => () => {},
  get_vault_from_memory: () =>
    h.vault && {
      data_kek: btoa(String.fromCharCode(...new Uint8Array(32).fill(7))),
      ...(h.vault as object),
    },
  get_passphrase_from_memory: () => null,
  get_passphrase_bytes: () => null,
  get_derived_encryption_key: () => new Uint8Array(32).fill(7),
  has_vault_in_memory: () => h.vault !== null,
}));

vi.mock("@/services/crypto/encrypted_storage", async () => ({
  ...(
    await import("@/tests/fixtures/storage_name_support")
  ).storage_name_support(h.names),
  encrypted_get: vi.fn(async (key: string) =>
    key.startsWith("storage_name_key") ? h.names.get(key) : undefined,
  ),
  encrypted_set: vi.fn(async () => {}),
  encrypted_delete: vi.fn(async () => {}),
}));

vi.mock("@/services/crypto/ratchet_plaintext_cache", () => ({
  get_cached_ratchet_plaintext: vi.fn(async () => null),
  get_cached_ratchet_sender_key: vi.fn(async () => null),
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

import { process_envelope_body } from "./build_email_from_envelope";

import {
  generate_ratchet_keys,
  encrypt_for_ratchet_recipient,
  build_ratchet_envelope,
} from "@/services/crypto/ratchet_manager";
import {
  build_subject_bundle,
  decrypt_body_text_with_bundle,
} from "@/utils/email_crypto";
import { settle_bundle_subject } from "@/services/crypto/sealed_message_fields";

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

  const envelope_json = build_ratchet_envelope(
    sender_vault.ratchet_identity_public!,
    {
      [RECIPIENT]: recipient_data!,
    },
  );

  expect(envelope_json).toContain("double_ratchet_v2");

  return { envelope_json, receiver_vault };
}

function served_envelope(body: string, subject: string): DecryptedEnvelope {
  return {
    from: { name: "Support", email: SENDER },
    to: [{ name: "", email: RECIPIENT }],
    cc: [],
    bcc: [],
    subject,
    body_text: body,
    body_html: body,
  } as unknown as DecryptedEnvelope;
}

describe("sealed flag on a decrypted body", () => {
  beforeEach(() => {
    h.vault = null;
    h.bundle = null;
    h.continuity = "known";
  });

  it("reports a sealed body so a row takes the sealed subject", async () => {
    const { envelope_json, receiver_vault } =
      await build_real_internal_envelope(
        build_subject_bundle("Real subject", "<p>Real body</p>"),
      );

    h.vault = receiver_vault;

    const envelope = served_envelope(envelope_json, "Swapped subject");
    const bundle = await decrypt_body_text_with_bundle(
      envelope.body_text,
      RECIPIENT,
      SENDER,
      "msg-row",
    );

    expect(bundle.sealed).toBe(true);
    expect(bundle.subject).toBe("Real subject");

    settle_bundle_subject(envelope, bundle);

    expect(envelope.subject).toBe("Real subject");
  });

  it("binds the sender for a sealed body in the viewer", async () => {
    const { envelope_json, receiver_vault } =
      await build_real_internal_envelope(
        build_subject_bundle("Real subject", "<p>Real body</p>"),
      );

    h.vault = receiver_vault;

    const result = await process_envelope_body(
      served_envelope(envelope_json, "Swapped subject"),
      RECIPIENT,
      "msg-view",
    );

    expect(result.e2e_verified).toBe(true);
    expect(result.e2e_sender_bound).toBe(true);
  });

  it("does not report a plain body as sealed", async () => {
    const envelope = served_envelope("plain text body", "Served subject");
    const bundle = await decrypt_body_text_with_bundle(
      envelope.body_text,
      RECIPIENT,
      SENDER,
      "msg-plain",
    );

    expect(bundle.sealed).toBe(false);

    settle_bundle_subject(envelope, bundle);

    expect(envelope.subject).toBe("Served subject");
  });
});
