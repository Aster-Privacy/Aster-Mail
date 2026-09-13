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

async function load_helpers(platform_marker: string | null) {
  vi.resetModules();

  if (platform_marker) {
    (window as unknown as Record<string, unknown>)[platform_marker] = {};
  }

  return await import("./helpers");
}

describe("native clients declare their platform on auth requests", () => {
  beforeEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    vi.resetModules();
  });

  it("declares desktop when the app runs in the desktop shell", async () => {
    const { with_declared_platform } = await load_helpers(
      "__TAURI_INTERNALS__",
    );
    const body = with_declared_platform(
      "/core/v1/auth/login",
      JSON.stringify({ user_hash: "a" }),
    );

    expect(JSON.parse(body as string)).toEqual({
      user_hash: "a",
      client_platform: "desktop",
    });
  });

  it("declares desktop when registering so the captcha exemption applies", async () => {
    const { with_declared_platform } = await load_helpers(
      "__TAURI_INTERNALS__",
    );
    const body = with_declared_platform(
      "/core/v1/auth/register",
      JSON.stringify({ username: "a" }),
    );

    expect(JSON.parse(body as string).client_platform).toBe("desktop");
  });

  it("leaves the web untouched", async () => {
    const { with_declared_platform } = await load_helpers(null);
    const original = JSON.stringify({ user_hash: "a" });

    expect(with_declared_platform("/core/v1/auth/login", original)).toBe(
      original,
    );
  });

  it("keeps a platform the caller already declared", async () => {
    const { with_declared_platform } = await load_helpers(
      "__TAURI_INTERNALS__",
    );
    const original = JSON.stringify({ client_platform: "ios" });

    expect(with_declared_platform("/core/v1/auth/login", original)).toBe(
      original,
    );
  });

  it("ignores endpoints that only look like the login route", async () => {
    const { with_declared_platform } = await load_helpers(
      "__TAURI_INTERNALS__",
    );
    const original = JSON.stringify({ enabled: true });

    expect(with_declared_platform("/core/v1/auth/login-alerts", original)).toBe(
      original,
    );
  });

  it("passes a non-string body through", async () => {
    const { with_declared_platform } = await load_helpers(
      "__TAURI_INTERNALS__",
    );

    expect(with_declared_platform("/core/v1/auth/login", undefined)).toBe(
      undefined,
    );
  });
});
