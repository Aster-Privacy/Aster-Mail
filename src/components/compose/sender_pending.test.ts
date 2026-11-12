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
