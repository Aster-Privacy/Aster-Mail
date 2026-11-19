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
const sealed = vi.hoisted(() => ({ manifest: false }));

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
  EncryptionInfoDropdown: (props: {
    label?: string;
    description_key?: string;
    heading_key?: string;
    e2e_verified?: boolean;
    show_cipher?: boolean;
  }) => (
    <span
      data-cipher={String(props.show_cipher ?? true)}
      data-description={props.description_key ?? ""}
      data-e2e={String(!!props.e2e_verified)}
      data-heading={props.heading_key ?? ""}
      data-testid="files_encryption"
    >
      {props.label}
    </span>
  ),
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
  has_sealed_attachment_manifest: () => sealed.manifest,
  subscribe_attachment_keys: () => () => {},
}));

const { AttachmentList } = await import("./attachment_list");
const { array_to_base64 } = await import("@/services/crypto/envelope");
const { clear_attachment_meta_cache } = await import(
  "@/services/attachment_meta_cache"
);
const { set_decrypted_mime_attachments, clear_decrypted_mime_attachments } =
  await import("@/services/decrypted_mime_attachments");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const MAIL_ITEM_ID = "8c1f0a55-0000-4000-8000-0000000034cd";

function meta_payload() {
  return {
    data: {
      items: {
        [MAIL_ITEM_ID]: [
          {
            id: "att-outer-1",
            mail_item_id: MAIL_ITEM_ID,
            seq_num: 0,
            size_bytes: 24,
            meta_nonce: array_to_base64(new Uint8Array(12)),
            encrypted_meta: array_to_base64(
              new TextEncoder().encode(
                JSON.stringify({
                  filename: "outer_invoice.pdf",
                  content_type: "application/pdf",
                  session_key: "",
                }),
              ),
            ),
          },
        ],
      },
    },
  };
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function render_list(props: {
  decrypted_content_tag?: string;
  is_external?: boolean;
  has_recipient_key?: boolean;
  e2e_verified?: boolean;
  sent_encryption_scope?: "internal" | "outside";
}) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root!.render(
      <AttachmentList
        hint_attachment_count={1}
        mail_item_id={MAIL_ITEM_ID}
        {...props}
      />,
    );
  });

  await act(async () => {
    for (let turn = 0; turn < 12; turn++) await Promise.resolve();
  });
}

function badge(): HTMLElement {
  const found = container?.querySelector<HTMLElement>(
    '[data-testid="files_encryption"]',
  );

  if (!found) throw new Error("no encryption badge rendered");

  return found;
}

describe("attachments next to a decrypted outside message", () => {
  beforeEach(() => {
    sealed.manifest = false;
    clear_attachment_meta_cache();
    clear_decrypted_mime_attachments();
    list_attachments_mock.mockReset();
    batch_attachment_meta_mock.mockReset();
    list_attachments_mock.mockResolvedValue({
      data: { attachments: [], total: 0 },
    });
    batch_attachment_meta_mock.mockResolvedValue(meta_payload());

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
    clear_decrypted_mime_attachments();
  });

  it("labels stored files as outside the encrypted message", async () => {
    await render_list({
      is_external: true,
      has_recipient_key: true,
      e2e_verified: true,
    });

    expect(container?.textContent).toContain("outer_invoice.pdf");
    expect(badge().textContent).toBe("common.files_outside_encrypted_label");
    expect(badge().dataset.description).toBe("common.files_outside_encrypted");
    expect(badge().dataset.heading).toBe("common.files_outside_encrypted_label");
    expect(badge().dataset.e2e).toBe("false");
    expect(badge().dataset.cipher).toBe("false");
    expect(
      container
        ?.querySelector(".message_attachments_encryption")
        ?.getAttribute("data-encrypted"),
    ).toBe("false");
  });

  it("shows only the decrypted files when the encrypted message has its own", async () => {
    set_decrypted_mime_attachments(
      MAIL_ITEM_ID,
      [
        {
          filename: "inner_contract.pdf",
          content_type: "application/pdf",
          is_inline: false,
          content_id: undefined,
          data: new Uint8Array([37, 80, 68, 70]),
        },
      ],
      "shown-content-tag",
    );

    await render_list({
      decrypted_content_tag: "shown-content-tag",
      is_external: true,
      has_recipient_key: true,
      e2e_verified: true,
    });

    expect(container?.textContent).toContain("inner_contract.pdf");
    expect(container?.textContent).not.toContain("outer_invoice.pdf");
    expect(list_attachments_mock).not.toHaveBeenCalled();
  });

  it("keeps the in-transit label for outside mail that was not decrypted", async () => {
    await render_list({ is_external: true, e2e_verified: false });

    expect(badge().textContent).toBe("common.protected_in_transit");
    expect(badge().dataset.description).toBe("");
    expect(badge().dataset.heading).toBe("");
  });

  it("keeps the end-to-end label for files in a sealed manifest", async () => {
    sealed.manifest = true;

    await render_list({ is_external: false, e2e_verified: true });

    expect(badge().textContent).toBe("common.end_to_end_encrypted_label");
    expect(badge().dataset.description).toBe("");
    expect(badge().dataset.cipher).toBe("true");
  });

  it("keeps the end-to-end label for files you sent encrypted", async () => {
    await render_list({
      is_external: true,
      has_recipient_key: true,
      e2e_verified: true,
      sent_encryption_scope: "outside",
    });

    expect(badge().textContent).toBe("common.end_to_end_encrypted_label");
    expect(badge().dataset.cipher).toBe("true");
  });
});
