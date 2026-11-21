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
import type { ScheduledEmailWithContent } from "@/services/api/scheduled";
import type { EncryptedVault } from "@/services/crypto/key_manager";

import { describe, it, expect, vi, beforeEach } from "vitest";

import { get_active_translations } from "@/lib/i18n/translations";

const create_draft = vi.fn();
const delete_draft = vi.fn();
const cancel_scheduled_email = vi.fn();
const emit_scheduled_cancelled = vi.fn();
const emit_scheduled_changed = vi.fn();

vi.mock("@/services/api/multi_drafts", () => ({
  create_draft: (...args: unknown[]) => create_draft(...args),
  delete_draft: (...args: unknown[]) => delete_draft(...args),
}));

vi.mock("@/services/api/scheduled", () => ({
  cancel_scheduled_email: (...args: unknown[]) =>
    cancel_scheduled_email(...args),
}));

vi.mock("@/hooks/mail_events", () => ({
  emit_scheduled_cancelled: (...args: unknown[]) =>
    emit_scheduled_cancelled(...args),
  emit_scheduled_changed: (...args: unknown[]) =>
    emit_scheduled_changed(...args),
}));

vi.mock("@/hooks/use_mail_stats", () => ({
  invalidate_mail_stats: vi.fn(),
}));

import { scheduled_to_draft } from "./scheduled_to_draft";

const vault = {} as EncryptedVault;

function make_email(
  overrides: Partial<ScheduledEmailWithContent["content"]> = {},
): ScheduledEmailWithContent {
  return {
    id: "sched-1",
    scheduled_at: "2026-10-20T10:00:00.000Z",
    status: "pending",
    created_at: "2026-10-16T10:00:00.000Z",
    updated_at: "2026-10-16T10:00:00.000Z",
    content: {
      to_recipients: ["a@example.com"],
      cc_recipients: ["b@example.com"],
      bcc_recipients: [],
      subject: "Hello",
      body: "<p>Body</p>",
      scheduled_at: "2026-10-20T10:00:00.000Z",
      ...overrides,
    },
  };
}

beforeEach(() => {
  create_draft.mockReset();
  delete_draft.mockReset();
  cancel_scheduled_email.mockReset();
  emit_scheduled_cancelled.mockReset();
  emit_scheduled_changed.mockReset();
  create_draft.mockResolvedValue({
    data: { id: "draft-1", version: 1, updated_at: "2026-10-16T11:00:00Z" },
  });
  cancel_scheduled_email.mockResolvedValue({ data: { success: true } });
  delete_draft.mockResolvedValue({ data: {} });
});

describe("editing a scheduled email that can't be verified", () => {
  it("refuses to turn it into a draft and leaves it scheduled", async () => {
    const result = await scheduled_to_draft(
      { ...make_email(), content_verified: false },
      vault,
    );

    expect(create_draft).not.toHaveBeenCalled();
    expect(cancel_scheduled_email).not.toHaveBeenCalled();
    expect(result).toEqual({
      error: get_active_translations().errors.scheduled_unverifiable,
    });
  });

  it("still edits a verified one", async () => {
    const result = await scheduled_to_draft(
      { ...make_email(), content_verified: true },
      vault,
    );

    expect(create_draft).toHaveBeenCalledTimes(1);
    expect("data" in result).toBe(true);
  });
});
