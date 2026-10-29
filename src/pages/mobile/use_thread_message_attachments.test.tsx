//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
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
const { array_to_base64 } = await import("@/services/crypto/envelope");
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

const MAIL_ITEM_ID = "5b2e0a55-0000-4000-8000-0000000071aa";

function meta_row(
  seq_num: number,
  filename: string,
  content_type: string,
  content_id?: string,
) {
  return {
    id: `att-row-${seq_num}`,
    mail_item_id: MAIL_ITEM_ID,
    seq_num,
    size_bytes: 68,
    meta_nonce: array_to_base64(new Uint8Array(12)),
    encrypted_meta: array_to_base64(
      new TextEncoder().encode(
        JSON.stringify({
          filename,
          content_type,
          content_id,
          session_key: "",
        }),
      ),
    ),
  };
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let latest: ThreadAttachment[] = [];

function Probe({ id, enabled }: { id: string; enabled: boolean }) {
  latest = use_thread_message_attachments(id, enabled, "Encrypted attachment");

  return null;
}

async function render_probe(enabled: boolean): Promise<void> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root!.render(<Probe enabled={enabled} id={MAIL_ITEM_ID} />);
  });

  for (let i = 0; i < 20; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
  }
}

beforeEach(() => {
  latest = [];
  clear_attachment_meta_cache();
  clear_attachment_keys();
  batch_attachment_meta_mock.mockReset();
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("use_thread_message_attachments", () => {
  it("loads the server rows for a received message, inline images included", async () => {
    batch_attachment_meta_mock.mockResolvedValue({
      data: {
        items: {
          [MAIL_ITEM_ID]: [
            meta_row(1, "report.pdf", "application/pdf"),
            meta_row(0, "IMG_0001.jpeg", "image/jpeg", "aster-inline-5"),
          ],
        },
      },
    });

    await render_probe(true);

    expect(batch_attachment_meta_mock).toHaveBeenCalledWith([MAIL_ITEM_ID]);
    expect(latest.map((a) => a.id)).toEqual(["att-row-0", "att-row-1"]);
    expect(latest[0]).toMatchObject({
      filename: "IMG_0001.jpeg",
      content_type: "image/jpeg",
      content_id: "aster-inline-5",
      size: 68,
    });
    expect(latest[1].filename).toBe("report.pdf");
  });

  it("does not fetch for a message that is still sending", async () => {
    await render_probe(false);

    expect(batch_attachment_meta_mock).not.toHaveBeenCalled();
    expect(latest).toEqual([]);
  });

  it("shows nothing when the server has no rows", async () => {
    batch_attachment_meta_mock.mockResolvedValue({
      data: { items: { [MAIL_ITEM_ID]: [] } },
    });

    await render_probe(true);

    expect(latest).toEqual([]);
  });
});
