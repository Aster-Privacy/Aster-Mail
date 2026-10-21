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

const api_mocks = vi.hoisted(() => ({
  get_thread_messages: vi.fn(),
}));

const envelope_mocks = vi.hoisted(() => ({
  decrypt_mail_envelope: vi.fn(),
}));

const key_store = vi.hoisted(() => ({
  vault: null as { identity_key: string; previous_keys?: string[] } | null,
  passphrase: null as string | null,
}));

vi.mock("./api/mail", () => ({
  get_mail_item: vi.fn(),
  create_thread: vi.fn(),
  link_mail_to_thread: vi.fn(),
  list_mail_items: vi.fn(),
  ...api_mocks,
}));

vi.mock("./crypto/memory_key_store", () => ({
  get_passphrase_bytes: vi.fn(() => null),
  get_vault_from_memory: vi.fn(() => key_store.vault),
  get_passphrase_from_memory: vi.fn(() => key_store.passphrase),
  wait_for_keys_ready: vi.fn(async () => undefined),
  on_vault_cleared: vi.fn(() => () => {}),
}));

vi.mock("./crypto/ratchet_manager", () => ({
  parse_ratchet_envelope: vi.fn(() => null),
  decrypt_ratchet_message: vi.fn(),
}));

vi.mock("./crypto/mail_metadata", () => ({
  decrypt_mail_metadata: vi.fn(async () => null),
}));

vi.mock("@/components/email/shared/decrypt_envelope", () => envelope_mocks);

const { fetch_and_decrypt_thread_messages } = await import("./thread_service");
const { clear_thread_decrypt_cache } = await import("./thread_decrypt_cache");
const { process_envelope_body } =
  await import("@/components/email/shared/build_email_from_envelope");
const { unwrap_html_armor } = await import("@/utils/email_crypto");

const PASSPHRASE = "recipient-vault-passphrase";
const PLAINTEXT =
  "Hi,\r\n\r\nThis is an inline PGP test from another provider.\r\n\r\nDavid";

let recipient_private_key = "";
let recipient_public_key = "";
let sender_private_key = "";

function mail_parser_text_to_html(text: string): string {
  let out = "<html><body>";

  for (const ch of text) {
    if (ch === "\n") out += "<br/>";
    else if (ch === "<") out += "&lt;";
    else if (ch !== "\r") out += ch;
  }

  return `${out}</body></html>`;
}

async function inline_pgp_body(): Promise<string> {
  const encrypted = await openpgp.encrypt({
    message: await openpgp.createMessage({ text: PLAINTEXT }),
    encryptionKeys: await openpgp.readKey({ armoredKey: recipient_public_key }),
    signingKeys: await openpgp.decryptKey({
      privateKey: await openpgp.readPrivateKey({
        armoredKey: sender_private_key,
      }),
      passphrase: "sender",
    }),
    format: "armored",
  });

  return encrypted
    .toString()
    .replace(
      "-----BEGIN PGP MESSAGE-----\n",
      "-----BEGIN PGP MESSAGE-----\nVersion: ProtonMail\n",
    )
    .replace(/\n/g, "\r\n");
}

function envelope(body_text: string, body_html: string | undefined) {
  return {
    subject: "Inline test",
    body_text,
    body_html,
    from: { name: "David", email: "david@example.com" },
    to: [{ name: "", email: "me@example.com" }],
    cc: [],
    bcc: [],
    sent_at: "2026-10-20T14:00:00.000Z",
  };
}

async function open_thread(id: string) {
  api_mocks.get_thread_messages.mockResolvedValue({
    data: {
      thread_token: "thread-1",
      messages: [
        {
          id,
          item_type: "received",
          encrypted_envelope: "env",
          envelope_nonce: "nonce",
          created_at: "2026-10-20T14:00:00.000Z",
          is_external: true,
        },
      ],
    },
  });
  const result = await fetch_and_decrypt_thread_messages(
    "thread-1",
    "me@example.com",
  );

  return result.messages[0];
}

function normalized(text: string): string {
  return text.replace(/\r\n/g, "\n").trim();
}

describe("inline PGP mail from another provider", () => {
  beforeAll(async () => {
    const recipient = await openpgp.generateKey({
      userIDs: [{ email: "me@example.com" }],
      passphrase: PASSPHRASE,
      format: "armored",
    });
    const sender = await openpgp.generateKey({
      userIDs: [{ email: "david@example.com" }],
      passphrase: "sender",
      format: "armored",
    });

    recipient_private_key = recipient.privateKey;
    recipient_public_key = recipient.publicKey;
    sender_private_key = sender.privateKey;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    clear_thread_decrypt_cache();
    key_store.vault = { identity_key: recipient_private_key };
    key_store.passphrase = PASSPHRASE;
  });

  it("decrypts a text/plain inline message that also carries the parser's HTML copy", async () => {
    const armored = await inline_pgp_body();

    envelope_mocks.decrypt_mail_envelope.mockResolvedValue(
      envelope(armored, mail_parser_text_to_html(armored)),
    );

    const message = await open_thread("inline-1");

    expect(normalized(message.body)).toBe(normalized(PLAINTEXT));
    expect(message.body).not.toContain("BEGIN PGP MESSAGE");
    expect(message.html_content).toBeUndefined();
  });

  it("decrypts an inline message that only reached us as HTML", async () => {
    const armored = await inline_pgp_body();

    envelope_mocks.decrypt_mail_envelope.mockResolvedValue(
      envelope("", mail_parser_text_to_html(armored)),
    );

    const message = await open_thread("inline-2");

    expect(normalized(message.body)).toBe(normalized(PLAINTEXT));
    expect(message.html_content).toBeUndefined();
  });

  it("decrypts an inline block wrapped in pre and paragraph markup", async () => {
    const armored = (await inline_pgp_body()).replace(/\r\n/g, "\n");
    const html = `<div><p>${armored
      .split("\n")
      .join("</p>\n<p>")
      .replace(/\+/g, "&#43;")}</p></div>`;

    envelope_mocks.decrypt_mail_envelope.mockResolvedValue(envelope("", html));

    const message = await open_thread("inline-3");

    expect(normalized(message.body)).toBe(normalized(PLAINTEXT));
  });

  it("decrypts the same message in the single message viewer", async () => {
    const armored = await inline_pgp_body();
    const result = await process_envelope_body(
      envelope(armored, mail_parser_text_to_html(armored)) as never,
      "me@example.com",
      "inline-4",
    );

    expect(normalized(result.body_text)).toBe(normalized(PLAINTEXT));
    expect(result.safe_html).toBeUndefined();
  });

  it("still shows the armored text when no key can open it", async () => {
    const armored = await inline_pgp_body();

    key_store.vault = {
      identity_key: (
        await openpgp.generateKey({
          userIDs: [{ email: "other@example.com" }],
          passphrase: PASSPHRASE,
          format: "armored",
        })
      ).privateKey,
    };
    envelope_mocks.decrypt_mail_envelope.mockResolvedValue(
      envelope(armored, mail_parser_text_to_html(armored)),
    );

    const message = await open_thread("inline-5");

    expect(`${message.body}${message.html_content ?? ""}`).toContain(
      "BEGIN PGP MESSAGE",
    );
  });

  it("leaves plain armor untouched", () => {
    const armor =
      "-----BEGIN PGP MESSAGE-----\n\nwcBMA+abc/def=\n=ab12\n-----END PGP MESSAGE-----";

    expect(unwrap_html_armor(armor)).toBe(armor);
  });
});
