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

import { resolve_from_sender, from_tier_fallback } from "./resolve_from_sender";
import { sender_is_pending } from "./sender_pending";

const options = [
  { id: "primary", email: "me@astermail.org", type: "primary" },
  { id: "alias-1", email: "shopping@astermail.org", type: "alias" },
];

describe("sender_is_pending", () => {
  const cold_options = [options[0]];

  it("waits for a saved draft address that has not loaded yet", () => {
    const resolved = resolve_from_sender({
      options: cold_options,
      draft_from: "shopping@astermail.org",
    });

    expect(resolved?.tier).toBe(from_tier_fallback);
    expect(
      sender_is_pending({
        loading: true,
        chosen_by_user: false,
        draft_from: "shopping@astermail.org",
        selected_email: resolved?.option.email,
      }),
    ).toBe(true);
  });

  it("settles once the saved draft address is selected", () => {
    const resolved = resolve_from_sender({
      options,
      draft_from: "shopping@astermail.org",
    });

    expect(
      sender_is_pending({
        loading: true,
        chosen_by_user: false,
        draft_from: "Shopping@astermail.org",
        selected_email: resolved?.option.email,
      }),
    ).toBe(false);
  });

  it("waits while no sender is selected and addresses are loading", () => {
    expect(
      sender_is_pending({ loading: true, chosen_by_user: false }),
    ).toBe(true);
  });

  it("does not wait for a new message from the primary address", () => {
    expect(
      sender_is_pending({
        loading: true,
        chosen_by_user: false,
        selected_email: "me@astermail.org",
      }),
    ).toBe(false);
  });

  it("does not wait when you picked the sender", () => {
    expect(
      sender_is_pending({
        loading: true,
        chosen_by_user: true,
        draft_from: "shopping@astermail.org",
        selected_email: "me@astermail.org",
      }),
    ).toBe(false);
  });

  it("does not wait after addresses finish loading", () => {
    expect(
      sender_is_pending({
        loading: false,
        chosen_by_user: false,
        draft_from: "gone@astermail.org",
        selected_email: "me@astermail.org",
      }),
    ).toBe(false);
    expect(
      sender_is_pending({ loading: false, chosen_by_user: false }),
    ).toBe(false);
  });
});

describe("sender_is_pending for replies and forwards", () => {
  it("waits while a thread-bound composer is still loading addresses", () => {
    expect(
      sender_is_pending({
        loading: true,
        chosen_by_user: false,
        selected_email: "me@astermail.org",
        thread_bound: true,
      }),
    ).toBe(true);
  });

  it("waits until sender resolution is ready", () => {
    expect(
      sender_is_pending({
        loading: false,
        chosen_by_user: false,
        selected_email: "me@astermail.org",
        thread_bound: true,
        resolution_ready: false,
      }),
    ).toBe(true);
  });

  it("waits while the selected address differs from the expected one", () => {
    expect(
      sender_is_pending({
        loading: false,
        chosen_by_user: false,
        selected_email: "me@astermail.org",
        thread_bound: true,
        resolution_ready: true,
        expected_email: "shopping@astermail.org",
      }),
    ).toBe(true);
    expect(
      sender_is_pending({
        loading: false,
        chosen_by_user: false,
        thread_bound: true,
        resolution_ready: true,
        expected_email: "shopping@astermail.org",
      }),
    ).toBe(true);
  });

  it("is ready once the expected address is selected", () => {
    expect(
      sender_is_pending({
        loading: false,
        chosen_by_user: false,
        selected_email: "Shopping@astermail.org",
        thread_bound: true,
        resolution_ready: true,
        expected_email: "shopping@astermail.org",
      }),
    ).toBe(false);
  });

  it("never waits once the user picks the sender", () => {
    expect(
      sender_is_pending({
        loading: true,
        chosen_by_user: true,
        selected_email: "me@astermail.org",
        thread_bound: true,
        resolution_ready: false,
        expected_email: "shopping@astermail.org",
      }),
    ).toBe(false);
  });
});

describe("resolve_from_sender with plus addresses", () => {
  it("picks the alias a plus-tagged address was delivered to", () => {
    const resolved = resolve_from_sender({
      options,
      thread_addresses: ["shopping+orders@astermail.org"],
    });

    expect(resolved?.option.id).toBe("alias-1");
  });

  it("prefers an exact match over the untagged base", () => {
    const resolved = resolve_from_sender({
      options: [
        ...options,
        {
          id: "alias-2",
          email: "shopping+orders@astermail.org",
          type: "alias",
        },
      ],
      thread_addresses: ["shopping+orders@astermail.org"],
    });

    expect(resolved?.option.id).toBe("alias-2");
  });
});
