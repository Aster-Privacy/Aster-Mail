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
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import * as openpgp from "openpgp";

const h = vi.hoisted(() => ({
  identity_key: "" as string,
  previous_keys: [] as string[],
  passphrase: "current passphrase" as string | null,
  handed_out: [] as Uint8Array[],
  capabilities: { format_writes: true, data_conversion: true } as Record<
    string,
    boolean
  >,
  status: null as Record<string, unknown> | null,
  pages: [] as { items: unknown[]; next_cursor?: string; has_more: boolean }[],
  attachments: {} as Record<string, unknown[]>,
  sent_writes: [] as { id: string; sealed: string; expected: string }[],
  meta_writes: [] as { id: string; sealed: string; expected: string }[],
  write_result: "converted" as string,
  progress: [] as Record<string, unknown>[],
  listings: 0,
  preferences_result: "converted" as string,
  on_list: null as null | (() => void),
}));

vi.mock("./crypto/memory_key_store", () => ({
  get_passphrase_from_memory: () => h.passphrase,
  get_passphrase_bytes: () => {
    if (h.passphrase === null) return null;
    const bytes = new TextEncoder().encode(h.passphrase);

    h.handed_out.push(bytes);

    return bytes;
  },
  get_vault_from_memory: () =>
    h.identity_key
      ? { identity_key: h.identity_key, previous_keys: h.previous_keys }
      : null,
}));

vi.mock("./api/account_key", () => ({
  get_account_key_capabilities: async () => h.capabilities,
  get_account_data_conversion: async () => h.status,
  convert_sent_envelope: async (
    id: string,
    sealed: string,
    expected: string,
  ) => {
    h.sent_writes.push({ id, sealed, expected });

    return h.write_result;
  },
  convert_attachment_meta: async (
    id: string,
    sealed: string,
    expected: string,
  ) => {
    h.meta_writes.push({ id, sealed, expected });

    return h.write_result;
  },
  record_account_data_conversion: async (progress: Record<string, unknown>) => {
    h.progress.push(progress);

    return true;
  },
}));

vi.mock("./api/preferences", () => ({
  convert_preferences_to_account_key: async () => h.preferences_result,
}));

vi.mock("./api/mail", () => ({
  list_encrypted_mail_items: async (params: { cursor?: string }) => {
    h.listings++;
    h.on_list?.();
    const index = params.cursor ? Number(params.cursor) : 0;

    return { data: h.pages[index] ?? { items: [], has_more: false } };
  },
}));

vi.mock("./api/attachments", () => ({
  list_attachments: async (mail_id: string) => ({
    data: { attachments: h.attachments[mail_id] ?? [] },
  }),
}));

import {
  RESCAN_INTERVAL_MS,
  run_account_data_conversion,
  sha256_hex,
} from "./account_data_conversion";
import {
  array_to_base64,
  base64_to_array,
  encrypt_envelope,
} from "./crypto/envelope";
import { decrypt_message_verified_with_any_key } from "./crypto/key_manager_pgp_messages";

const PASSPHRASE = "current passphrase";
const SENTINEL = array_to_base64(new Uint8Array([1]));
const LEGACY_META_NONCE = array_to_base64(
  new Uint8Array([9, 8, 7, 6, 5, 4, 3, 2, 1, 1, 2, 3]),
);
const ZERO_META_NONCE = array_to_base64(new Uint8Array(12));

let own_key = "";
let own_public = "";
let old_key = "";
let old_public = "";
let clock = 1_800_000_000_000;

async function generate() {
  const { privateKey, publicKey } = await openpgp.generateKey({
    type: "ecc",
    curve: "curve25519Legacy",
    userIDs: [{ email: "owner@astermail.org" }],
    passphrase: PASSPHRASE,
    format: "armored",
  });

  return { private_key: privateKey, public_key: publicKey };
}

async function open_sealed(sealed_b64: string): Promise<string> {
  const armored = new TextDecoder().decode(base64_to_array(sealed_b64));
  const result = await decrypt_message_verified_with_any_key(
    armored,
    [own_key],
    PASSPHRASE,
  );

  return result.plaintext;
}

async function legacy_envelope(data: object, passphrase = PASSPHRASE) {
  return (await encrypt_envelope(data, passphrase)).encrypted;
}

async function pgp_meta(plaintext: string, public_key: string) {
  const message = await openpgp.createMessage({ text: plaintext });
  const armored = await openpgp.encrypt({
    message,
    encryptionKeys: await openpgp.readKey({ armoredKey: public_key }),
  });

  return array_to_base64(new TextEncoder().encode(armored as string));
}

function status(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    sent_mail_done_at: null,
    preferences_done_at: "2026-09-19T00:00:00Z",
    converted_count: 0,
    skipped_count: 0,
    remaining_sent: 1,
    remaining_attachments: 0,
    ...overrides,
  };
}

function one_page(items: unknown[]) {
  return [{ items, has_more: false }];
}

async function legacy_item(id: string, data: object = { subject: "x" }) {
  return {
    id,
    encrypted_envelope: await legacy_envelope(data),
    envelope_nonce: SENTINEL,
  };
}

function run(account = "account-1") {
  return run_account_data_conversion(account, () => clock);
}

beforeAll(async () => {
  const own = await generate();
  const old = await generate();

  own_key = own.private_key;
  own_public = own.public_key;
  old_key = old.private_key;
  old_public = old.public_key;
}, 30000);

beforeEach(() => {
  localStorage.clear();
  clock += RESCAN_INTERVAL_MS * 2;
  h.identity_key = own_key;
  h.previous_keys = [];
  h.passphrase = PASSPHRASE;
  h.handed_out = [];
  h.capabilities = { format_writes: true, data_conversion: true };
  h.status = status();
  h.pages = [];
  h.attachments = {};
  h.sent_writes = [];
  h.meta_writes = [];
  h.write_result = "converted";
  h.progress = [];
  h.listings = 0;
  h.preferences_result = "converted";
  h.on_list = null;
});

describe("background sent mail conversion", () => {
  it("does nothing while the server flag is off", async () => {
    h.capabilities = { format_writes: true, data_conversion: false };

    expect(await run()).toBeNull();
    expect(h.listings).toBe(0);
    expect(h.progress).toEqual([]);
  });

  it("does nothing when the server reports no conversion status", async () => {
    h.status = null;

    expect(await run()).toBeNull();
    expect(h.listings).toBe(0);
  });

  it("does nothing when the account is locked", async () => {
    h.passphrase = null;

    expect(await run()).toBeNull();
    expect(h.listings).toBe(0);
  });

  it("does nothing without an account id", async () => {
    expect(await run("")).toBeNull();
    expect(h.listings).toBe(0);
  });

  it("reseals a password envelope to the identity key with the exact plaintext", async () => {
    const envelope = {
      subject: "Quarterly report",
      body_text: "café 🌍",
    };
    const item = await legacy_item("m1", envelope);

    h.pages = one_page([item]);

    const summary = await run();

    expect(summary?.converted).toBe(1);
    expect(h.sent_writes).toHaveLength(1);
    expect(h.sent_writes[0].id).toBe("m1");
    expect(h.sent_writes[0].expected).toBe(
      await sha256_hex(base64_to_array(item.encrypted_envelope)),
    );
    expect(await open_sealed(h.sent_writes[0].sealed)).toBe(
      JSON.stringify(envelope),
    );
    expect(h.progress).toContainEqual({ converted: 1, skipped: 0 });
    expect(h.progress).toContainEqual({ sent_mail_done: true });
  });

  it("leaves already sealed and non-sentinel items untouched", async () => {
    h.pages = one_page([
      { id: "pgp", encrypted_envelope: "YWJj", envelope_nonce: "" },
      {
        id: "other",
        encrypted_envelope: "YWJj",
        envelope_nonce: ZERO_META_NONCE,
      },
    ]);

    const summary = await run();

    expect(h.sent_writes).toEqual([]);
    expect(summary?.checked).toBe(2);
    expect(summary?.converted).toBe(0);
  });

  it("never marks the account done when an envelope cannot be opened", async () => {
    h.pages = one_page([
      {
        id: "m1",
        encrypted_envelope: await legacy_envelope({ subject: "x" }, "older"),
        envelope_nonce: SENTINEL,
      },
    ]);

    const summary = await run();

    expect(summary?.unreadable).toBe(1);
    expect(h.sent_writes).toEqual([]);
    expect(h.progress).not.toContainEqual({ sent_mail_done: true });
    expect(h.progress).toContainEqual({ converted: 0, skipped: 1 });
  });

  it("never marks the account done when a write fails", async () => {
    h.write_result = "failed";
    h.pages = one_page([await legacy_item("m1")]);

    const summary = await run();

    expect(summary?.failed).toBe(1);
    expect(h.progress).not.toContainEqual({ sent_mail_done: true });
  });

  it("counts a concurrent change as skipped", async () => {
    h.write_result = "source_changed";
    h.pages = one_page([await legacy_item("m1")]);

    const summary = await run();

    expect(summary?.skipped).toBe(1);
    expect(summary?.converted).toBe(0);
  });

  it("converts every legacy attachment metadata form and skips sealed rows", async () => {
    const meta = (name: string) =>
      JSON.stringify({
        filename: name,
        content_type: "application/pdf",
        size: 10,
        session_key: "c2Vzc2lvbg==",
      });

    h.previous_keys = [old_key];
    h.status = status({ remaining_sent: 0, remaining_attachments: 3 });
    h.pages = one_page([
      {
        id: "m1",
        encrypted_envelope: "",
        envelope_nonce: "",
        has_attachments: true,
      },
    ]);

    const rows = [
      {
        id: "a_plain",
        encrypted_meta: array_to_base64(
          new TextEncoder().encode(meta("plain.pdf")),
        ),
        meta_nonce: LEGACY_META_NONCE,
      },
      {
        id: "a_pgp_old_key",
        encrypted_meta: await pgp_meta(meta("old.pdf"), old_public),
        meta_nonce: LEGACY_META_NONCE,
      },
      {
        id: "a_password",
        encrypted_meta: await legacy_envelope(JSON.parse(meta("pw.pdf"))),
        meta_nonce: LEGACY_META_NONCE,
      },
      {
        id: "a_sealed",
        encrypted_meta: await pgp_meta(meta("new.pdf"), own_public),
        meta_nonce: ZERO_META_NONCE,
      },
    ];

    h.attachments.m1 = rows;

    const summary = await run();

    expect(summary?.converted).toBe(3);
    expect(h.meta_writes.map((write) => write.id)).toEqual([
      "a_plain",
      "a_pgp_old_key",
      "a_password",
    ]);

    const opened = await Promise.all(
      h.meta_writes.map((write) => open_sealed(write.sealed)),
    );

    expect(opened.map((text) => JSON.parse(text).filename)).toEqual([
      "plain.pdf",
      "old.pdf",
      "pw.pdf",
    ]);
    expect(opened[0]).toBe(meta("plain.pdf"));

    for (const write of h.meta_writes) {
      const source = rows.find((row) => row.id === write.id)!;

      expect(write.expected).toBe(
        await sha256_hex(base64_to_array(source.encrypted_meta)),
      );
    }
    expect(h.progress).toContainEqual({ sent_mail_done: true });
  });

  it("rejects attachment metadata that is not a metadata object", async () => {
    h.status = status({ remaining_sent: 0, remaining_attachments: 1 });
    h.pages = one_page([{ id: "m1", attachment_count: 1 }]);
    h.attachments.m1 = [
      {
        id: "a_bad",
        encrypted_meta: await legacy_envelope({ unrelated: true }),
        meta_nonce: LEGACY_META_NONCE,
      },
    ];

    const summary = await run();

    expect(summary?.unreadable).toBe(1);
    expect(h.meta_writes).toEqual([]);
    expect(h.progress).not.toContainEqual({ sent_mail_done: true });
  });

  it("records done without listing when nothing remains", async () => {
    h.status = status({ remaining_sent: 0, remaining_attachments: 0 });

    const summary = await run();

    expect(summary?.checked).toBe(0);
    expect(h.listings).toBe(0);
    expect(h.progress).toEqual([{ sent_mail_done: true }]);
  });

  it("converts preferences once and records it", async () => {
    h.status = status({
      preferences_done_at: null,
      remaining_sent: 0,
      sent_mail_done_at: "2026-09-19T00:00:00Z",
    });

    await run();

    expect(h.progress).toEqual([{ preferences_done: true }]);
  });

  it("does not record preferences when conversion is unavailable", async () => {
    h.preferences_result = "unavailable";
    h.status = status({
      preferences_done_at: null,
      remaining_sent: 0,
      sent_mail_done_at: "2026-09-19T00:00:00Z",
    });

    await run();

    expect(h.progress).toEqual([]);
  });

  it("waits before scanning the same account again", async () => {
    h.pages = one_page([
      {
        id: "m1",
        encrypted_envelope: await legacy_envelope({ subject: "x" }, "older"),
        envelope_nonce: SENTINEL,
      },
    ]);

    await run();
    expect(h.listings).toBe(1);

    clock += RESCAN_INTERVAL_MS - 1;
    expect(await run()).toBeNull();
    expect(h.listings).toBe(1);

    expect(await run("account-2")).not.toBeNull();
    expect(h.listings).toBe(2);

    clock += 2;
    await run();
    expect(h.listings).toBe(3);
  });

  it("stops when the signed-in account changes", async () => {
    h.pages = [
      { items: [await legacy_item("m1")], next_cursor: "1", has_more: true },
    ];
    h.on_list = () => {
      h.identity_key = old_key;
    };

    const summary = await run();

    expect(h.sent_writes).toEqual([]);
    expect(summary?.checked).toBe(0);
    expect(h.progress).not.toContainEqual({ sent_mail_done: true });
    expect(localStorage.length).toBe(0);
  });

  it("follows the cursor across pages", async () => {
    h.status = status({ remaining_sent: 2 });
    h.pages = [
      {
        items: [await legacy_item("m1", { n: 1 })],
        next_cursor: "1",
        has_more: true,
      },
      { items: [await legacy_item("m2", { n: 2 })], has_more: false },
    ];

    const summary = await run();

    expect(summary?.converted).toBe(2);
    expect(h.sent_writes.map((write) => write.id)).toEqual(["m1", "m2"]);
  });

  it("stops listing once the remaining counts are met", async () => {
    h.pages = [
      { items: [await legacy_item("m1")], next_cursor: "1", has_more: true },
      { items: [await legacy_item("m2")], has_more: false },
    ];

    await run();

    expect(h.listings).toBe(1);
    expect(h.sent_writes.map((write) => write.id)).toEqual(["m1"]);
  });

  it("zeroes every passphrase copy it takes", async () => {
    h.pages = one_page([await legacy_item("m1")]);

    await run();

    expect(h.handed_out.length).toBeGreaterThan(0);
    for (const bytes of h.handed_out) {
      expect(bytes.every((byte) => byte === 0)).toBe(true);
    }
  });

  it("refuses to run twice at the same time", async () => {
    h.pages = one_page([await legacy_item("m1")]);

    const results = await Promise.all([run(), run()]);

    expect(results.filter((result) => result === null)).toHaveLength(1);
    expect(h.sent_writes).toHaveLength(1);
  });
});
