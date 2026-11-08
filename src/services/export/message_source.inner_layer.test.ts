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
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as openpgp from "openpgp";

const list_mail_items = vi.fn();
const decrypt_mail_envelope = vi.fn();
const decrypt_ratchet_message = vi.fn();

const key_store = vi.hoisted(() => ({
  vault: null as { identity_key: string; previous_keys?: string[] } | null,
  passphrase: null as string | null,
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  on_vault_stored: () => () => {},
  on_vault_cleared: vi.fn(() => () => {}),
  get_passphrase_bytes: vi.fn(() => null),
  get_vault_from_memory: vi.fn(() => key_store.vault),
  get_passphrase_from_memory: vi.fn(() => key_store.passphrase),
  wait_for_keys_ready: vi.fn(async () => undefined),
}));

vi.mock("@/services/api/mail", () => ({
  list_mail_items: (...args: unknown[]) => list_mail_items(...args),
}));

vi.mock("@/services/api/attachments", () => ({
  list_attachments: vi.fn(),
}));

vi.mock("@/components/email/shared/decrypt_envelope", () => ({
  decrypt_mail_envelope: (...args: unknown[]) => decrypt_mail_envelope(...args),
}));

vi.mock("@/services/crypto/ratchet_manager", async () => {
  const types = await vi.importActual<
    typeof import("@/services/crypto/ratchet_types")
  >("@/services/crypto/ratchet_types");

  return {
    parse_ratchet_envelope: types.parse_ratchet_envelope,
    decrypt_ratchet_message: (...args: unknown[]) =>
      decrypt_ratchet_message(...args),
  };
});

vi.mock("@/services/account_manager", () => ({
  get_current_account: vi.fn(async () => ({
    user: { email: "esbardu@aster.cx" },
  })),
}));

import { create_account_message_source } from "./message_source";

import { serialize_envelope_to_bytes } from "@/utils/export";
import { ASTER_SUBJECT_BUNDLE_PREFIX } from "@/utils/email_crypto";

import type { DecryptedEnvelope } from "@/types/email";
import type { ExportError, ExportScope, PipelineMessage } from "./pipeline";

const OUR_EMAIL = "esbardu@aster.cx";
const SENDER = "hello@astermail.org";
const PASSPHRASE = "export-vault-passphrase";

const RATCHET_ENVELOPE = JSON.stringify({
  type: "double_ratchet_v2",
  sender_identity_key: "AAAA",
  recipients: { [OUR_EMAIL]: { header: {}, ciphertext: "BBBB" } },
});

let own_private_key = "";
let own_public_key = "";
let foreign_public_key = "";

const scope: ExportScope = { preset: "all" };

function mail_item(id: string, item_type = "received") {
  return {
    id,
    encrypted_envelope: "enc",
    envelope_nonce: "nonce",
    created_at: "2026-11-01T00:00:00.000Z",
    folder_token: "inbox",
    item_type,
    has_attachments: false,
  };
}

function envelope(
  body_text: string,
  body_html: string | undefined,
  from = SENDER,
  to = OUR_EMAIL,
): DecryptedEnvelope {
  return {
    subject: "Welcome",
    body_text,
    body_html,
    from: { name: "", email: from },
    to: [{ name: "", email: to }],
    cc: [],
    bcc: [],
    sent_at: "2026-11-01T00:00:00.000Z",
  } as unknown as DecryptedEnvelope;
}

function serve(items: ReturnType<typeof mail_item>[]) {
  list_mail_items.mockResolvedValue({
    data: { items, has_more: false, next_cursor: null, total: items.length },
  });
}

async function collect(
  report_error: (e: ExportError) => void = () => {},
): Promise<PipelineMessage[]> {
  const source = create_account_message_source();
  const controller = new AbortController();
  const out: PipelineMessage[] = [];

  for await (const msg of source.messages(
    scope,
    controller.signal,
    report_error,
  )) {
    out.push(msg);
  }

  return out;
}

async function serialized(msg: PipelineMessage): Promise<string> {
  const bytes = await serialize_envelope_to_bytes(msg.envelope!, [], {
    is_sent_or_draft: msg.is_sent_or_draft,
  });

  return new TextDecoder().decode(bytes);
}

async function encrypt_to(public_key: string, text: string): Promise<string> {
  const encrypted = await openpgp.encrypt({
    message: await openpgp.createMessage({ text }),
    encryptionKeys: await openpgp.readKey({ armoredKey: public_key }),
    format: "armored",
  });

  return encrypted.toString();
}

function expect_no_ciphertext(raw: string) {
  expect(raw).not.toContain("double_ratchet");
  expect(raw).not.toContain("BEGIN PGP MESSAGE");
  expect(raw).not.toContain("ASTER_RATCHET_UNDECRYPTABLE");
  expect(raw).not.toContain("ASTER_PGP_UNDECRYPTABLE");
}

describe("export of end-to-end encrypted bodies", () => {
  beforeAll(async () => {
    const own = await openpgp.generateKey({
      userIDs: [{ email: OUR_EMAIL }],
      passphrase: PASSPHRASE,
      format: "armored",
    });
    const foreign = await openpgp.generateKey({
      userIDs: [{ email: "probando@aster.cx" }],
      passphrase: "foreign",
      format: "armored",
    });

    own_private_key = own.privateKey;
    own_public_key = own.publicKey;
    foreign_public_key = foreign.publicKey;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    key_store.vault = { identity_key: own_private_key };
    key_store.passphrase = PASSPHRASE;
  });

  it("writes the decrypted html and text of received ratchet mail", async () => {
    serve([mail_item("mail_1")]);
    decrypt_mail_envelope.mockResolvedValue(
      envelope(RATCHET_ENVELOPE, RATCHET_ENVELOPE),
    );
    decrypt_ratchet_message.mockResolvedValue(
      "<p>Thanks for joining Aster</p>",
    );

    const errors: ExportError[] = [];
    const out = await collect((e) => errors.push(e));

    expect(errors).toEqual([]);
    expect(out).toHaveLength(1);
    expect(decrypt_ratchet_message).toHaveBeenCalledWith(
      OUR_EMAIL,
      SENDER,
      expect.objectContaining({ type: "double_ratchet_v2" }),
      key_store.vault,
      "mail_1",
    );

    const raw = await serialized(out[0]);

    expect_no_ciphertext(raw);
    expect(raw).toContain("Content-Type: text/html");
    expect(raw).toContain("Content-Type: text/plain");
    expect(raw).toContain("<p>Thanks for joining Aster</p>");
    expect(raw).toMatch(/text\/plain[\s\S]*Thanks for joining Aster/);
  });

  it("writes plain text ratchet mail as text without a fake html part", async () => {
    serve([mail_item("mail_2")]);
    decrypt_mail_envelope.mockResolvedValue(
      envelope(RATCHET_ENVELOPE, RATCHET_ENVELOPE),
    );
    decrypt_ratchet_message.mockResolvedValue("Line one\nLine two");

    const out = await collect();
    const raw = await serialized(out[0]);

    expect_no_ciphertext(raw);
    expect(raw).not.toContain("text/html");
    expect(raw).toContain("Line one\r\nLine two");
  });

  it("decrypts sent ratchet items from our own copy", async () => {
    serve([mail_item("mail_3", "sent")]);
    decrypt_mail_envelope.mockResolvedValue(
      envelope(RATCHET_ENVELOPE, RATCHET_ENVELOPE, OUR_EMAIL, SENDER),
    );
    decrypt_ratchet_message.mockResolvedValue("<p>Sent reply</p>");

    const out = await collect();

    expect(decrypt_ratchet_message).toHaveBeenCalledWith(
      OUR_EMAIL,
      OUR_EMAIL,
      expect.anything(),
      key_store.vault,
      "mail_3",
    );
    expect(out[0].is_sent_or_draft).toBe(true);

    const raw = await serialized(out[0]);

    expect_no_ciphertext(raw);
    expect(raw).toContain("<p>Sent reply</p>");
  });

  it("restores the subject carried inside a ratchet body", async () => {
    serve([mail_item("mail_4")]);
    decrypt_mail_envelope.mockResolvedValue({
      ...envelope(RATCHET_ENVELOPE, RATCHET_ENVELOPE),
      subject: "",
    });
    decrypt_ratchet_message.mockResolvedValue(
      ASTER_SUBJECT_BUNDLE_PREFIX +
        JSON.stringify({ s: "Inner subject", b: "<p>Bundled body</p>" }),
    );

    const out = await collect();
    const raw = await serialized(out[0]);

    expect(out[0].envelope!.subject).toBe("Inner subject");
    expect(raw).toContain("Subject: Inner subject");
    expect(raw).toContain("<p>Bundled body</p>");
    expect(raw).not.toContain("ASTER_BUNDLE_V2");
  });

  it("decrypts a PGP body sent to our key", async () => {
    const armored = await encrypt_to(own_public_key, "PGP secret plan");

    serve([mail_item("mail_5")]);
    decrypt_mail_envelope.mockResolvedValue(envelope(armored, undefined));

    const out = await collect();
    const raw = await serialized(out[0]);

    expect_no_ciphertext(raw);
    expect(raw).toContain("PGP secret plan");
  });

  it("reports and skips ratchet mail that cannot be decrypted", async () => {
    serve([mail_item("mail_6"), mail_item("mail_7")]);
    decrypt_mail_envelope
      .mockResolvedValueOnce(envelope(RATCHET_ENVELOPE, RATCHET_ENVELOPE))
      .mockResolvedValueOnce(envelope("Plain reply", "<p>Plain reply</p>"));
    decrypt_ratchet_message.mockResolvedValue(null);

    const errors: ExportError[] = [];
    const out = await collect((e) => errors.push(e));

    expect(out.map((m) => m.message_id)).toEqual(["mail_7"]);
    expect(errors).toEqual([
      expect.objectContaining({
        kind: "decrypt",
        code: "envelope_undecryptable",
      }),
    ]);
  });

  it("reports and skips PGP mail sent to a key we no longer hold", async () => {
    const armored = await encrypt_to(foreign_public_key, "Lost message");

    serve([mail_item("mail_8")]);
    decrypt_mail_envelope.mockResolvedValue(envelope(armored, undefined));

    const errors: ExportError[] = [];
    const out = await collect((e) => errors.push(e));

    expect(out).toEqual([]);
    expect(errors).toEqual([
      expect.objectContaining({
        kind: "decrypt",
        code: "envelope_undecryptable",
      }),
    ]);
  });

  it("leaves ordinary mail untouched", async () => {
    const plain = envelope("Hello", "<p>Hello</p>");

    serve([mail_item("mail_9")]);
    decrypt_mail_envelope.mockResolvedValue(plain);

    const out = await collect();

    expect(out[0].envelope).toBe(plain);
    expect(decrypt_ratchet_message).not.toHaveBeenCalled();
  });
});
