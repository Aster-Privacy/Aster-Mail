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
import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const RATCHET_BODY = JSON.stringify({
  type: "double_ratchet_v2",
  sender_identity_key: "sender_key",
  recipients: {},
});

const heads = new Map([["primary", ["head_1"]]]);
let generation = 1;
let body_text: string | undefined = RATCHET_BODY;
let bundle: { body: string; subject: string | null; sealed: boolean } = {
  body: "hello",
  subject: "Quarterly report",
  sealed: true,
};

vi.mock("@/services/category_index", () => ({
  get_new_head_ids: () => heads,
  get_index_generation: () => generation,
  get_entry_preview: () => undefined,
  get_preview_version: () => 1,
  get_version: () => 1,
  subscribe: () => () => {},
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  on_vault_cleared: () => () => {},
  on_vault_stored: () => () => {},
  are_keys_ready: () => true,
  on_keys_ready: () => () => {},
}));

vi.mock("@/services/api/mail", () => ({
  list_mail_items: async () => ({
    data: {
      items: [
        { id: "head_1", encrypted_envelope: "enc", envelope_nonce: "nonce" },
      ],
    },
  }),
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account: async () => ({ user: { email: "me@aster.test" } }),
}));

vi.mock("@/hooks/email_list_helpers", () => ({
  decrypt_envelope: async () => ({
    from: { email: "alice@example.test", name: "Alice" },
    subject: "Outer subject",
    body_text,
  }),
}));

const decrypt_body_text_with_bundle = vi.fn(async () => bundle);

vi.mock("@/utils/email_crypto", () => ({ decrypt_body_text_with_bundle }));

const { use_category_previews } = await import("@/hooks/use_category_previews");

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

async function render_subject(): Promise<string> {
  const container = document.createElement("div");

  document.body.appendChild(container);
  root = createRoot(container);

  function Probe() {
    const previews = use_category_previews(true);

    return <span>{previews.primary?.subject ?? "none"}</span>;
  }

  act(() => {
    root!.render(<Probe />);
  });
  await act(async () => {});
  await act(async () => {});

  return container.textContent ?? "";
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  generation += 1;
  body_text = RATCHET_BODY;
  bundle = { body: "hello", subject: "Quarterly report", sealed: true };
  decrypt_body_text_with_bundle.mockClear();
});

describe("category hover preview of a sealed message", () => {
  it("shows the sealed subject instead of the outer one", async () => {
    expect(await render_subject()).toBe("Quarterly report");
  });

  it("shows no preview when the sealed body cannot be opened", async () => {
    bundle = { body: "", subject: null, sealed: false };

    expect(await render_subject()).toBe("none");
  });

  it("keeps the envelope subject for a message that is not sealed", async () => {
    body_text = "plain body";
    bundle = { body: "plain body", subject: null, sealed: false };

    expect(await render_subject()).toBe("Outer subject");
  });
});
