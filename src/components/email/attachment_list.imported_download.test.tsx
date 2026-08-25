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
const show_toast_mock = vi.fn();

vi.mock("@/services/api/attachments", () => ({
  list_attachments: (...args: unknown[]) => list_attachments_mock(...args),
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: (...args: unknown[]) => show_toast_mock(...args),
}));

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

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const PDF_BYTES = new Uint8Array([
  0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x31, 0x20, 0x30, 0x20,
  0x6f, 0x62, 0x6a, 0x0a, 0x25, 0x25, 0x45, 0x4f, 0x46, 0x0a,
]);

const MAIL_ITEM_ID = "6f9c1a12-0000-4000-8000-00000000abcd";

function imported_attachment_payload() {
  return {
    data: {
      total: 1,
      attachments: [
        {
          id: "att-imported-1",
          mail_item_id: MAIL_ITEM_ID,
          seq_num: 0,
          size_bytes: PDF_BYTES.byteLength,
          encrypted_data: array_to_base64(PDF_BYTES),
          data_nonce: array_to_base64(new Uint8Array(12)),
          meta_nonce: array_to_base64(new Uint8Array(12)),
          encrypted_meta: array_to_base64(
            new TextEncoder().encode(
              JSON.stringify({
                filename: "statement.pdf",
                content_type: "application/pdf",
                session_key: "",
              }),
            ),
          ),
          created_at: "2026-07-01T00:00:00Z",
        },
      ],
    },
  };
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let captured: { blob: Blob | null; filename: string };
let original_click: () => void;

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function render_list() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root!.render(<AttachmentList mail_item_id={MAIL_ITEM_ID} />);
  });

  await flush();
  await flush();

  return container;
}

describe("AttachmentList download of an imported unencrypted attachment", () => {
  beforeEach(() => {
    list_attachments_mock.mockReset();
    show_toast_mock.mockReset();
    captured = { blob: null, filename: "" };

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: (blob: Blob) => {
        captured.blob = blob;

        return "blob:mock";
      },
    });

    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      writable: true,
      value: () => {},
    });

    original_click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      captured.filename = this.download;
    };
  });

  afterEach(() => {
    HTMLAnchorElement.prototype.click = original_click;

    if (root) act(() => root!.unmount());
    container?.remove();
    root = null;
    container = null;
  });

  it("downloads the real file bytes instead of showing the failure toast", async () => {
    list_attachments_mock.mockResolvedValue(imported_attachment_payload());

    const el = await render_list();

    const button = el.querySelector<HTMLButtonElement>(
      'button[title="Download statement.pdf"]',
    );

    expect(button).not.toBeNull();
    expect(el.textContent).toContain("statement.pdf");

    await act(async () => {
      button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await flush();
    await flush();

    expect(show_toast_mock).not.toHaveBeenCalled();
    expect(captured.blob).not.toBeNull();
    expect(captured.filename).toBe("statement.pdf");
    expect(captured.blob!.type).toBe("application/pdf");

    const bytes = new Uint8Array(await captured.blob!.arrayBuffer());

    expect(bytes).toEqual(PDF_BYTES);
  });

  it("shows the locked toast when the data really is undecryptable ciphertext", async () => {
    const payload = imported_attachment_payload();

    payload.data.attachments[0].data_nonce = array_to_base64(
      crypto.getRandomValues(new Uint8Array(12)),
    );

    list_attachments_mock.mockResolvedValue(payload);

    const el = await render_list();

    const button = el.querySelector<HTMLButtonElement>(
      'button[title="Download statement.pdf"]',
    );

    expect(button).not.toBeNull();

    await act(async () => {
      button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await flush();
    await flush();

    expect(show_toast_mock).toHaveBeenCalledWith(
      "common.attachment_locked",
      "error",
    );
    expect(captured.blob).toBeNull();
  });
});
