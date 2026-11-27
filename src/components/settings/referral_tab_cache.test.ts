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
import type { ReferralInfo } from "@/services/api/billing";

import { afterEach, describe, expect, it } from "vitest";

import {
  clear_referral_tab_cache,
  peek_referral_tab,
  remember_referral_tab,
} from "./referral_tab_cache";

const snapshot = {
  info: { referral_code: "abc" } as unknown as ReferralInfo,
  history: [],
  my_status: null,
  affiliate_status: null,
  payout_history: [],
};

describe("referral tab cache", () => {
  afterEach(() => {
    clear_referral_tab_cache();
  });

  it("keeps the last loaded invite details for an instant revisit", () => {
    expect(peek_referral_tab()).toBeNull();
    remember_referral_tab(snapshot);
    expect(peek_referral_tab()).toEqual(snapshot);
  });

  it("ignores a snapshot without invite details", () => {
    remember_referral_tab({ ...snapshot, info: null });
    expect(peek_referral_tab()).toBeNull();
  });

  it("forgets everything when the account changes", () => {
    remember_referral_tab(snapshot);
    clear_referral_tab_cache();
    expect(peek_referral_tab()).toBeNull();
  });
});
