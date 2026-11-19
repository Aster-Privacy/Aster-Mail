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
  on_vault_cleared: () => () => {},
  on_vault_stored: () => () => {},
  get_passphrase_bytes: () => new Uint8Array(32).fill(9),
  get_vault_from_memory: () => null,
}));

vi.mock("@/services/crypto/key_manager", () => ({
  encrypt_message_multi: vi.fn(),
  decrypt_message_with_any_key: vi.fn(),
}));

vi.mock("@/services/crypto/inbound_attachment_keys", () => ({
  has_envelope_attachment_keys: () => false,
  is_attachment_row_listed: () => true,
  listed_attachment_rows: (rows: unknown[]) => rows,
  attachment_keys_version: () => 0,
  get_attachment_key: () => "",
  get_attachment_entry: () => null,
  has_sealed_attachment_manifest: () => false,
  subscribe_attachment_keys: () => () => {},
}));
const { AttachmentList } = await import("./attachment_list");
const { set_decrypted_mime_attachments, clear_decrypted_mime_attachments } =
  await import("@/services/decrypted_mime_attachments");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const MAIL_ITEM_ID = "5d0c7a10-0000-4000-8000-00000000e7a9";
const EARLIER_TAG = "earlier-decrypt-tag";
const SHOWN_TAG = "shown-decrypt-tag";

function store_earlier_file(tag: string) {
  set_decrypted_mime_attachments(
    MAIL_ITEM_ID,
    [
      {
        filename: "earlier.pdf",
        content_type: "application/pdf",
        is_inline: false,
        data: new Uint8Array([37, 80, 68, 70]),
      },
    ],
    tag,
  );
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function render_list(decrypted_content_tag?: string) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root!.render(
      <AttachmentList
        decrypted_content_tag={decrypted_content_tag}
        hint_attachment_count={0}
        mail_item_id={MAIL_ITEM_ID}
      />,
    );
  });

  await act(async () => {
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
  });
}

describe("decrypted files belong to the text they came from", () => {
  beforeEach(() => {
    list_attachments_mock.mockReset();
    batch_attachment_meta_mock.mockReset();
    list_attachments_mock.mockResolvedValue({
      data: { attachments: [], total: 0 },
    });
    batch_attachment_meta_mock.mockResolvedValue({ data: { items: {} } });
    clear_decrypted_mime_attachments();
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
    clear_decrypted_mime_attachments();
  });

  it("hides files from a different decrypt of the same message", async () => {
    store_earlier_file(EARLIER_TAG);

    await render_list(SHOWN_TAG);

    expect(container?.textContent).not.toContain("earlier.pdf");
  });

  it("hides stored files when the shown message has no tag", async () => {
    store_earlier_file(EARLIER_TAG);

    await render_list(undefined);

    expect(container?.textContent).not.toContain("earlier.pdf");
  });

  it("shows stored files when the tags match", async () => {
    store_earlier_file(SHOWN_TAG);

    await render_list(SHOWN_TAG);

    expect(container?.textContent).toContain("earlier.pdf");
    expect(list_attachments_mock).not.toHaveBeenCalled();
  });

  it("drops stored files when a later decrypt has none", async () => {
    store_earlier_file(SHOWN_TAG);
    await render_list(SHOWN_TAG);

    expect(container?.textContent).toContain("earlier.pdf");

    await act(async () => {
      set_decrypted_mime_attachments(MAIL_ITEM_ID, [], SHOWN_TAG);
    });

    expect(container?.textContent).not.toContain("earlier.pdf");
  });
});
