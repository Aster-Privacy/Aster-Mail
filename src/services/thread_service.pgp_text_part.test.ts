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
import type { ExternalKeyInfo } from "@/services/api/keys";

import * as openpgp from "openpgp";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const PASSPHRASE = "thread outer html passphrase";
const OUTSIDE_SENDER = "sender@example.test";
const OWNER = "owner@astermail.org";
const SIGNED_TEXT = "signed words from the sender";
const SIGNED_HTML = "<p>signed html from the sender</p>";
const OUTER_HTML = "<p>outer html that nobody signed</p>";
const CRLF = "\r\n";

const h = vi.hoisted(() => ({
  vault: null as unknown,
  discovered: new Map<string, ExternalKeyInfo>(),
  envelope: null as unknown,
}));

const ITEM = {
  id: "thread-msg-1",
  item_type: "received",
  created_at: "2026-11-17T12:00:00.000Z",
  encrypted_envelope: "x",
  envelope_nonce: "y",
  is_external: true,
};

vi.mock("@/services/crypto/ratchet_identity_pin", async (import_original) => ({
  ...(await import_original<Record<string, unknown>>()),
  check_owner_key_pin: vi.fn(async () => "first"),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  on_vault_stored: () => () => {},
  on_vault_cleared: () => () => {},
  get_vault_account_epoch: () => 0,
  get_vault_from_memory: () => h.vault,
  get_passphrase_from_memory: () => PASSPHRASE,
  get_passphrase_bytes: () => new TextEncoder().encode(PASSPHRASE),
  get_derived_encryption_key: () => new Uint8Array(32).fill(7),
  has_vault_in_memory: () => h.vault !== null,
  wait_for_keys_ready: async () => false,
}));

vi.mock("@/services/crypto/external_pgp_key", () => ({
  get_external_decryption_keys: () => [],
  get_external_unlocked_armored_keys: () => [],
  is_external_pgp_key_loading: () => false,
  settle_external_pgp_key_load: async () => {},
  get_external_signing_key: () => null,
}));

vi.mock("@/utils/unsubscribe_detector", () => ({
  detect_unsubscribe_info: () => undefined,
}));

vi.mock("@/services/api/keys", async (import_original) => ({
  ...(await import_original<Record<string, unknown>>()),
  discover_external_key: vi.fn(async (email: string) => {
    const found = h.discovered.get(email.toLowerCase());

    return found ? { data: found } : { error: "not found" };
  }),
  get_recipient_public_key: vi.fn(async () => ({ error: "not found" })),
}));

vi.mock("@/services/api/mail", async (import_original) => ({
  ...(await import_original<Record<string, unknown>>()),
  get_thread_messages: vi.fn(async () => ({ data: { messages: [ITEM] } })),
  list_mail_items: vi.fn(async () => ({ data: { items: [ITEM] } })),
}));

vi.mock(
  "@/components/email/shared/decrypt_envelope",
  async (import_original) => ({
    ...(await import_original<Record<string, unknown>>()),
    decrypt_mail_envelope: vi.fn(async () =>
      JSON.parse(JSON.stringify(h.envelope)),
    ),
  }),
);

vi.mock("@/services/thread_decrypt_cache", () => ({
  decrypt_thread_content_cached: async (
    _message: unknown,
    _token: unknown,
    _user: unknown,
    decode: () => Promise<{ value: unknown }>,
  ) => (await decode()).value,
  decrypt_thread_metadata_cached: async () => null,
}));

import {
  message_plain_view_state,
  plain_view_html,
} from "@/components/email/plain_view";
import {
  fetch_and_decrypt_thread_messages,
  fetch_and_decrypt_virtual_group,
} from "@/services/thread_service";

let own: { privateKey: string; publicKey: string };
let sender: { privateKey: string; publicKey: string };

function lines(...parts: string[]): string {
  return parts.join(CRLF);
}

function text_part(): string {
  return lines('Content-Type: text/plain; charset="utf-8"', "", SIGNED_TEXT);
}

function html_part(): string {
  return lines('Content-Type: text/html; charset="utf-8"', "", SIGNED_HTML);
}

async function nested_signed(part: string): Promise<string> {
  const signature = (await openpgp.sign({
    message: await openpgp.createMessage({
      binary: new TextEncoder().encode(part),
    }),
    signingKeys: await openpgp.readPrivateKey({
      armoredKey: sender.privateKey,
    }),
    detached: true,
    format: "armored",
  })) as string;

  return lines(
    "Content-Type: multipart/signed; micalg=pgp-sha512;",
    ' protocol="application/pgp-signature"; boundary="signed-b"',
    "",
    "--signed-b",
    part,
    "--signed-b",
    "Content-Type: application/pgp-signature",
    "",
    signature.trim().split(/\r?\n/).join(CRLF),
    "--signed-b--",
    "",
  );
}

async function encrypt_to_owner(text: string, sign: boolean): Promise<string> {
  return (await openpgp.encrypt({
    message: await openpgp.createMessage({ text }),
    encryptionKeys: await openpgp.readKey({ armoredKey: own.publicKey }),
    ...(sign
      ? {
          signingKeys: await openpgp.readPrivateKey({
            armoredKey: sender.privateKey,
          }),
        }
      : {}),
    format: "armored",
  })) as string;
}

const signatures: Record<string, (part: string) => Promise<string>> = {
  whole_message: (part) => encrypt_to_owner(part, true),
  nested: async (part) => encrypt_to_owner(await nested_signed(part), false),
};

const loaders: Record<
  string,
  () => Promise<
    {
      body: string;
      html_content?: string;
      sender_verification?: string;
      e2e_sender_bound?: boolean;
    }[]
  >
> = {
  thread: async () =>
    (await fetch_and_decrypt_thread_messages("tok", OWNER)).messages,
  virtual_group: () => fetch_and_decrypt_virtual_group([ITEM.id], OWNER),
};

function set_envelope(body_text: string, body_html: string) {
  h.envelope = {
    version: 1,
    from: { email: OUTSIDE_SENDER, name: "External Sender" },
    to: [{ email: OWNER, name: "" }],
    cc: [],
    bcc: [],
    subject: "Signed and encrypted",
    sent_at: "2026-11-17T12:00:00.000Z",
    body_text,
    body_html,
  };
}

beforeAll(async () => {
  own = await openpgp.generateKey({
    type: "ecc",
    curve: "ed25519Legacy",
    userIDs: [{ email: OWNER }],
    passphrase: PASSPHRASE,
    format: "armored",
  });
  sender = await openpgp.generateKey({
    type: "ecc",
    curve: "ed25519Legacy",
    userIDs: [{ email: OUTSIDE_SENDER }],
    format: "armored",
  });
}, 60_000);

beforeEach(() => {
  h.vault = { identity_key: own.privateKey, previous_keys: [] };
  h.discovered.clear();
  h.discovered.set(OUTSIDE_SENDER, {
    email: OUTSIDE_SENDER,
    found: true,
    public_key: sender.publicKey,
    fingerprint: null,
    source: "wkd",
    expires_at: null,
    will_encrypt: false,
    fingerprint_change: null,
  });
});

const OUTER_TEXT = "unsigned outer text";
let stranger: { privateKey: string; publicKey: string };

beforeAll(async () => {
  stranger = await openpgp.generateKey({
    type: "ecc",
    curve: "ed25519Legacy",
    userIDs: [{ email: "stranger@example.test" }],
    passphrase: PASSPHRASE,
    format: "armored",
  });
}, 60_000);

type Loaded = {
  body: string;
  html_content?: string;
  text_part?: string;
  sender_verification?: string;
  e2e_sender_bound?: boolean;
};

describe.each(Object.keys(loaders))(
  "%s view text alternative",
  (loader_name) => {
    const load = loaders[loader_name] as unknown as () => Promise<Loaded[]>;

    describe.each(Object.keys(signatures))("%s signature", (signature_name) => {
      const build = signatures[signature_name];

      it("keeps the outer text part out of the plain view when the html part is decrypted", async () => {
        const armor = await build(html_part());

        set_envelope(OUTER_TEXT, `<pre>${armor}</pre>`);
        const [message] = await load();

        expect(message.sender_verification).toBe("verified");
        expect(message.html_content ?? "").toContain(SIGNED_HTML);
        const state = message_plain_view_state(
          message as never,
          true,
          undefined,
        );
        const plain = state.active ? plain_view_html("", message as never) : "";

        expect({ text_part: message.text_part, plain }).toEqual({
          text_part: undefined,
          plain: "",
        });
      });

      it("shows no text around the armor", async () => {
        const armor = await build(text_part());

        set_envelope(`${OUTER_TEXT}\r\n\r\n${armor}`, OUTER_HTML);
        const [message] = await load();

        expect(message.sender_verification).toBe("verified");
        expect(message.body).not.toContain(OUTER_TEXT);
        expect(message.html_content ?? "").not.toContain("outer html");
        expect(message.text_part ?? "").not.toContain(OUTER_TEXT);
      });

      it("keeps an empty decrypted body empty", async () => {
        const armor = await build(
          lines('Content-Type: text/plain; charset="utf-8"', "", ""),
        );

        set_envelope(armor, OUTER_HTML);
        const [message] = await load();

        expect(message.html_content ?? "").not.toContain("outer html");
        expect(message.text_part ?? "").not.toContain("outer html");
        expect(message.text_part).toBeUndefined();
      });

      it("gives no verdict when decryption fails", async () => {
        h.vault = { identity_key: stranger.privateKey, previous_keys: [] };
        const armor = await build(text_part());

        set_envelope(armor, OUTER_HTML);
        const [message] = await load();

        expect(message.sender_verification).toBeUndefined();
        expect(message.e2e_sender_bound).toBe(false);
      });
    });

    it("keeps the html part for a reply that quotes armor", async () => {
      set_envelope(
        "my reply\r\n\r\n> -----BEGIN PGP MESSAGE-----\r\n> abc\r\n> -----END PGP MESSAGE-----",
        OUTER_HTML,
      );
      const [message] = await load();

      expect(message.html_content).toBe(OUTER_HTML);
    });

    it("keeps the html part and no verdict for armor sent to someone else", async () => {
      const other = (await openpgp.encrypt({
        message: await openpgp.createMessage({ text: "x" }),
        encryptionKeys: await openpgp.readKey({
          armoredKey: stranger.publicKey,
        }),
        format: "armored",
      })) as string;

      set_envelope(other, OUTER_HTML);
      const [message] = await load();

      expect(message.sender_verification).toBeUndefined();
      expect(message.html_content).toBe(OUTER_HTML);
    });

    it("keeps html and the text alternative for mail without pgp", async () => {
      set_envelope("plain words", OUTER_HTML);
      const [message] = await load();

      expect(message.html_content).toBe(OUTER_HTML);
      expect(message.text_part).toBe("plain words");
    });
  },
);
