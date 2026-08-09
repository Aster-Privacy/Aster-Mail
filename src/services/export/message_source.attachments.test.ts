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
import { describe, it, expect, vi, beforeEach } from "vitest";

const list_mail_items = vi.fn();
const list_attachments = vi.fn();
const decrypt_mail_envelope = vi.fn();
const decrypt_attachment_meta = vi.fn();
const decrypt_attachment_data = vi.fn();

vi.mock("@/services/api/mail", () => ({
  list_mail_items: (...args: unknown[]) => list_mail_items(...args),
}));

vi.mock("@/services/api/attachments", () => ({
  list_attachments: (...args: unknown[]) => list_attachments(...args),
}));

vi.mock("@/components/email/shared/decrypt_envelope", () => ({
  decrypt_mail_envelope: (...args: unknown[]) => decrypt_mail_envelope(...args),
}));

vi.mock("@/services/crypto/attachment_crypto", () => ({
  decrypt_attachment_meta: (...args: unknown[]) =>
    decrypt_attachment_meta(...args),
  decrypt_attachment_data: (...args: unknown[]) =>
    decrypt_attachment_data(...args),
}));

import { create_account_message_source } from "./message_source";
import type { ExportError, ExportScope, PipelineMessage } from "./pipeline";

const scope: ExportScope = { preset: "all" };

function mail_item(id: string) {
  return {
    id,
    encrypted_envelope: "enc",
    envelope_nonce: "nonce",
    created_at: "2026-01-01T00:00:00.000Z",
    folder_token: "inbox",
    item_type: "received",
    has_attachments: true,
  };
}

function attachment(seq: number) {
  return {
    encrypted_meta: "m",
    meta_nonce: "mn",
    encrypted_data: "d",
    data_nonce: "dn",
    mail_item_id: "mail_1",
    seq_num: seq,
  };
}

async function collect(
  report_error: (e: ExportError) => void,
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

beforeEach(() => {
  vi.clearAllMocks();
  list_mail_items.mockResolvedValue({
    data: {
      items: [mail_item("mail_1")],
      has_more: false,
      next_cursor: null,
      total: 1,
    },
  });
  decrypt_mail_envelope.mockResolvedValue({
    subject: "hello",
    sent_at: "2026-01-01T00:00:00.000Z",
  });
});

describe("export message source attachment reporting", () => {
  it("reports an undecryptable attachment instead of swallowing it", async () => {
    list_attachments.mockResolvedValue({
      data: { attachments: [attachment(0)] },
    });
    decrypt_attachment_meta.mockRejectedValue(new Error("bad key"));

    const errors: ExportError[] = [];
    const messages = await collect((e) => errors.push(e));

    expect(messages).toHaveLength(1);
    expect(messages[0].attachments).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].kind).toBe("attachment");
    expect(errors[0].code).toBe("attachment_undecryptable");
    expect(errors[0].message_id_prefix).toMatch(/^[0-9a-f]{8}$/);
  });

  it("reports one error per undecryptable attachment and keeps the good ones", async () => {
    list_attachments.mockResolvedValue({
      data: { attachments: [attachment(0), attachment(1), attachment(2)] },
    });
    decrypt_attachment_meta.mockImplementation(async () => ({
      filename: "ok.txt",
      content_type: "text/plain",
      session_key: new Uint8Array(32),
      is_inline: false,
    }));
    decrypt_attachment_data
      .mockRejectedValueOnce(new Error("bad data"))
      .mockResolvedValueOnce(new Uint8Array([1, 2, 3]).buffer)
      .mockRejectedValueOnce(new Error("bad data"));

    const errors: ExportError[] = [];
    const messages = await collect((e) => errors.push(e));

    expect(messages[0].attachments).toHaveLength(1);
    expect(messages[0].attachments[0].filename).toBe("ok.txt");
    expect(errors).toHaveLength(2);
    expect(errors.every((e) => e.code === "attachment_undecryptable")).toBe(
      true,
    );
  });

  it("reports a failure to list attachments and still yields the message", async () => {
    list_attachments.mockRejectedValue(new Error("network"));

    const errors: ExportError[] = [];
    const messages = await collect((e) => errors.push(e));

    expect(messages).toHaveLength(1);
    expect(messages[0].attachments).toHaveLength(0);
    expect(errors).toEqual([
      {
        message_id_prefix: expect.stringMatching(/^[0-9a-f]{8}$/),
        kind: "attachment",
        code: "attachment_list_failed",
      },
    ]);
  });

  it("reports nothing when every attachment decrypts", async () => {
    list_attachments.mockResolvedValue({
      data: { attachments: [attachment(0)] },
    });
    decrypt_attachment_meta.mockResolvedValue({
      filename: "ok.txt",
      content_type: "text/plain",
      session_key: new Uint8Array(32),
      is_inline: false,
    });
    decrypt_attachment_data.mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);

    const errors: ExportError[] = [];
    const messages = await collect((e) => errors.push(e));

    expect(errors).toHaveLength(0);
    expect(messages[0].attachments).toHaveLength(1);
  });
});
