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
import type { MailItem } from "@/services/api/mail";
import type { DecryptedEnvelope } from "@/types/email";

import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  parse_search_query,
  validate_operator,
} from "@/utils/search_operators";
import { matches_operator } from "@/hooks/use_search/matching";
import {
  build_chunk_skip_plan,
  summarize_chunk,
} from "@/services/search_chunk_filter";

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key, language: "en" }),
}));

const { FirstTimeSearchState } = await import("./search_results_list");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const DAY_MS = 24 * 60 * 60 * 1000;

const envelope = {
  subject: "Weekly update",
  body_text: "",
  body_html: "",
  from: { name: "Ada", email: "ada@sender.test" },
  to: [],
  cc: [],
  bcc: [],
  sent_at: new Date().toISOString(),
} as unknown as DecryptedEnvelope;

function item_at(ts: number): MailItem {
  const iso = new Date(ts).toISOString();

  return {
    id: `m-${ts}`,
    item_type: "received",
    message_ts: iso,
    created_at: iso,
  } as unknown as MailItem;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function quick_action_queries(): Map<string, string> {
  const clicked = new Map<string, string>();
  let last = "";

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <FirstTimeSearchState
        on_quick_action={(query) => {
          last = query;
        }}
      />,
    );
  });

  for (const button of container.querySelectorAll("button")) {
    act(() => {
      button.click();
    });
    clicked.set(button.textContent ?? "", last);
  }

  return clicked;
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

describe("FirstTimeSearchState quick actions", () => {
  it("only offers queries whose operators the search understands", () => {
    const queries = quick_action_queries();

    expect(queries.size).toBeGreaterThan(0);

    for (const [label, query] of queries) {
      const parsed = parse_search_query(query);

      expect(parsed.operators.length, label).toBeGreaterThan(0);
      for (const op of parsed.operators) {
        expect(validate_operator(op), `${label}: ${query}`).toBe(true);
      }
    }
  });

  it("finds mail from today under This week, and not mail from last month", () => {
    const query = quick_action_queries().get("mail.filter_this_week");

    expect(query).toBeTruthy();

    const [op] = parse_search_query(query!).operators;
    const now = Date.now();

    expect(matches_operator(op, envelope, null, item_at(now))).toBe(true);
    expect(
      matches_operator(op, envelope, null, item_at(now - 40 * DAY_MS)),
    ).toBe(false);
  });

  it("does not let the index skip a block that holds today's mail", () => {
    const query = quick_action_queries().get("mail.filter_this_week");
    const plan = build_chunk_skip_plan({
      terms: [],
      operators: parse_search_query(query!).operators,
      probe_terms: false,
    });
    const { summary } = summarize_chunk(
      [item_at(Date.now() - 60 * DAY_MS), item_at(Date.now())],
      [
        { envelope, metadata: null },
        { envelope, metadata: null },
      ],
    );

    expect(plan.skip_by_summary(summary)).toBe(false);
  });
});
