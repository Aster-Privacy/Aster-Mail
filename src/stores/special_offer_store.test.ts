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
import { beforeEach, describe, expect, it, vi } from "vitest";

const first_run = vi.hoisted(() => ({ age: 1000 as number | null }));
const offer_status = vi.hoisted(() => ({
  state: { status: null, is_loaded: true, user_id: "u" } as {
    status: { ends_at?: string | null } | null;
    is_loaded: boolean;
    user_id: string | null;
  },
}));

vi.mock("@/lib/first_run", () => ({
  first_run_age_ms: () => first_run.age,
}));

vi.mock("@/stores/special_offer_status", () => ({
  get_special_offer_status_snapshot: () => offer_status.state,
}));

import {
  can_auto_show_special_offer,
  can_show_special_offer,
  close_special_offer,
  get_special_offer_snapshot,
  request_special_offer_checkout,
  show_special_offer,
} from "./special_offer_store";

describe("special_offer_store auth route guard", () => {
  beforeEach(() => {
    close_special_offer();
    window.history.pushState({}, "", "/");
  });

  it("opens inside the app and reports it", () => {
    expect(can_show_special_offer()).toBe(true);
    expect(show_special_offer("auto")).toBe(true);
    expect(get_special_offer_snapshot().is_open).toBe(true);
  });

  it("refuses to open on the registration flow and reports it", () => {
    window.history.pushState({}, "", "/register");

    expect(can_show_special_offer()).toBe(false);
    expect(show_special_offer("auto")).toBe(false);
    expect(get_special_offer_snapshot().is_open).toBe(false);
  });
});

describe("special_offer_store timed campaign", () => {
  beforeEach(() => {
    close_special_offer();
    window.history.pushState({}, "", "/");
    first_run.age = 1000;
    offer_status.state.status = null;
  });

  it("keeps the post sign-up quiet period without ends_at", () => {
    expect(can_auto_show_special_offer()).toBe(false);
  });

  it("skips the quiet period when ends_at is set", () => {
    offer_status.state.status = { ends_at: "2026-12-02T07:59:59Z" };

    expect(can_auto_show_special_offer()).toBe(true);
  });

  it("defaults checkout to year when ends_at is set", () => {
    offer_status.state.status = { ends_at: "2026-12-02T07:59:59Z" };
    request_special_offer_checkout();

    expect(get_special_offer_snapshot().checkout_interval).toBe("year");
  });

  it("defaults checkout to month without ends_at", () => {
    request_special_offer_checkout();

    expect(get_special_offer_snapshot().checkout_interval).toBe("month");
  });

  it("honors an explicit interval", () => {
    offer_status.state.status = { ends_at: "2026-12-02T07:59:59Z" };
    request_special_offer_checkout("month");

    expect(get_special_offer_snapshot().checkout_interval).toBe("month");
  });
});
