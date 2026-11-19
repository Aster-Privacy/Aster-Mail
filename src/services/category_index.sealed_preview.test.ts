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
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/services/crypto/secure_storage", () => ({
  secure_encrypt: async (s: string) => s,
  secure_decrypt: async (s: string) => s,
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  has_vault_in_memory: () => true,
  on_vault_cleared: () => {},
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account_id: async () => "acct1",
  accounts_storage_unreadable: () => false,
}));

vi.mock("@/services/api/mail", () => ({
  list_mail_items: vi.fn(),
}));

vi.mock("@/services/crypto/mail_metadata", () => ({
  decrypt_mail_metadata: vi.fn(async () => null),
  update_item_metadata: async () => ({ success: true }),
}));

vi.mock("@/services/mail_categorizer", () => ({
  CLASSIFIER_VERSION: 2,
  classify: () => "primary",
  CATEGORY_TABS: ["primary"],
}));

const RATCHET_BODY = JSON.stringify({
  type: "double_ratchet_v2",
  sender_identity_key: "sender_key",
  recipients: {},
});

const bodies = new Map<string, string>();

vi.mock("@/hooks/email_list_helpers", () => ({
  decrypt_envelope: async (_envelope: string, _nonce: string, id: string) => ({
    subject: `Outer ${id}`,
    from: { name: `Sender ${id}`, email: `${id}@example.test` },
    body_text: bodies.get(id) ?? "plain body",
  }),
}));

import {
  clear_category_index_memory,
  get_entry_preview,
  index_arrival,
} from "@/services/category_index";
import { list_mail_items } from "@/services/api/mail";

const mocked_list = vi.mocked(list_mail_items);

function make_item(id: string) {
  return {
    id,
    encrypted_envelope: `envelope ${bodies.get(id) ?? ""}`,
    envelope_nonce: "nonce",
    item_type: "received",
    message_ts: new Date(Date.UTC(2026, 6, 1)).toISOString(),
    created_at: new Date(Date.UTC(2026, 6, 1)).toISOString(),
    is_read: false,
  };
}

function serve(ids: string[]): void {
  mocked_list.mockImplementation((async (params: { ids?: string[] }) => ({
    data: {
      items: ids
        .filter((id) => !params.ids || params.ids.includes(id))
        .map(make_item),
      has_more: false,
    },
  })) as unknown as typeof list_mail_items);
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("category index previews of sealed messages", () => {
  beforeEach(() => {
    clear_category_index_memory();
    bodies.clear();
    mocked_list.mockReset();
  });

  it("does not keep the outer subject of a sealed message", async () => {
    bodies.set("m0", RATCHET_BODY);
    serve(["m0"]);
    await index_arrival("m0");
    await settle();

    expect(get_entry_preview("m0")).toBeUndefined();
  });

  it("drops an earlier preview once the message turns out to be sealed", async () => {
    serve(["m0"]);
    await index_arrival("m0");
    await settle();
    expect(get_entry_preview("m0")?.subject).toBe("Outer m0");

    bodies.set("m0", RATCHET_BODY);
    await index_arrival("m0");
    await settle();

    expect(get_entry_preview("m0")).toBeUndefined();
  });

  it("keeps the preview of a message that is not sealed", async () => {
    serve(["m1"]);
    await index_arrival("m1");
    await settle();

    expect(get_entry_preview("m1")?.subject).toBe("Outer m1");
  });
});
