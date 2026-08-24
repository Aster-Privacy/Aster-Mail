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

import type { ScheduledListItem } from "./use_scheduled_emails";

import { describe, it, expect } from "vitest";

import { refresh_scheduled_timestamps } from "./use_scheduled_emails";

const labels = {
  sending: "Sending",
  in_one_minute: "In 1 minute",
  in_x_minutes: (count: number) => `In ${count} minutes`,
};

const options = { date_format: "MM/DD/YYYY", time_format: "12h" } as const;

function build_item(scheduled_at: string, timestamp: string): ScheduledListItem {
  return {
    id: "1",
    item_type: "scheduled",
    sender_name: "someone@example.com",
    sender_email: "someone@example.com",
    subject: "Hello",
    preview: "",
    timestamp,
    is_pinned: false,
    is_starred: false,
    is_selected: false,
    is_read: true,
    is_trashed: false,
    is_archived: false,
    is_spam: false,
    has_attachment: false,
    category: "Scheduled",
    category_color: "",
    avatar_url: "",
    is_encrypted: true,
    scheduled_at,
    status: "pending",
    to_recipients: ["someone@example.com"],
    cc_recipients: [],
    bcc_recipients: [],
    full_body: "",
  } as ScheduledListItem;
}

describe("refresh_scheduled_timestamps", () => {
  const now = Date.UTC(2026, 7, 24, 12, 0, 0);

  it("advances a countdown that went stale while the list stayed open", () => {
    const due_at = new Date(now + 10 * 60000).toISOString();
    const stale = [build_item(due_at, "In 30 minutes")];

    const result = refresh_scheduled_timestamps(stale, options, labels, now);

    expect(result.emails[0].timestamp).toBe("In 10 minutes");
    expect(result.has_due).toBe(false);
  });

  it("reports a message whose send time has passed", () => {
    const due_at = new Date(now - 1000).toISOString();
    const stale = [build_item(due_at, "In 1 minute")];

    const result = refresh_scheduled_timestamps(stale, options, labels, now);

    expect(result.emails[0].timestamp).toBe("Sending");
    expect(result.has_due).toBe(true);
  });

  it("keeps the same array when no label changed", () => {
    const due_at = new Date(now + 10 * 60000).toISOString();
    const fresh = [build_item(due_at, "In 10 minutes")];

    const result = refresh_scheduled_timestamps(fresh, options, labels, now);

    expect(result.emails).toBe(fresh);
  });
});
