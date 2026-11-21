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
import type { DecryptedThreadMessage } from "@/types/thread";
import type { ReactNode } from "react";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const batch_attachment_meta_mock = vi.hoisted(() => vi.fn());
const sealed = vi.hoisted(() => ({ manifest: false }));

vi.mock(
  "@/services/crypto/inbound_attachment_keys",
  async (import_original) => ({
    ...(await import_original<Record<string, unknown>>()),
    has_sealed_attachment_manifest: () => sealed.manifest,
  }),
);

vi.mock("@/services/api/attachments", () => ({
  list_attachments: vi.fn(),
  batch_attachment_meta: (...args: unknown[]) =>
    batch_attachment_meta_mock(...args),
}));

vi.mock("@/services/crypto/memory_key_store", async (import_original) => ({
  ...(await import_original<Record<string, unknown>>()),
  on_vault_stored: () => () => {},
  on_vault_cleared: () => () => {},
  get_passphrase_bytes: () => new Uint8Array(32).fill(9),
  get_vault_from_memory: () => null,
}));

vi.mock("@/services/crypto/key_manager", () => ({
  encrypt_message_multi: vi.fn(),
  decrypt_message_with_any_key: vi.fn(),
}));

vi.mock("@/components/email/sandboxed_email_renderer", () => ({
  get_cached_iframe_height: () => undefined,
  SandboxedEmailRenderer: () => <div data-testid="message-body" />,
}));

vi.mock("@/components/email/banners/translation_banner", () => ({
  TranslationBanner: () => null,
}));

vi.mock("@/components/email/hooks/use_email_translation", () => ({
  use_email_translation: () => ({ on_document_ready: undefined }),
}));

vi.mock("@/lib/phishing_analyzer", () => ({
  analyze_email_content: () => new Promise(() => {}),
}));

vi.mock("@/components/ui/profile_avatar", () => ({
  ProfileAvatar: () => null,
}));

vi.mock("@/hooks/use_alias_delivery", () => ({
  normalize_alias_candidates: () => "",
  use_alias_delivery: () => null,
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth_safe: () => null,
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key, language: "en" }),
}));

vi.mock("@/components/mobile/mobile_bottom_sheet", () => ({
  MobileBottomSheet: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/components/common/encryption_info_dropdown", () => ({
  EncryptionInfoDropdown: (props: {
    context?: string;
    label?: string;
    description_key?: string;
    heading_key?: string;
    show_cipher?: boolean;
  }) =>
    props.context === "attachments" ? (
      <span
        data-cipher={String(props.show_cipher ?? true)}
        data-description={props.description_key ?? ""}
        data-heading={props.heading_key ?? ""}
        data-testid="files_encryption"
      >
        {props.label}
      </span>
    ) : null,
}));

vi.mock("@/components/toast/simple_toast", () => ({ show_toast: () => {} }));

const settings = vi.hoisted(() => ({
  preferences: {} as Record<string, unknown>,
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => settings,
}));

const { DEFAULT_PREFERENCES } = await import("@/services/api/preferences");
const { MobileThreadMessage } = await import("./mobile_thread_message");
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

const MAIL_ITEM_ID = "3d2e0a55-0000-4000-8000-0000000052ef";

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

function make_message(
  extra: Partial<DecryptedThreadMessage> = {},
): DecryptedThreadMessage {
  return {
    id: MAIL_ITEM_ID,
    item_type: "received",
    sender_name: "Outside Sender",
    sender_email: "sender@example.test",
    subject: "Signed and encrypted",
    body: "signed words from the sender",
    timestamp: "2026-11-17T12:00:00.000Z",
    is_read: true,
    is_starred: false,
    is_deleted: false,
    is_external: true,
    has_recipient_key: true,
    e2e_verified: true,
    sender_verification: "verified",
    ...extra,
  };
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  sealed.manifest = false;
  settings.preferences = { ...DEFAULT_PREFERENCES };
  clear_attachment_meta_cache();
  clear_decrypted_mime_attachments();
  batch_attachment_meta_mock.mockReset();
  batch_attachment_meta_mock.mockResolvedValue(meta_payload());
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
  clear_attachment_meta_cache();
  clear_decrypted_mime_attachments();
  vi.useRealTimers();
});

async function render_message(message: DecryptedThreadMessage): Promise<void> {
  act(() => {
    root!.render(
      <MobileThreadMessage
        is_expanded
        format_detail={() => "Nov 17, 2026"}
        is_own_message={false}
        load_remote_content={false}
        message={message}
        on_external_content_detected={() => {}}
        on_forward={() => {}}
        on_open_menu={() => {}}
        on_reply={() => {}}
        on_toggle={() => {}}
        t={(key) => key}
      />,
    );
  });
  for (let turn = 0; turn < 10; turn++) {
    await act(async () => {
      vi.runAllTimers();
      for (let tick = 0; tick < 10; tick++) await Promise.resolve();
    });
  }
}

function files_badge(): HTMLElement | null {
  return (
    container?.querySelector<HTMLElement>('[data-testid="files_encryption"]') ??
    null
  );
}

describe("MobileThreadMessage files next to a decrypted outside message", () => {
  it("labels stored files as outside the encrypted message", async () => {
    await render_message(make_message());

    expect(container?.textContent).toContain("outer_invoice.pdf");
    const badge = files_badge();

    expect(badge?.textContent).toBe("common.files_outside_encrypted_label");
    expect(badge?.dataset.description).toBe("common.files_outside_encrypted");
    expect(badge?.dataset.heading).toBe("common.files_outside_encrypted_label");
    expect(badge?.dataset.cipher).toBe("false");
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

    await render_message(
      make_message({ decrypted_content_tag: "shown-content-tag" }),
    );

    expect(container?.textContent).toContain("inner_contract.pdf");
    expect(container?.textContent).not.toContain("outer_invoice.pdf");
    expect(files_badge()).toBe(null);
  });

  it("adds no label for outside mail that was not decrypted", async () => {
    await render_message(
      make_message({ e2e_verified: false, sender_verification: undefined }),
    );

    expect(container?.textContent).toContain("outer_invoice.pdf");
    expect(files_badge()).toBe(null);
  });

  it("labels files you sent encrypted as end-to-end, like desktop", async () => {
    await render_message(
      make_message({ item_type: "sent", sent_encryption_scope: "outside" }),
    );

    expect(container?.textContent).toContain("outer_invoice.pdf");
    const badge = files_badge();

    expect(badge?.textContent).toBe("common.end_to_end_encrypted_label");
    expect(badge?.dataset.description).toBe("");
    expect(badge?.dataset.heading).toBe("");
    expect(badge?.dataset.cipher).toBe("true");
  });

  it("labels files in a sealed manifest as end-to-end, like desktop", async () => {
    sealed.manifest = true;

    await render_message(make_message());

    expect(container?.textContent).toContain("outer_invoice.pdf");
    const badge = files_badge();

    expect(badge?.textContent).toBe("common.end_to_end_encrypted_label");
    expect(badge?.dataset.description).toBe("");
    expect(badge?.dataset.heading).toBe("");
    expect(badge?.dataset.cipher).toBe("true");
  });

  it("adds no end-to-end label for a sealed manifest the message did not verify", async () => {
    sealed.manifest = true;

    await render_message(
      make_message({ e2e_verified: false, sender_verification: undefined }),
    );

    expect(container?.textContent).toContain("outer_invoice.pdf");
    expect(files_badge()).toBe(null);
  });
});
