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
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./device_key_store", () => ({
  get_device_wrap_key: vi.fn(async () => null),
  clear_device_wrap_key_cache: vi.fn(),
  delete_device_wrap_key: vi.fn(async () => undefined),
}));

const { secure_clear_local_storage } = await import("./secure_storage");
const { has_error_report_consent, has_declined_error_reports } =
  await import("@/services/error_report_consent");

const CHOICE_KEY = "aster_error_reports";

describe("error report choice at sign-out", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("removes a granted choice so the next account starts without one", () => {
    localStorage.setItem(CHOICE_KEY, "on");

    secure_clear_local_storage();

    expect(localStorage.getItem(CHOICE_KEY)).toBeNull();
    expect(has_error_report_consent()).toBe(false);
  });

  it("keeps a declined choice", () => {
    localStorage.setItem(CHOICE_KEY, "off");

    secure_clear_local_storage();

    expect(localStorage.getItem(CHOICE_KEY)).toBe("off");
    expect(has_declined_error_reports()).toBe(true);
    expect(has_error_report_consent()).toBe(false);
  });

  it("removes any other stored value", () => {
    localStorage.setItem(CHOICE_KEY, "true");

    secure_clear_local_storage();

    expect(localStorage.getItem(CHOICE_KEY)).toBeNull();
  });

  it("keeps device settings and the device sign-in records", () => {
    localStorage.setItem("astermail_theme", "dark");
    localStorage.setItem("aster:login_record_secret", "secret");
    localStorage.setItem("aster:login_v2_accounts", "[]");
    localStorage.setItem("aster_preferences_cache", "{}");

    secure_clear_local_storage();

    expect(localStorage.getItem("astermail_theme")).toBe("dark");
    expect(localStorage.getItem("aster:login_record_secret")).toBe("secret");
    expect(localStorage.getItem("aster:login_v2_accounts")).toBe("[]");
    expect(localStorage.getItem("aster_preferences_cache")).toBeNull();
  });
});
