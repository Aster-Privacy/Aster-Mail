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

import { draft_manager, type DraftData } from "./encrypted_drafts";
import type { EncryptedVault } from "./key_manager";

const vault = {} as EncryptedVault;

function draft(message: string): DraftData {
  return {
    to_recipients: ["a@example.com"],
    cc_recipients: [],
    bcc_recipients: [],
    subject: "hello",
    message,
  };
}

beforeEach(() => {
  create_draft.mockReset();
  update_draft.mockReset();
  delete_draft.mockReset();
  draft_manager.clear_all_contexts();
});

describe("draft_manager.save_draft concurrency", () => {
  it("registers the pending save before any await", async () => {
    create_draft.mockResolvedValue({ data: { id: "d1", version: 1 } });
    const context_id = draft_manager.create_context();

    const save = draft_manager.save_draft(context_id, draft("one"), vault);

    expect(draft_manager.get_context(context_id)?.pending_save).not.toBeNull();
    await save;
  });

  it("serializes two saves issued in the same tick and keeps the newer text", async () => {
    create_draft.mockResolvedValue({ data: { id: "d1", version: 1 } });
    update_draft.mockResolvedValue({ data: { id: "d1", version: 2 } });
    const context_id = draft_manager.create_context();

    const first = draft_manager.save_draft(context_id, draft("one"), vault);
    const second = draft_manager.save_draft(context_id, draft("two"), vault);

    await Promise.all([first, second]);

    expect(create_draft).toHaveBeenCalledTimes(1);
    expect(update_draft).toHaveBeenCalledTimes(1);
    expect(update_draft.mock.calls[0][0]).toBe("d1");
    expect(update_draft.mock.calls[0][1].message).toBe("two");
    expect(update_draft.mock.calls[0][2]).toBe(1);
    expect(draft_manager.get_context(context_id)?.version).toBe(2);
    expect(draft_manager.get_context(context_id)?.pending_save).toBeNull();
  });

  it("skips the network when the content did not change", async () => {
    create_draft.mockResolvedValue({ data: { id: "d1", version: 1 } });
    const context_id = draft_manager.create_context();

    await draft_manager.save_draft(context_id, draft("one"), vault);
    const result = await draft_manager.save_draft(
      context_id,
      draft("one"),
      vault,
    );

    expect(result).toEqual({ success: true, id: "d1", version: 1 });
    expect(create_draft).toHaveBeenCalledTimes(1);
    expect(update_draft).not.toHaveBeenCalled();
  });
});
