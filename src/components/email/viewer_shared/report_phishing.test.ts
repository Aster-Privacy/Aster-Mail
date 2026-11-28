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
import type { InboxEmail } from "@/types/email";

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
const bulk_update_metadata_by_ids = vi.hoisted(() =>
  vi.fn(async (_ids: string[], _flags: unknown) => ({ success: true })),
);
const report_spam_sender = vi.hoisted(() =>
  vi.fn(async (_email: string) => ({
    data: { success: true, sender_entry_id: "entry_1", feedback_id: "fb_1" },
  })),
);
const retract_spam_report = vi.hoisted(() =>
  vi.fn(async (_receipt: unknown) => ({
    data: { success: state.retract_success },
  })),
);
const remove_spam_sender = vi.hoisted(() =>
  vi.fn(async (_email: string) => ({ data: { success: true } })),
);
const show_action_toast = vi.hoisted(() =>
  vi.fn((opts: { on_undo?: () => Promise<unknown> }) => {
    state.on_undo = opts.on_undo ?? null;
  }),
);
const emit_mail_item_updated = vi.hoisted(() => vi.fn());
const emit_mail_items_removed = vi.hoisted(() => vi.fn());

vi.mock("@/services/crypto/mail_metadata", () => ({
  update_item_metadata,
  bulk_update_metadata_by_ids,
}));
vi.mock("@/services/api/mail", () => ({
  report_spam_sender,
  retract_spam_report,
  remove_spam_sender,
}));
vi.mock("@/components/toast/action_toast", () => ({ show_action_toast }));
vi.mock("@/components/toast/simple_toast", () => ({ show_toast: vi.fn() }));
vi.mock("@/services/category_index", () => ({ reindex_ids: vi.fn() }));
vi.mock("@/hooks/use_mail_stats", () => ({ invalidate_mail_stats: vi.fn() }));
vi.mock("@/hooks/mail_events", () => ({
  emit_mail_changed: vi.fn(),
  emit_mail_item_updated,
  emit_mail_items_removed,
  emit_mail_soft_refresh: vi.fn(),
}));

const {
  clear_phishing_reports,
  is_phishing_reported,
  mark_message_not_spam,
  phishing_menu_state,
  report_phishing_for_emails,
  report_phishing_with_undo,
  report_spam_with_retract,
  reportable_message,
} = await import("./report_phishing");

const t = (key: string) => key;

function make_message(
  overrides: Partial<DecryptedThreadMessage> = {},
): DecryptedThreadMessage {
  return {
    id: "m1",
    item_type: "received",
    sender_email: "sender@example.com",
    encrypted_metadata: "meta",
    metadata_nonce: "n1",
    is_spam: false,
    is_trashed: true,
    ...overrides,
  } as DecryptedThreadMessage;
}

function make_email(overrides: Partial<InboxEmail> = {}): InboxEmail {
  return {
    id: "e1",
    item_type: "received",
    sender_email: "sender@example.com",
    is_spam: false,
    is_trashed: false,
    ...overrides,
  } as InboxEmail;
}

beforeEach(() => {
  vi.clearAllMocks();
  clear_phishing_reports();
  state.on_undo = null;
  state.undo_metadata_success = true;
  state.retract_success = true;
});

describe("phishing_menu_state", () => {
  it("offers both not spam and report phishing in spam", () => {
    expect(
      phishing_menu_state({
        item_type: "received",
        in_spam: true,
        is_reported: false,
      }),
    ).toEqual({ show_not_spam: true, report_phishing: "enabled" });
  });

  it("offers report phishing outside spam without not spam", () => {
    expect(
      phishing_menu_state({
        item_type: "received",
        in_spam: false,
        is_reported: false,
      }),
    ).toEqual({ show_not_spam: false, report_phishing: "enabled" });
  });

  it("shows the reported state once a message is reported", () => {
    expect(
      phishing_menu_state({
        item_type: "received",
        in_spam: true,
        is_reported: true,
      }).report_phishing,
    ).toBe("reported");
  });

  it.each(["sent", "draft", "scheduled", "outbox"])(
    "hides report phishing for %s items",
    (item_type) => {
      expect(
        phishing_menu_state({ item_type, in_spam: true, is_reported: false }),
      ).toEqual({ show_not_spam: false, report_phishing: "hidden" });
    },
  );

  it("hides report phishing for an own message", () => {
    expect(
      phishing_menu_state({
        item_type: "received",
        is_own_message: true,
        in_spam: false,
        is_reported: false,
      }).report_phishing,
    ).toBe("hidden");
  });
});

describe("reportable_message", () => {
  it("prefers the open message and skips own and sent messages", () => {
    const messages = [
      make_message({ id: "a" }),
      make_message({ id: "b", item_type: "sent" }),
      make_message({ id: "c", sender_email: "m.e@astermail.org" }),
    ];

    expect(reportable_message(messages, "a", "me@astermail.org")?.id).toBe("a");
    expect(reportable_message(messages, "b", "me@astermail.org")?.id).toBe("a");
    expect(reportable_message(messages, "c", "me@astermail.org")?.id).toBe("a");
    expect(
      reportable_message([messages[1]], "b", "me@astermail.org"),
    ).toBeUndefined();
  });
});

describe("report_phishing_with_undo outside spam", () => {
  it("moves to spam and offers undo that restores and retracts", async () => {
    expect(await report_phishing_with_undo(make_message(), t)).toBe("moved");
    expect(is_phishing_reported("m1")).toBe(true);
    expect(show_action_toast).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "common.reported_as_phishing",
        email_ids: ["m1"],
      }),
    );

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
    expect(is_phishing_reported("m1")).toBe(false);
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

  it("shows no undo when the move fails", async () => {
    update_item_metadata.mockResolvedValueOnce({ success: false } as never);

    expect(await report_phishing_with_undo(make_message(), t)).toBe("failed");
    expect(show_action_toast).not.toHaveBeenCalled();
    expect(report_spam_sender).not.toHaveBeenCalled();
    expect(is_phishing_reported("m1")).toBe(false);
  });
});

describe("report_phishing_with_undo in spam", () => {
  it("keeps the message in spam and still sends the report", async () => {
    const outcome = await report_phishing_with_undo(
      make_message({ is_spam: true }),
      t,
    );

    expect(outcome).toBe("kept");
    expect(update_item_metadata).not.toHaveBeenCalled();
    expect(emit_mail_items_removed).not.toHaveBeenCalled();
    expect(report_spam_sender).toHaveBeenCalledWith("sender@example.com");
    expect(is_phishing_reported("m1")).toBe(true);
    expect(show_action_toast).toHaveBeenCalledWith(
      expect.objectContaining({ message: "common.reported_as_phishing" }),
    );
  });

  it("undo retracts the report without moving anything", async () => {
    await report_phishing_with_undo(make_message({ is_spam: true }), t);

    expect(await state.on_undo!()).toBeUndefined();
    expect(retract_spam_report).toHaveBeenCalledTimes(1);
    expect(update_item_metadata).not.toHaveBeenCalled();
    expect(emit_mail_item_updated).not.toHaveBeenCalled();
    expect(is_phishing_reported("m1")).toBe(false);
  });
});

describe("report_phishing_for_emails", () => {
  it("keeps rows in spam and skips sent rows", async () => {
    const outcome = await report_phishing_for_emails(
      [
        make_email({ id: "e1", is_spam: true }),
        make_email({ id: "e2", item_type: "sent" }),
      ],
      true,
      t,
    );

    expect(outcome).toBe("kept");
    expect(bulk_update_metadata_by_ids).not.toHaveBeenCalled();
    expect(is_phishing_reported("e1")).toBe(true);
    expect(is_phishing_reported("e2")).toBe(false);
  });

  it("moves whole conversations outside spam and restores trash on undo", async () => {
    const outcome = await report_phishing_for_emails(
      [
        make_email({ id: "e1", grouped_email_ids: ["e1", "e3"] }),
        make_email({ id: "e2", is_trashed: true }),
      ],
      false,
      t,
    );

    expect(outcome).toBe("moved");
    expect(bulk_update_metadata_by_ids).toHaveBeenCalledWith(
      ["e1", "e3", "e2"],
      { is_spam: true, is_trashed: false },
    );

    expect(await state.on_undo!()).toBeUndefined();
    expect(bulk_update_metadata_by_ids).toHaveBeenCalledWith(["e1", "e3"], {
      is_spam: false,
    });
    expect(bulk_update_metadata_by_ids).toHaveBeenCalledWith(["e2"], {
      is_spam: false,
      is_trashed: true,
    });
  });

  it("does nothing when no row can be reported", async () => {
    expect(
      await report_phishing_for_emails(
        [make_email({ item_type: "draft" })],
        false,
        t,
      ),
    ).toBe("failed");
    expect(report_spam_sender).not.toHaveBeenCalled();
  });
});

describe("mark_message_not_spam", () => {
  it("clears the reported state and offers undo", async () => {
    await report_phishing_with_undo(make_message({ is_spam: true }), t);

    expect(
      await mark_message_not_spam(make_message({ is_spam: true }), t),
    ).toBe(true);
    expect(is_phishing_reported("m1")).toBe(false);
    expect(remove_spam_sender).toHaveBeenCalledWith("sender@example.com");
    expect(show_action_toast).toHaveBeenLastCalledWith(
      expect.objectContaining({ message: "common.marked_as_not_spam" }),
    );

    await state.on_undo!();
    expect(update_item_metadata).toHaveBeenLastCalledWith(
      "m1",
      expect.anything(),
      { is_spam: true },
    );
  });
});

describe("report_spam_with_retract", () => {
  it("retracts the receipt instead of sending a not spam signal", async () => {
    const undo = report_spam_with_retract("sender@example.com");

    await undo();
    expect(retract_spam_report).toHaveBeenCalledTimes(1);
    expect(remove_spam_sender).not.toHaveBeenCalled();
  });
});
