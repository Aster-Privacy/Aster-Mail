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
import type { PendingSend, PendingSendPayload } from "@/hooks/use_undo_send";

import { describe, it, expect } from "vitest";

import {
  draft_from_undone_send,
  undone_send_has_content,
} from "./undone_send_draft";

const pending: PendingSend = {
  id: "queued-1",
  to: ["pending@example.com"],
  subject: "Pending subject",
  body: "<p>pending body</p>",
  scheduled_time: 0,
  total_seconds: 10,
  thread_token: "pending-thread",
};

describe("draft_from_undone_send", () => {
  it("restores a reply with its thread and quoted body", () => {
    const payload: PendingSendPayload = {
      to: ["friend@example.com"],
      cc: ["cc@example.com"],
      subject: "Re: Plans",
      body: '<p>Sounds good</p><div class="aster_quote">quoted</div>',
      sender_email: "me@example.com",
      thread_token: "reply-thread",
      draft_type: "reply",
      reply_to_id: "original-id",
      rfc_message_id: "<original@example.com>",
      restore_verbatim: true,
    };

    const draft = draft_from_undone_send(pending, payload);

    expect(draft.draft_type).toBe("reply");
    expect(draft.thread_token).toBe("reply-thread");
    expect(draft.reply_to_id).toBe("original-id");
    expect(draft.rfc_message_id).toBe("<original@example.com>");
    expect(draft.to_recipients).toEqual(["friend@example.com"]);
    expect(draft.cc_recipients).toEqual(["cc@example.com"]);
    expect(draft.message).toContain("aster_quote");
    expect(draft.from_email).toBe("me@example.com");
    expect(draft.is_restored_send).toBe(true);
  });

  it("falls back to the pending thread token", () => {
    const payload: PendingSendPayload = {
      to: ["friend@example.com"],
      subject: "Re: Plans",
      body: "<p>Hi</p>",
      draft_type: "reply",
    };

    expect(draft_from_undone_send(pending, payload).thread_token).toBe(
      "pending-thread",
    );
  });

  it("treats a restored send without a payload as empty", () => {
    expect(undone_send_has_content({ ...pending, is_restored: true })).toBe(
      false,
    );
    expect(undone_send_has_content(pending)).toBe(true);
  });
});
