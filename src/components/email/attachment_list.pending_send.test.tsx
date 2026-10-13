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
import type { Attachment } from "@/components/compose/compose_shared_core";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const list_attachments_mock = vi.fn();
const batch_attachment_meta_mock = vi.fn();
const download_mock = vi.fn();
const pdf_modal_props: { local_data?: ArrayBuffer; filename: string }[] = [];

vi.mock("@/services/api/attachments", () => ({
  list_attachments: (...args: unknown[]) => list_attachments_mock(...args),
  batch_attachment_meta: (...args: unknown[]) =>
    batch_attachment_meta_mock(...args),
}));

vi.mock("@/services/crypto/attachment_crypto", async (import_original) => ({
  ...(await import_original<
    typeof import("@/services/crypto/attachment_crypto")
  >()),
  download_decrypted_attachment: (...args: unknown[]) => download_mock(...args),
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
  PdfPreviewModal: (props: { local_data?: ArrayBuffer; filename: string }) => {
    pdf_modal_props.push(props);

    return null;
  },
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
  has_envelope_attachment_keys: () => false,
  is_attachment_row_listed: () => true,
  listed_attachment_rows: (rows: unknown[]) => rows,
  attachment_keys_version: () => 0,
  get_attachment_key: () => "",
  get_attachment_entry: () => null,
}));

const { AttachmentList } = await import("./attachment_list");
const { UNDO_SEND_PREVIEW_ID } = await import("./email_viewer_types");
const { clear_attachment_meta_cache } = await import(
  "@/services/attachment_meta_cache"
);
const {
  clear_pending_send_attachments,
  get_pending_send_attachments,
  reset_pending_send_attachments,
  set_pending_send_attachments,
} = await import("@/services/pending_send_attachments");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const OPTIMISTIC_ID = "optimistic-1760263200000";

function compose_attachment(
  id: string,
  name: string,
  mime_type: string,
  bytes: number,
): Attachment {
  return {
    id,
    name,
    size: `${bytes} B`,
    size_bytes: bytes,
    mime_type,
    data: new Uint8Array(bytes).fill(7).buffer,
  };
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function settle() {
  await act(async () => {
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
  });
}

async function render_list(mail_item_id: string, is_local: boolean) {
  if (!container) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root!.render(
      <AttachmentList
        hint_attachment_count={0}
        is_local={is_local}
        mail_item_id={mail_item_id}
      />,
    );
  });

  await settle();
}

function card_named(filename: string): HTMLElement | null {
  return (
    [
      ...(container?.querySelectorAll<HTMLElement>(
        ".message_attachment_card",
      ) ?? []),
    ].find((node) => node.textContent?.includes(filename)) ?? null
  );
}

describe("AttachmentList for a message that is not sent yet", () => {
  beforeEach(() => {
    clear_attachment_meta_cache();
    reset_pending_send_attachments();
    list_attachments_mock.mockReset();
    batch_attachment_meta_mock.mockReset();
    download_mock.mockReset();
    pdf_modal_props.length = 0;
    list_attachments_mock.mockResolvedValue({
      data: { attachments: [], total: 0 },
    });
    batch_attachment_meta_mock.mockResolvedValue({ data: { items: {} } });

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
    reset_pending_send_attachments();
    clear_attachment_meta_cache();
  });

  it("shows nothing for an unsent message without files", async () => {
    await render_list(OPTIMISTIC_ID, true);

    expect(
      container?.querySelector('[data-testid="pending_attachments"]'),
    ).toBeNull();
    expect(list_attachments_mock).not.toHaveBeenCalled();
  });

  it("lists the attached files while the send can still be undone", async () => {
    set_pending_send_attachments(OPTIMISTIC_ID, [
      compose_attachment("a1", "scope.pdf", "application/pdf", 2048),
      compose_attachment("a2", "notes.txt", "text/plain", 1024),
    ]);

    await render_list(OPTIMISTIC_ID, true);

    expect(container?.textContent).toContain("scope.pdf");
    expect(container?.textContent).toContain("notes.txt");
    expect(container?.textContent).toContain("2 mail.attachments");
    expect(
      container?.querySelector('[data-testid="attachments_total_size"]')
        ?.textContent,
    ).toBe("3.0 KB");
    expect(list_attachments_mock).not.toHaveBeenCalled();
    expect(batch_attachment_meta_mock).not.toHaveBeenCalled();
  });

  it("keeps the files once the send is handed to the server", async () => {
    set_pending_send_attachments(OPTIMISTIC_ID, [
      compose_attachment("a1", "scope.pdf", "application/pdf", 2048),
    ]);

    await render_list(OPTIMISTIC_ID, true);
    await render_list(OPTIMISTIC_ID, false);

    expect(container?.textContent).toContain("scope.pdf");
    expect(list_attachments_mock).not.toHaveBeenCalled();

    clear_pending_send_attachments(OPTIMISTIC_ID);
    await render_list(OPTIMISTIC_ID, false);

    expect(container?.textContent).toContain("scope.pdf");
    expect(list_attachments_mock).not.toHaveBeenCalled();
  });

  it("opens a PDF from the local file", async () => {
    set_pending_send_attachments(OPTIMISTIC_ID, [
      compose_attachment("a1", "scope.pdf", "application/pdf", 2048),
    ]);

    await render_list(OPTIMISTIC_ID, true);

    const card = card_named("scope.pdf");

    expect(card).not.toBeNull();

    act(() => {
      card!.click();
    });
    await settle();

    expect(pdf_modal_props.at(-1)?.filename).toBe("scope.pdf");
    expect(pdf_modal_props.at(-1)?.local_data?.byteLength).toBe(2048);
    expect(download_mock).not.toHaveBeenCalled();
  });

  it("downloads other file types from the local file", async () => {
    set_pending_send_attachments(OPTIMISTIC_ID, [
      compose_attachment("a2", "notes.txt", "text/plain", 1024),
    ]);

    await render_list(OPTIMISTIC_ID, true);

    act(() => {
      card_named("notes.txt")!.click();
    });
    await settle();

    expect(download_mock).toHaveBeenCalledTimes(1);
    expect(download_mock.mock.calls[0][0].byteLength).toBe(1024);
    expect(download_mock.mock.calls[0][1]).toBe("notes.txt");
    expect(download_mock.mock.calls[0][2]).toBe("text/plain");
  });

  it("drops the files of an earlier preview when the next one has none", async () => {
    set_pending_send_attachments(UNDO_SEND_PREVIEW_ID, [
      compose_attachment("a1", "scope.pdf", "application/pdf", 2048),
    ]);
    await render_list(UNDO_SEND_PREVIEW_ID, true);
    expect(container?.textContent).toContain("scope.pdf");

    set_pending_send_attachments(UNDO_SEND_PREVIEW_ID, undefined);
    await render_list(UNDO_SEND_PREVIEW_ID, true);

    expect(container?.textContent).not.toContain("scope.pdf");
  });

  it("asks the server for a message that has no local files", async () => {
    await render_list("8c1f0a55-0000-4000-8000-0000000012ab", false);

    expect(get_pending_send_attachments(OPTIMISTIC_ID)).toBeUndefined();
    expect(batch_attachment_meta_mock).toHaveBeenCalled();
  });
});
