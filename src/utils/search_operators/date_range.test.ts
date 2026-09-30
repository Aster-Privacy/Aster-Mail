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
import type { MailItem } from "@/services/api/mail";
import type { DecryptedEnvelope } from "@/types/email";

import { describe, it, expect } from "vitest";

import { build_chip_query } from "@/components/email/inbox/mail_filter_chips";
import { matches_operator } from "@/hooks/use_search/matching";
import {
  build_chunk_skip_plan,
  summarize_chunk,
} from "@/services/search_chunk_filter";
import {
  date_range_operators,
  parse_search_query,
} from "@/utils/search_operators";

const envelope = {
  subject: "Encomenda",
  body_text: "",
  body_html: "",
  from: { name: "Loja", email: "loja@sender.test" },
  to: [],
  cc: [],
  bcc: [],
  sent_at: "2026-09-29T12:00:00.000Z",
} as unknown as DecryptedEnvelope;

function item_at(local: Date): MailItem {
  const iso = local.toISOString();

  return {
    id: `m-${iso}`,
    item_type: "received",
    message_ts: iso,
    created_at: iso,
  } as unknown as MailItem;
}

function in_range(query: string, local: Date): boolean {
  return parse_search_query(query)
    .operators.filter((op) => op.type === "after" || op.type === "before")
    .every((op) => matches_operator(op, envelope, null, item_at(local)));
}

describe("date_range_operators", () => {
  it("includes the end date by searching before the day after it", () => {
    expect(date_range_operators("2026-09-29", "2026-09-29")).toEqual([
      "after:2026-09-29",
      "before:2026-09-30",
    ]);
  });

  it("rolls over months, years and leap days", () => {
    expect(date_range_operators("", "2026-09-30")).toEqual([
      "before:2026-10-01",
    ]);
    expect(date_range_operators("", "2026-12-31")).toEqual([
      "before:2027-01-01",
    ]);
    expect(date_range_operators("", "2028-02-28")).toEqual([
      "before:2028-02-29",
    ]);
    expect(date_range_operators("", "2027-02-28")).toEqual([
      "before:2027-03-01",
    ]);
  });

  it("leaves out an empty end", () => {
    expect(date_range_operators("2026-09-29", "")).toEqual([
      "after:2026-09-29",
    ]);
    expect(date_range_operators("", "")).toEqual([]);
  });

  it("passes through a value that is not a real date", () => {
    expect(date_range_operators("", "2026-02-30")).toEqual([
      "before:2026-02-30",
    ]);
    expect(date_range_operators("", "0099-01-01")).toEqual([
      "before:0099-01-01",
    ]);
    expect(date_range_operators("", "soon")).toEqual(["before:soon"]);
  });

  it("finds mail from every hour of a one-day range, and nothing outside it", () => {
    const query = date_range_operators("2026-09-29", "2026-09-29").join(" ");

    expect(in_range(query, new Date(2026, 8, 29, 0, 30))).toBe(true);
    expect(in_range(query, new Date(2026, 8, 29, 12, 0))).toBe(true);
    expect(in_range(query, new Date(2026, 8, 29, 23, 59))).toBe(true);
    expect(in_range(query, new Date(2026, 8, 28, 23, 59))).toBe(false);
    expect(in_range(query, new Date(2026, 8, 30, 0, 30))).toBe(false);
  });

  it("does not let the index skip a block holding the end date", () => {
    const plan = build_chunk_skip_plan({
      terms: [],
      operators: parse_search_query(
        date_range_operators("2026-09-25", "2026-09-29").join(" "),
      ).operators,
      probe_terms: false,
    });
    const { summary } = summarize_chunk(
      [item_at(new Date(2026, 8, 29, 18, 0))],
      [{ envelope, metadata: null }],
    );

    expect(plan.skip_by_summary(summary)).toBe(false);
  });
});

describe("inbox filter chips custom range", () => {
  it("includes the day picked as the end of the range", () => {
    const query = build_chip_query({
      from: "",
      to: "",
      date_window: "custom",
      custom_after: "2026-09-29",
      custom_before: "2026-09-29",
      has_attachment: false,
      is_unread: false,
    });

    expect(in_range(query, new Date(2026, 8, 29, 12, 0))).toBe(true);
    expect(in_range(query, new Date(2026, 8, 30, 12, 0))).toBe(false);
  });
});
