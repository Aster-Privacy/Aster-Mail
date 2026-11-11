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
import { build_subject_bundle } from "@/utils/email_crypto";
import {
  clear_attachment_keys,
  get_attachment_entry,
  get_attachment_key,
  has_sealed_attachment_manifest,
  register_envelope_attachment_keys,
} from "@/services/crypto/inbound_attachment_keys";

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

const REAL_KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(3)));
const SWAPPED_KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(9)));

const MANIFEST = [
  {
    seq: 0,
    key: REAL_KEY,
    size: 4,
    sha256: "ab".repeat(32),
    filename: "report.pdf",
    content_type: "application/pdf",
    is_inline: false,
  },
];

function served_envelope(
  body: string,
  swapped: Record<string, unknown> = {},
): DecryptedEnvelope {
  return {
    from: { name: "Support", email: SENDER },
    to: [{ name: "", email: RECIPIENT }],
    cc: [],
    bcc: [],
    subject: "",
    body_text: body,
    body_html: body,
    ...swapped,
  } as unknown as DecryptedEnvelope;
}

const SWAPPED_FIELDS = {
  subject: "Swapped subject",
  body_html: "<p>Swapped body</p>",
  raw_headers: [
    { name: "Reply-To", value: "other@example.com" },
    { name: "X-Kept", value: "1" },
  ],
  attachment_keys: [
    { seq: 0, key: SWAPPED_KEY, filename: "swapped.exe", size: 4 },
  ],
};

describe("sealed message fields", () => {
  beforeEach(() => {
    h.vault = null;
    h.bundle = null;
    h.continuity = "known";
    clear_attachment_keys();
  });

  it("takes subject, body, reply address and attachment keys from the sealed payload", async () => {
    const { envelope_json, receiver_vault } =
      await build_real_internal_envelope(
        build_subject_bundle("Real subject", "<p>Real body</p>", MANIFEST),
      );

    h.vault = receiver_vault;

    const envelope = served_envelope(envelope_json, SWAPPED_FIELDS);

    register_envelope_attachment_keys("msg-sealed", envelope);
    expect(get_attachment_key("msg-sealed", 0)).toBe(SWAPPED_KEY);

    const result = await process_envelope_body(
      envelope,
      RECIPIENT,
      "msg-sealed",
    );

    expect(result.e2e_verified).toBe(true);
    expect(envelope.subject).toBe("Real subject");
    expect(result.safe_html).toContain("Real body");
    expect(JSON.stringify(result)).not.toContain("Swapped");
    expect(envelope.raw_headers).toEqual([{ name: "X-Kept", value: "1" }]);
    expect(has_sealed_attachment_manifest("msg-sealed")).toBe(true);
    expect(get_attachment_key("msg-sealed", 0)).toBe(REAL_KEY);
    expect(get_attachment_entry("msg-sealed", 0)?.filename).toBe("report.pdf");

    register_envelope_attachment_keys("msg-sealed", envelope);
    expect(get_attachment_key("msg-sealed", 0)).toBe(REAL_KEY);
  });

  it("keeps an empty sealed subject instead of the served one", async () => {
    const { envelope_json, receiver_vault } =
      await build_real_internal_envelope(
        build_subject_bundle("", "<p>Real body</p>"),
      );

    h.vault = receiver_vault;

    const envelope = served_envelope(envelope_json, {
      subject: "Swapped subject",
    });

    await process_envelope_body(envelope, RECIPIENT, "msg-empty-subject");

    expect(envelope.subject).toBe("");
  });

  it("still opens a message sealed without an attachment list", async () => {
    const { envelope_json, receiver_vault } =
      await build_real_internal_envelope(
        build_subject_bundle("Older subject", "<p>Older body</p>"),
      );

    h.vault = receiver_vault;

    const envelope = served_envelope(envelope_json, {
      attachment_keys: SWAPPED_FIELDS.attachment_keys,
    });

    register_envelope_attachment_keys("msg-older", envelope);

    const result = await process_envelope_body(
      envelope,
      RECIPIENT,
      "msg-older",
    );

    expect(result.e2e_verified).toBe(true);
    expect(envelope.subject).toBe("Older subject");
    expect(result.safe_html).toContain("Older body");
    expect(has_sealed_attachment_manifest("msg-older")).toBe(false);
    expect(get_attachment_key("msg-older", 0)).toBe(SWAPPED_KEY);
  });

  it("still opens a message sealed as a bare body", async () => {
    const { envelope_json, receiver_vault } =
      await build_real_internal_envelope("A bare body with no wrapper.");

    h.vault = receiver_vault;

    const envelope = served_envelope(envelope_json, {
      body_html: "<p>Swapped body</p>",
    });
    const result = await process_envelope_body(envelope, RECIPIENT, "msg-bare");

    expect(result.e2e_verified).toBe(true);
    expect(result.body_text).toBe("A bare body with no wrapper.");
    expect(JSON.stringify(result)).not.toContain("Swapped");
  });

  it("leaves a message that is not sealed as the server delivered it", async () => {
    h.vault = make_vault((await generate_ratchet_keys())!);

    const envelope = served_envelope("Plain text", {
      subject: "Outside subject",
      body_html: "<p>Outside body</p>",
      raw_headers: [{ name: "Reply-To", value: "list@example.com" }],
    });
    const result = await process_envelope_body(
      envelope,
      RECIPIENT,
      "msg-outside",
    );

    expect(result.e2e_verified).toBe(false);
    expect(envelope.subject).toBe("Outside subject");
    expect(result.safe_html).toContain("Outside body");
    expect(envelope.raw_headers).toEqual([
      { name: "Reply-To", value: "list@example.com" },
    ]);
    expect(has_sealed_attachment_manifest("msg-outside")).toBe(false);
  });
});
