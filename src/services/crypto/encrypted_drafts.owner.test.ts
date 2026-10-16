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

const create_draft = vi.fn();
const update_draft = vi.fn();
const delete_draft = vi.fn();

vi.mock("@/services/api/multi_drafts", () => ({
  create_draft: (...args: unknown[]) => create_draft(...args),
  update_draft: (...args: unknown[]) => update_draft(...args),
  delete_draft: (...args: unknown[]) => delete_draft(...args),
}));

vi.mock("@/hooks/mail_events", () => ({
  emit_drafts_changed: vi.fn(),
  emit_draft_updated: vi.fn(),
}));

import { draft_manager } from "./encrypted_drafts";

import type { EncryptedVault } from "./key_manager";

const vault = {} as EncryptedVault;

beforeEach(() => {
  create_draft.mockReset();
  update_draft.mockReset();
  delete_draft.mockReset();
  draft_manager.clear_all_contexts();
});

describe("draft owner lookup", () => {
  it("finds the window that loaded a draft", () => {
    const context_id = draft_manager.load_context("draft-1", 3);

    draft_manager.set_context_owner(context_id, "window-a");

    expect(draft_manager.find_draft_owner("draft-1")).toBe("window-a");
    expect(draft_manager.find_draft_owner("draft-2")).toBeUndefined();
  });

  it("finds the window whose autosave created the draft", async () => {
    create_draft.mockResolvedValue({
      data: { id: "draft-new", version: 1 },
    });
    const context_id = draft_manager.create_context("new");

    draft_manager.set_context_owner(context_id, "window-b");

    expect(draft_manager.find_draft_owner("draft-new")).toBeUndefined();

    await draft_manager.save_draft(
      context_id,
      {
        to_recipients: ["a@example.com"],
        cc_recipients: [],
        bcc_recipients: [],
        subject: "hello",
        message: "body",
      },
      vault,
    );

    expect(draft_manager.find_draft_owner("draft-new")).toBe("window-b");
  });

  it("forgets the owner once the window closes", () => {
    const context_id = draft_manager.load_context("draft-1", 1);

    draft_manager.set_context_owner(context_id, "window-a");
    draft_manager.clear_context(context_id);

    expect(draft_manager.find_draft_owner("draft-1")).toBeUndefined();
  });
});
