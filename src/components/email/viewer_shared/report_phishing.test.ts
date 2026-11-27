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
import type { DecryptedThreadMessage } from "@/types/thread";

import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  on_undo: null as null | (() => Promise<unknown>),
  undo_metadata_success: true,
  retract_success: true,
}));

const update_item_metadata = vi.hoisted(() =>
  vi.fn(async (_id: string, _meta: unknown, flags: { is_spam?: boolean }) =>
    flags.is_spam
      ? {
          success: true,
          encrypted: { encrypted_metadata: "spam_meta", metadata_nonce: "n2" },
        }
      : { success: state.undo_metadata_success },
  ),
);
const report_spam_sender = vi.hoisted(() =>
  vi.fn(async () => ({
    data: { success: true, sender_entry_id: "entry_1", feedback_id: "fb_1" },
  })),
);
const retract_spam_report = vi.hoisted(() =>
  vi.fn(async () => ({ data: { success: state.retract_success } })),
);
const show_action_toast = vi.hoisted(() =>
  vi.fn((opts: { on_undo?: () => Promise<unknown> }) => {
    state.on_undo = opts.on_undo ?? null;
  }),
);
const emit_mail_item_updated = vi.hoisted(() => vi.fn());

vi.mock("@/services/crypto/mail_metadata", () => ({ update_item_metadata }));
vi.mock("@/services/api/mail", () => ({
  report_spam_sender,
  retract_spam_report,
}));
vi.mock("@/components/toast/action_toast", () => ({ show_action_toast }));
vi.mock("@/components/toast/simple_toast", () => ({ show_toast: vi.fn() }));
vi.mock("@/services/category_index", () => ({ reindex_ids: vi.fn() }));
vi.mock("@/hooks/mail_events", () => ({
  emit_mail_changed: vi.fn(),
  emit_mail_item_updated,
  emit_mail_items_removed: vi.fn(),
  emit_mail_soft_refresh: vi.fn(),
}));

const { report_phishing_with_undo } = await import("./report_phishing");

const t = (key: string) => key;

function make_message(
  overrides: Partial<DecryptedThreadMessage> = {},
): DecryptedThreadMessage {
  return {
    id: "m1",
    sender_email: "sender@example.com",
    encrypted_metadata: "meta",
    metadata_nonce: "n1",
    is_spam: false,
    is_trashed: true,
    ...overrides,
  } as DecryptedThreadMessage;
}

describe("report_phishing_with_undo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.on_undo = null;
    state.undo_metadata_success = true;
    state.retract_success = true;
  });

  it("offers undo that restores the folder and retracts the report", async () => {
    expect(await report_phishing_with_undo(make_message(), t)).toBe(true);
    expect(show_action_toast).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "common.reported_as_phishing",
        email_ids: ["m1"],
      }),
    );
    expect(state.on_undo).toBeTypeOf("function");

    expect(await state.on_undo!()).toBeUndefined();

    expect(update_item_metadata).toHaveBeenLastCalledWith(
      "m1",
      { encrypted_metadata: "spam_meta", metadata_nonce: "n2" },
      { is_spam: false, is_trashed: true },
    );
    expect(emit_mail_item_updated).toHaveBeenCalledWith({
      id: "m1",
      is_spam: false,
      is_trashed: true,
    });
    expect(retract_spam_report).toHaveBeenCalledWith({
      success: true,
      sender_entry_id: "entry_1",
      feedback_id: "fb_1",
    });
  });

  it("keeps undo available after a failed retract and does not restore twice", async () => {
    await report_phishing_with_undo(make_message(), t);
    state.retract_success = false;

    expect(await state.on_undo!()).toEqual(
      expect.objectContaining({ tone: "error", keep_undo: true }),
    );

    state.retract_success = true;
    expect(await state.on_undo!()).toBeUndefined();
    expect(update_item_metadata).toHaveBeenCalledTimes(2);
    expect(retract_spam_report).toHaveBeenCalledTimes(2);
  });

  it("keeps undo available when the folder restore fails", async () => {
    await report_phishing_with_undo(make_message(), t);
    state.undo_metadata_success = false;

    expect(await state.on_undo!()).toEqual(
      expect.objectContaining({ keep_undo: true }),
    );
    expect(retract_spam_report).not.toHaveBeenCalled();
  });

  it("shows no undo when the report itself fails", async () => {
    update_item_metadata.mockResolvedValueOnce({ success: false } as never);

    expect(await report_phishing_with_undo(make_message(), t)).toBe(false);
    expect(show_action_toast).not.toHaveBeenCalled();
    expect(report_spam_sender).not.toHaveBeenCalled();
  });
});
