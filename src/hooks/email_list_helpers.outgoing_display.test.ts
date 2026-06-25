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
import { describe, it, expect } from "vitest";

import {
  is_outgoing_view,
  outgoing_recipient_names,
  outgoing_profile_email,
  resolve_list_display_name,
} from "./email_list_helpers";

describe("is_outgoing_view", () => {
  it("is true for sent, drafts, and scheduled", () => {
    expect(is_outgoing_view("sent")).toBe(true);
    expect(is_outgoing_view("drafts")).toBe(true);
    expect(is_outgoing_view("scheduled")).toBe(true);
  });

  it("is false for incoming and system views", () => {
    for (const view of [
      "inbox",
      "spam",
      "trash",
      "archive",
      "starred",
      "snoozed",
      "all",
      "search",
      "folder-abc",
      "tag-xyz",
      "alias-1",
    ]) {
      expect(is_outgoing_view(view)).toBe(false);
    }
  });

  it("is false for undefined", () => {
    expect(is_outgoing_view(undefined)).toBe(false);
  });
});

describe("outgoing_recipient_names", () => {
  it("returns the recipient names in an outgoing view", () => {
    expect(outgoing_recipient_names("sent", ["Alice", "Bob"])).toEqual([
      "Alice",
      "Bob",
    ]);
  });

  it("returns null in an incoming view even with recipients", () => {
    expect(outgoing_recipient_names("inbox", ["Alice"])).toBeNull();
  });

  it("returns null when there are no recipient names", () => {
    expect(outgoing_recipient_names("sent", [])).toBeNull();
    expect(outgoing_recipient_names("sent", undefined)).toBeNull();
  });
});

describe("outgoing_profile_email", () => {
  it("targets the first recipient in an outgoing view", () => {
    expect(
      outgoing_profile_email(
        "sent",
        ["first@example.com", "second@example.com"],
        "me@astermail.org",
      ),
    ).toBe("first@example.com");
  });

  it("falls back to the sender in an incoming view", () => {
    expect(
      outgoing_profile_email("inbox", ["first@example.com"], "me@astermail.org"),
    ).toBe("me@astermail.org");
  });

  it("falls back to the sender when there are no recipients", () => {
    expect(outgoing_profile_email("sent", [], "me@astermail.org")).toBe(
      "me@astermail.org",
    );
    expect(outgoing_profile_email("sent", undefined, "me@astermail.org")).toBe(
      "me@astermail.org",
    );
  });
});

describe("resolve_list_display_name", () => {
  it("prefixes outgoing recipients with the To label", () => {
    expect(
      resolve_list_display_name({
        outgoing_names: ["Jesper Flo"],
        thread_participant_names: ["someone else"],
        fallback_name: "me",
        to_prefix: "To",
      }),
    ).toBe("To: Jesper Flo");
  });

  it("joins multiple outgoing recipients", () => {
    expect(
      resolve_list_display_name({
        outgoing_names: ["Alice", "Bob"],
        thread_participant_names: undefined,
        fallback_name: "me",
        to_prefix: "To",
      }),
    ).toBe("To: Alice, Bob");
  });

  it("uses thread participants when not an outgoing view", () => {
    expect(
      resolve_list_display_name({
        outgoing_names: null,
        thread_participant_names: ["Alice", "Bob"],
        fallback_name: "Alice",
        to_prefix: "To",
      }),
    ).toBe("Alice, Bob");
  });

  it("falls back to the sender name when there are no participants", () => {
    expect(
      resolve_list_display_name({
        outgoing_names: null,
        thread_participant_names: [],
        fallback_name: "Alice",
        to_prefix: "To",
      }),
    ).toBe("Alice");

    expect(
      resolve_list_display_name({
        outgoing_names: null,
        thread_participant_names: undefined,
        fallback_name: "Alice",
        to_prefix: "To",
      }),
    ).toBe("Alice");
  });

  it("outgoing recipients win over thread participants", () => {
    expect(
      resolve_list_display_name({
        outgoing_names: ["Recipient"],
        thread_participant_names: ["Participant"],
        fallback_name: "Sender",
        to_prefix: "To",
      }),
    ).toBe("To: Recipient");
  });
});
