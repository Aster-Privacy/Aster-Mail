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
const { load_forward_attachments } = await import(
  "@/services/forward_attachments"
);
const { settle_bundle_subject } = await import(
  "@/services/crypto/sealed_message_fields"
);
const { envelope_has_attachments } = await import(
  "@/hooks/use_search/matching"
);

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const MAIL_ITEM_ID = "5d0c7a10-0000-4000-8000-00000000d3c1";
const SHOWN_TAG = "shown-content-tag";

function part(
  filename: string,
  content_type: string,
  bytes: number[],
  extra: { content_id?: string; is_inline?: boolean } = {},
) {
  return {
    filename,
    content_type,
    is_inline: extra.is_inline ?? false,
    content_id: extra.content_id,
    data: new Uint8Array(bytes),
  };
}

function store_parts(parts: ReturnType<typeof part>[]) {
  set_decrypted_mime_attachments(MAIL_ITEM_ID, parts, SHOWN_TAG);
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function render_list(inline_refs?: { cids: Set<string>; filenames: Set<string> }) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root!.render(
      <AttachmentList
        decrypted_content_tag={SHOWN_TAG}
        hint_attachment_count={0}
        inline_refs={inline_refs}
        mail_item_id={MAIL_ITEM_ID}
      />,
    );
  });

  await act(async () => {
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
  });
}

describe("attachments recovered from a decrypted MIME message", () => {
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

  it("lists every decrypted file without asking the server", async () => {
    store_parts([
      part("résumé.pdf", "application/pdf", [37, 80, 68, 70]),
      part("notes.txt", "text/plain", [104, 105]),
    ]);

    await render_list();

    expect(container?.textContent).toContain("résumé.pdf");
    expect(container?.textContent).toContain("notes.txt");
    expect(list_attachments_mock).not.toHaveBeenCalled();
  });

  it("shows files that arrive after the list has rendered", async () => {
    await render_list();

    expect(container?.textContent).not.toContain("late.pdf");

    await act(async () => {
      store_parts([
        part("late.pdf", "application/pdf", [1, 2, 3]),
      ]);
    });

    expect(container?.textContent).toContain("late.pdf");
  });

  it("leaves out inline images the body already shows", async () => {
    store_parts([
      part("chart.png", "image/png", [137, 80, 78, 71], {
        content_id: "chart@test.invalid",
        is_inline: true,
      }),
      part("report.pdf", "application/pdf", [37, 80]),
    ]);

    await render_list({
      cids: new Set(["chart@test.invalid"]),
      filenames: new Set(),
    });

    expect(container?.textContent).toContain("report.pdf");
    expect(container?.textContent).not.toContain("chart.png");
  });

  it("carries decrypted files into a forward with their bytes", async () => {
    store_parts([
      part("chart.png", "image/png", [137, 80, 78, 71], {
        content_id: "chart@test.invalid",
        is_inline: true,
      }),
      part("data.bin", "application/octet-stream", [9, 8, 7, 6, 5]),
    ]);

    const carried = await load_forward_attachments(MAIL_ITEM_ID, {
      body_html: '<img src="cid:chart@test.invalid">',
    });

    expect(list_attachments_mock).not.toHaveBeenCalled();
    expect(carried.map((a) => a.name)).toEqual(["data.bin"]);
    expect(Array.from(new Uint8Array(carried[0].data as ArrayBuffer))).toEqual([
      9, 8, 7, 6, 5,
    ]);
  });

  it("marks the message as having attachments for the list and search", () => {
    const envelope: {
      subject: string;
      attachment_metadata?: Array<{ filename?: string; content_type?: string }>;
    } = { subject: "Forwarded" };

    settle_bundle_subject(envelope, {
      subject: null,
      decrypted_attachments: [
        { filename: "invoice.pdf", content_type: "application/pdf" },
      ],
    });

    expect(envelope.attachment_metadata).toEqual([
      { filename: "invoice.pdf", content_type: "application/pdf" },
    ]);
    expect(
      envelope_has_attachments(
        envelope as Parameters<typeof envelope_has_attachments>[0],
        { has_attachments: false },
      ),
    ).toBe(true);
  });
});
