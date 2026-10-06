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
import type { InboxEmail } from "@/types/email";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/services/crypto/memory_key_store", () => ({
  on_vault_cleared: vi.fn(),
}));

vi.mock("@/services/api/attachments", () => ({
  batch_attachment_meta: async (ids: string[]) => ({
    data: {
      items: Object.fromEntries(
        ids.map((id) => [
          id,
          [0, 1].map((seq_num) => ({
            id: `att-${id}-${seq_num}`,
            mail_item_id: id,
            seq_num,
            encrypted_meta: `${id}-${seq_num}`,
            meta_nonce: "n",
            size_bytes: 10,
          })),
        ]),
      ),
    },
  }),
}));

vi.mock("@/services/crypto/attachment_crypto", () => ({
  DEFAULT_ATTACHMENT_CONTENT_TYPE: "application/octet-stream",
  resolve_attachment_meta: async ({
    encrypted_meta,
    size_bytes,
  }: {
    encrypted_meta: string;
    size_bytes: number;
  }) => ({
    filename: `${encrypted_meta}.pdf`,
    content_type: "application/pdf",
    session_key: "",
    size_bytes,
    is_placeholder: false,
  }),
}));

const { use_attachment_previews, clear_attachment_preview_cache } =
  await import("@/hooks/use_attachment_previews");
const { register_envelope_attachment_keys, clear_attachment_keys } =
  await import("@/services/crypto/inbound_attachment_keys");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type Previews = ReturnType<typeof use_attachment_previews>;

let previews: Previews;

function Probe({ emails }: { emails: InboxEmail[] }) {
  previews = use_attachment_previews(emails);

  return null;
}

function email(id: string) {
  return { id, grouped_email_ids: [id] } as unknown as InboxEmail;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  clear_attachment_keys();
  clear_attachment_preview_cache();
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
});

describe("use_attachment_previews with envelope-listed keys", () => {
  it("shows chips only for the rows the envelope lists", async () => {
    register_envelope_attachment_keys("a", {
      attachment_keys: [
        {
          seq: 1,
          key: btoa(String.fromCharCode(...new Uint8Array(32).fill(1))),
        },
      ],
    });

    await act(async () => {
      root!.render(<Probe emails={[email("a"), email("b")]} />);
    });

    expect(previews.get("a")?.attachments.map((att) => att.id)).toEqual([
      "att-a-1",
    ]);
    expect(previews.get("b")?.attachments.map((att) => att.id)).toEqual([
      "att-b-0",
      "att-b-1",
    ]);
  });
});
