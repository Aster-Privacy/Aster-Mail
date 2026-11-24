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
import { beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_SPAM_SETTINGS,
  behavior_section_ready,
  clear_behavior_load_cache,
  peek_family_policy,
  peek_spam_settings,
  remember_family_policy,
  remember_spam_settings,
} from "./behavior_load_cache";

describe("behavior_load_cache", () => {
  beforeEach(() => {
    clear_behavior_load_cache();
  });

  it("starts empty so the first visit waits for the server", () => {
    expect(peek_spam_settings()).toBeNull();
    expect(peek_family_policy()).toBeNull();
  });

  it("remembers loaded values for the next visit", () => {
    const settings = { ...DEFAULT_SPAM_SETTINGS, spam_retention_days: 7 };

    remember_spam_settings(settings);
    remember_family_policy(null);

    expect(peek_spam_settings()).toEqual(settings);
    expect(peek_family_policy()).toEqual({ value: null });
  });

  it("forgets values on account switch", () => {
    remember_spam_settings(DEFAULT_SPAM_SETTINGS);
    remember_family_policy(null);
    clear_behavior_load_cache();

    expect(peek_spam_settings()).toBeNull();
    expect(peek_family_policy()).toBeNull();
  });

  it("is ready only when both loads have settled", () => {
    expect(
      behavior_section_ready({
        spam_settled: true,
        family_policy_settled: true,
      }),
    ).toBe(true);
    expect(
      behavior_section_ready({
        spam_settled: false,
        family_policy_settled: true,
      }),
    ).toBe(false);
    expect(
      behavior_section_ready({
        spam_settled: true,
        family_policy_settled: false,
      }),
    ).toBe(false);
  });
});
