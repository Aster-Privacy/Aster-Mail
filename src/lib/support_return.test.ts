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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SUPPORT = "https://support.astermail.org";

const load = async () => {
  vi.resetModules();

  return import("./support_return");
};

const set_location = (url: string) => {
  window.history.replaceState({}, "", url);
};

describe("support return", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_SUPPORT_SITE_ORIGINS", SUPPORT);
    vi.stubEnv("VITE_ACCOUNT_LINK_ORIGINS", "https://link.example");
    window.sessionStorage.clear();
    set_location("/sign-in");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts a page on an allowed support origin", async () => {
    const { safe_support_return } = await load();

    expect(safe_support_return(`${SUPPORT}/requests/AB12?x=1#reply`)).toBe(
      `${SUPPORT}/requests/AB12?x=1#reply`,
    );
  });

  it("never treats an account link origin as a return target", async () => {
    const { safe_support_return } = await load();

    expect(safe_support_return("https://link.example/requests")).toBeNull();
  });

  it("rejects other origins and unsafe forms", async () => {
    const { safe_support_return } = await load();

    for (const raw of [
      "https://evil.example/requests",
      "https://support.astermail.org.evil.example/",
      "https://user:pass@support.astermail.org/",
      "javascript:alert(1)",
      "//support.astermail.org/requests",
      "/requests",
      "http://support.astermail.org/requests",
      `${SUPPORT}/${"a".repeat(3000)}`,
      "",
      null,
    ]) {
      expect(safe_support_return(raw)).toBeNull();
    }
  });

  it("captures a valid return and hands it back once", async () => {
    const { capture_support_return, take_support_return } = await load();

    set_location(
      `/sign-in?return_to=${encodeURIComponent(`${SUPPORT}/requests`)}`,
    );
    capture_support_return();

    expect(take_support_return()).toBe(`${SUPPORT}/requests`);
    expect(take_support_return()).toBeNull();
  });

  it("ignores an invalid return and clears an older one", async () => {
    const { capture_support_return, take_support_return } = await load();

    set_location(
      `/sign-in?return_to=${encodeURIComponent(`${SUPPORT}/requests`)}`,
    );
    capture_support_return();
    set_location(
      `/sign-in?return_to=${encodeURIComponent("https://evil.example/")}`,
    );
    capture_support_return();

    expect(take_support_return()).toBeNull();
  });

  it("drops a stored return after it expires", async () => {
    const { capture_support_return, take_support_return } = await load();
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);

    set_location(
      `/sign-in?return_to=${encodeURIComponent(`${SUPPORT}/requests`)}`,
    );
    capture_support_return();
    clock.mockReturnValue(now + 16 * 60 * 1000);

    expect(take_support_return()).toBeNull();
    clock.mockRestore();
  });
});
