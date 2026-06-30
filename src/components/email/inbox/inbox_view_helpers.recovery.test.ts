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
  should_recover_empty_view,
  MAX_EMPTY_VIEW_RECOVERIES,
  type EmptyViewRecoveryState,
} from "./inbox_view_helpers";

const base: EmptyViewRecoveryState = {
  categories_enabled: false,
  is_client_filtered: false,
  is_alias_view: false,
  current_page: 0,
  has_initial_load: true,
  is_loading: false,
  skeleton_visible: false,
  email_count: 0,
  effective_total: 25392,
  attempts: 0,
};

describe("should_recover_empty_view", () => {
  it("recovers the exact All Mail bug: loaded, empty list, large total", () => {
    expect(should_recover_empty_view(base)).toBe(true);
  });

  it("does not recover a genuinely empty mailbox (total 0)", () => {
    expect(
      should_recover_empty_view({ ...base, effective_total: 0 }),
    ).toBe(false);
  });

  it("does not recover before the first load resolves", () => {
    expect(
      should_recover_empty_view({ ...base, has_initial_load: false }),
    ).toBe(false);
  });

  it("does not recover while loading or showing a skeleton", () => {
    expect(should_recover_empty_view({ ...base, is_loading: true })).toBe(false);
    expect(
      should_recover_empty_view({ ...base, skeleton_visible: true }),
    ).toBe(false);
  });

  it("does not recover when the list already has messages", () => {
    expect(should_recover_empty_view({ ...base, email_count: 30 })).toBe(false);
  });

  it("does not fight a client-side filter that legitimately empties the list", () => {
    expect(
      should_recover_empty_view({ ...base, is_client_filtered: true }),
    ).toBe(false);
  });

  it("defers inbox to the category index and skips alias views", () => {
    expect(
      should_recover_empty_view({ ...base, categories_enabled: true }),
    ).toBe(false);
    expect(should_recover_empty_view({ ...base, is_alias_view: true })).toBe(
      false,
    );
  });

  it("only recovers the first page", () => {
    expect(should_recover_empty_view({ ...base, current_page: 3 })).toBe(false);
  });

  it("stops retrying after the attempt cap to avoid loops", () => {
    expect(
      should_recover_empty_view({
        ...base,
        attempts: MAX_EMPTY_VIEW_RECOVERIES - 1,
      }),
    ).toBe(true);
    expect(
      should_recover_empty_view({
        ...base,
        attempts: MAX_EMPTY_VIEW_RECOVERIES,
      }),
    ).toBe(false);
  });
});
