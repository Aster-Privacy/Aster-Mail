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
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("./memory_key_store", () => ({
  on_vault_cleared: () => () => {},
  on_vault_stored: () => () => {},
  get_vault_account_epoch: () => 0,
  get_passphrase_from_memory: vi.fn(() => null),
  get_passphrase_bytes: vi.fn(() => new Uint8Array(32).fill(9)),
  get_vault_from_memory: vi.fn(() => null),
}));

vi.mock("./key_manager", () => ({
  encrypt_message_multi: vi.fn(async () => "sealed"),
  decrypt_message: vi.fn(async () => {
    throw new Error("row meta must not be read for a sealed attachment");
  }),
}));

import {
  AttachmentIntegrityError,
  decrypt_attachment_data,
  encrypt_attachments_for_send,
  plan_sealed_attachments,
  resolve_attachment_meta,
} from "./attachment_crypto";
import {
  clear_attachment_keys,
  has_sealed_attachment_manifest,
  register_envelope_attachment_keys,
  register_sealed_attachment_manifest,
} from "./inbound_attachment_keys";

import type { Attachment } from "@/components/compose/compose_shared";

import {
  build_subject_bundle,
  extract_subject_bundle,
} from "@/utils/email_crypto";

const ITEM = "item-1";

function make_attachment(bytes: Uint8Array, name = "report.bin"): Attachment {
  return {
    id: name,
    name,
    mime_type: "application/octet-stream",
    size_bytes: bytes.byteLength,
    data: bytes.buffer.slice(0),
    is_inline: false,
  } as unknown as Attachment;
}

async function send(files: Attachment[]) {
  const plan = await plan_sealed_attachments(files);
  const encrypted = await encrypt_attachments_for_send(
    files,
    undefined,
    false,
    {},
    null,
    plan.session_keys,
  );
  const sealed_body = build_subject_bundle("Subject", "Body", plan.manifest);

  return { plan, encrypted, sealed_body };
}

describe("sealed attachment list", () => {
  beforeEach(() => {
    clear_attachment_keys();
  });

  it("round trips keys, names and digests through the sealed payload", async () => {
    const first = crypto.getRandomValues(new Uint8Array(2048));
    const second = crypto.getRandomValues(new Uint8Array(512));
    const { encrypted, sealed_body } = await send([
      make_attachment(first, "first.bin"),
      make_attachment(second, "second.bin"),
    ]);
    const opened = extract_subject_bundle(sealed_body);

    expect(opened.subject).toBe("Subject");
    expect(opened.body).toBe("Body");
    expect(
      register_sealed_attachment_manifest(ITEM, opened.attachment_manifest),
    ).toBe(true);
    expect(has_sealed_attachment_manifest(ITEM)).toBe(true);

    const meta = await resolve_attachment_meta({
      mail_item_id: ITEM,
      seq_num: 1,
      encrypted_meta: "ignored",
      meta_nonce: "",
      size_bytes: 1,
    });

    expect(meta.filename).toBe("second.bin");
    expect(meta.size_bytes).toBe(512);

    const bytes = await decrypt_attachment_data(
      encrypted[1].encrypted_data,
      encrypted[1].data_nonce,
      "",
      ITEM,
      1,
    );

    expect(new Uint8Array(bytes)).toEqual(second);
  });

  it("is ignored by a reader that only knows subject and body", () => {
    const sealed_body = build_subject_bundle("Subject", "Body", [
      { seq: 0, key: "a2V5" },
    ]);
    const payload = JSON.parse(sealed_body.slice(sealed_body.indexOf("{")));

    expect(payload.s).toBe("Subject");
    expect(payload.b).toBe("Body");
  });

  it("writes the same payload as before when there are no attachments", () => {
    expect(build_subject_bundle("Subject", "Body", [])).toBe(
      build_subject_bundle("Subject", "Body"),
    );
    expect(build_subject_bundle("Subject", "Body")).not.toContain(
      "attachment_manifest",
    );
  });

  it("refuses bytes that differ from the sealed digest", async () => {
    const genuine = crypto.getRandomValues(new Uint8Array(256));
    const other = crypto.getRandomValues(new Uint8Array(256));
    const { plan } = await send([make_attachment(genuine)]);
    const [swapped] = await encrypt_attachments_for_send(
      [make_attachment(other)],
      undefined,
      false,
      {},
      null,
      [Uint8Array.from(atob(plan.manifest[0].key), (c) => c.charCodeAt(0))],
    );

    register_sealed_attachment_manifest(ITEM, plan.manifest);

    await expect(
      decrypt_attachment_data(
        swapped.encrypted_data,
        swapped.data_nonce,
        "",
        ITEM,
        0,
      ),
    ).rejects.toBeInstanceOf(AttachmentIntegrityError);
  });

  it("refuses bytes encrypted under a key the sealed list does not name", async () => {
    const genuine = crypto.getRandomValues(new Uint8Array(256));
    const { plan } = await send([make_attachment(genuine)]);
    const [swapped] = await encrypt_attachments_for_send([
      make_attachment(genuine),
    ]);

    register_sealed_attachment_manifest(ITEM, plan.manifest);

    await expect(
      decrypt_attachment_data(
        swapped.encrypted_data,
        swapped.data_nonce,
        "",
        ITEM,
        0,
      ),
    ).rejects.toBeInstanceOf(AttachmentIntegrityError);
  });

  it("keeps the sealed keys when the served envelope lists different ones", async () => {
    const { plan } = await send([
      make_attachment(crypto.getRandomValues(new Uint8Array(64))),
    ]);

    register_envelope_attachment_keys(ITEM, {
      attachment_keys: [{ seq: 0, key: "c3dhcHBlZA==", filename: "x.exe" }],
    });
    register_sealed_attachment_manifest(ITEM, plan.manifest);
    register_envelope_attachment_keys(ITEM, {
      attachment_keys: [
        { seq: 0, key: "c3dhcHBlZA==", filename: "x.exe" },
        { seq: 1, key: "ZXh0cmE=", filename: "extra.exe" },
      ],
    });

    const meta = await resolve_attachment_meta({
      mail_item_id: ITEM,
      seq_num: 0,
      encrypted_meta: "ignored",
      meta_nonce: "",
      size_bytes: 1,
    });

    expect(meta.session_key).toBe(plan.manifest[0].key);
    expect(meta.filename).toBe("report.bin");
  });

  it("rejects a malformed list and leaves the message unsealed", () => {
    expect(register_sealed_attachment_manifest(ITEM, [{ seq: 0 }])).toBe(false);
    expect(register_sealed_attachment_manifest(ITEM, [])).toBe(false);
    expect(register_sealed_attachment_manifest(ITEM, "nope")).toBe(false);
    expect(has_sealed_attachment_manifest(ITEM)).toBe(false);
  });

  it("rejects a key plan that does not cover every attachment", async () => {
    await expect(
      encrypt_attachments_for_send(
        [make_attachment(new Uint8Array(8))],
        undefined,
        false,
        {},
        null,
        [],
      ),
    ).rejects.toThrow();
  });
});
