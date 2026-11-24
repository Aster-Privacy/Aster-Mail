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
import type { ThreadAttachment } from "@/types/thread";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const batch_attachment_meta_mock = vi.fn();

vi.mock("@/services/api/attachments", () => ({
  list_attachments: vi.fn(),
  batch_attachment_meta: (...args: unknown[]) =>
    batch_attachment_meta_mock(...args),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  on_vault_stored: () => () => {},
  get_passphrase_bytes: () => new Uint8Array(32).fill(9),
  get_vault_from_memory: () => null,
  on_vault_cleared: vi.fn(),
}));

vi.mock("@/services/crypto/key_manager", () => ({
  encrypt_message_multi: vi.fn(),
  decrypt_message_with_any_key: vi.fn(),
}));
const { use_thread_message_attachments } = await import(
  "./use_thread_message_attachments"
);
const { set_decrypted_mime_attachments, clear_decrypted_mime_attachments } =
  await import("@/services/decrypted_mime_attachments");
const { clear_attachment_meta_cache } = await import(
  "@/services/attachment_meta_cache"
);
const { clear_attachment_keys } = await import(
  "@/services/crypto/inbound_attachment_keys"
);

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const MAIL_ITEM_ID = "5b2e0a55-0000-4000-8000-0000000081bb";
const EARLIER_TAG = "earlier-decrypt-tag";
const SHOWN_TAG = "shown-decrypt-tag";

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let latest: ThreadAttachment[] = [];

function Probe({ tag }: { tag?: string }) {
  latest = use_thread_message_attachments(
    MAIL_ITEM_ID,
    true,
    "Encrypted attachment",
    undefined,
    tag,
  );

  return null;
}

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

async function render_probe(tag?: string): Promise<void> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root!.render(<Probe tag={tag} />);
  });

  for (let i = 0; i < 10; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
  }
}

beforeEach(() => {
  latest = [];
  clear_attachment_meta_cache();
  clear_attachment_keys();
  clear_decrypted_mime_attachments();
  batch_attachment_meta_mock.mockReset();
  batch_attachment_meta_mock.mockResolvedValue({ data: { items: {} } });
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  clear_decrypted_mime_attachments();
});

describe("mobile decrypted files belong to the text they came from", () => {
  it("hides files from a different decrypt of the same message", async () => {
    store_earlier_file(EARLIER_TAG);
    await render_probe(SHOWN_TAG);

    expect(latest.map((a) => a.filename)).toEqual([]);
  });

  it("hides stored files when the shown message has no tag", async () => {
    store_earlier_file(EARLIER_TAG);
    await render_probe(undefined);

    expect(latest.map((a) => a.filename)).toEqual([]);
  });

  it("shows stored files when the tags match", async () => {
    store_earlier_file(SHOWN_TAG);
    await render_probe(SHOWN_TAG);

    expect(latest.map((a) => a.filename)).toEqual(["earlier.pdf"]);
  });
});
