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
import type { InboxEmail } from "@/types/email";

import { describe, it, expect } from "vitest";

import { merge_revalidated_emails } from "./email_list_merge";

function email(id: string, overrides: Partial<InboxEmail> = {}): InboxEmail {
  return {
    id,
    subject: `subject-${id}`,
    preview: `preview-${id}`,
    timestamp: "10:00 AM",
    raw_timestamp: "2024-01-01T00:00:00.000Z",
    sender_name: `sender-${id}`,
    sender_email: `${id}@example.com`,
    is_read: false,
    is_starred: false,
    is_pinned: false,
    is_selected: false,
    ...overrides,
  } as InboxEmail;
}

describe("merge_revalidated_emails", () => {
  it("preserves object identity for unchanged rows", () => {
    const existing = [email("a"), email("b")];
    const fetched = [email("a"), email("b")];

    const merged = merge_revalidated_emails(existing, fetched);

    expect(merged[0]).toBe(existing[0]);
    expect(merged[1]).toBe(existing[1]);
  });

  it("replaces a row whose content changed", () => {
    const existing = [email("a", { is_read: false })];
    const fetched = [email("a", { is_read: true })];

    const merged = merge_revalidated_emails(existing, fetched);

    expect(merged[0]).not.toBe(existing[0]);
    expect(merged[0].is_read).toBe(true);
  });

  it("keeps already-loaded older pages that are not in the refetch", () => {
    const existing = [email("a"), email("b"), email("page2")];
    const fetched = [email("a"), email("b")];

    const merged = merge_revalidated_emails(existing, fetched);

    expect(merged.map((e) => e.id)).toEqual(["a", "b", "page2"]);
    expect(merged[2]).toBe(existing[2]);
  });

  it("prepends newly arrived mail without dropping loaded rows", () => {
    const existing = [email("a"), email("b")];
    const fetched = [email("fresh"), email("a"), email("b")];

    const merged = merge_revalidated_emails(existing, fetched);

    expect(merged.map((e) => e.id)).toEqual(["fresh", "a", "b"]);
  });

  it("carries selection state from the existing row onto a fetched replacement", () => {
    const existing = [email("a", { is_selected: true })];
    const fetched = [email("a", { is_selected: false })];

    const merged = merge_revalidated_emails(existing, fetched);

    expect(merged[0]).toBe(existing[0]);
    expect(merged[0].is_selected).toBe(true);
  });

  it("does not duplicate a row present in both lists", () => {
    const existing = [email("a"), email("b")];
    const fetched = [email("a"), email("b")];

    const merged = merge_revalidated_emails(existing, fetched);

    expect(merged.map((e) => e.id)).toEqual(["a", "b"]);
  });
});
