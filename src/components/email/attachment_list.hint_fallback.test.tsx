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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const list_attachments_mock = vi.fn();
const batch_attachment_meta_mock = vi.fn();

vi.mock("@/services/api/attachments", () => ({
  list_attachments: (...args: unknown[]) => list_attachments_mock(...args),
  batch_attachment_meta: (...args: unknown[]) =>
    batch_attachment_meta_mock(...args),
}));

vi.mock("@/components/toast/simple_toast", () => ({ show_toast: vi.fn() }));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: { low_network_mode: false } }),
}));

vi.mock("@/provider", () => ({ use_should_reduce_motion: () => true }));

vi.mock("@/lib/i18n/context", () => {
  const t = (key: string, vars?: Record<string, string>) =>
    key === "mail.download_file_named" ? `Download ${vars?.filename}` : key;
  const value = { t };

  return { use_i18n: () => value };
});

vi.mock("@/lib/pdf_utils", () => ({
  render_pdf_thumbnail: vi.fn(async () => {
    throw new Error("no pdf rendering in tests");
  }),
}));

vi.mock("@/components/common/encryption_info_dropdown", () => ({
  EncryptionInfoDropdown: () => null,
}));

vi.mock("@/components/email/pdf_preview_modal", () => ({
  PdfPreviewModal: () => null,
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_passphrase_bytes: () => new Uint8Array(32).fill(9),
  get_vault_from_memory: () => null,
}));

vi.mock("@/services/crypto/key_manager", () => ({
  encrypt_message_multi: vi.fn(),
  decrypt_message_with_any_key: vi.fn(),
}));

vi.mock("@/services/crypto/inbound_attachment_keys", () => ({
  attachment_keys_version: () => 0,
  get_attachment_key: () => "",
  get_attachment_entry: () => null,
}));

const { AttachmentList } = await import("./attachment_list");
const { array_to_base64 } = await import("@/services/crypto/envelope");
const { prefetch_attachment_meta, clear_attachment_meta_cache } = await import(
  "@/services/attachment_meta_cache"
);

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const MAIL_ITEM_ID = "8c1f0a55-0000-4000-8000-0000000012ab";

function encrypted_meta_for(filename: string) {
  return array_to_base64(
    new TextEncoder().encode(
      JSON.stringify({
        filename,
        content_type: "application/pdf",
        session_key: "",
      }),
    ),
  );
}

function list_payload() {
  return {
    data: {
      attachments: [
        {
          id: "att-listed-1",
          mail_item_id: MAIL_ITEM_ID,
          seq_num: 0,
          size_bytes: 24,
          meta_nonce: array_to_base64(new Uint8Array(12)),
          encrypted_meta: encrypted_meta_for("statement.pdf"),
          encrypted_data: "",
          data_nonce: "",
        },
      ],
      total: 1,
    },
  };
}

function empty_meta_payload() {
  return { data: { items: {} } };
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function render_list(hint: number) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root!.render(
      <AttachmentList
        hint_attachment_count={hint}
        mail_item_id={MAIL_ITEM_ID}
      />,
    );
  });

  await act(async () => {
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
  });
}

describe("AttachmentList when the metadata batch comes back empty", () => {
  beforeEach(() => {
    clear_attachment_meta_cache();
    list_attachments_mock.mockReset();
    batch_attachment_meta_mock.mockReset();
    list_attachments_mock.mockResolvedValue(list_payload());
    batch_attachment_meta_mock.mockResolvedValue(empty_meta_payload());

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: () => "blob:mock",
    });

    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      writable: true,
      value: () => {},
    });
  });

  afterEach(() => {
    if (root) act(() => root!.unmount());
    container?.remove();
    root = null;
    container = null;
    clear_attachment_meta_cache();
  });

  it("asks the attachment endpoint when the message is known to carry a file", async () => {
    await render_list(1);

    expect(list_attachments_mock).toHaveBeenCalledWith(MAIL_ITEM_ID);
    expect(container?.textContent).toContain("statement.pdf");
  });

  it("does not ask the attachment endpoint when the message carries no files", async () => {
    await render_list(0);

    expect(list_attachments_mock).not.toHaveBeenCalled();
  });

  it("ignores an empty cached list when the message is known to carry a file", async () => {
    await prefetch_attachment_meta([MAIL_ITEM_ID]);

    batch_attachment_meta_mock.mockClear();

    await render_list(1);

    expect(list_attachments_mock).toHaveBeenCalledWith(MAIL_ITEM_ID);
    expect(container?.textContent).toContain("statement.pdf");
  });
});
