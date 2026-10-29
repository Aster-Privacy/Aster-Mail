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
import { afterEach, describe, expect, it } from "vitest";

import {
  PUBLIC_WEB_APP_ORIGIN,
  public_web_origin,
  public_web_url,
} from "./public_origin";

import { build_referral_invite_url } from "@/services/api/billing";

const tauri_window = window as unknown as Record<string, unknown>;

function enter_desktop_shell(): void {
  tauri_window.__TAURI_INTERNALS__ = {};
}

afterEach(() => {
  delete tauri_window.__TAURI_INTERNALS__;
});

describe("public_web_origin", () => {
  it("uses the page origin in a browser", () => {
    expect(public_web_origin()).toBe(window.location.origin);
  });

  it("uses the public web app origin inside the desktop app", () => {
    enter_desktop_shell();

    expect(public_web_origin()).toBe(PUBLIC_WEB_APP_ORIGIN);
  });
});

describe("public_web_url", () => {
  it("resolves a relative path against the public origin on desktop", () => {
    enter_desktop_shell();

    expect(public_web_url("/settings/billing?tab=referrals#top")).toBe(
      "https://app.astermail.org/settings/billing?tab=referrals#top",
    );
  });

  it("rewrites the desktop shell origin to the public origin", () => {
    enter_desktop_shell();

    expect(public_web_url("http://tauri.localhost/invite/ABC123")).toBe(
      "https://app.astermail.org/invite/ABC123",
    );
    expect(public_web_url(`${window.location.origin}/inbox`)).toBe(
      "https://app.astermail.org/inbox",
    );
  });

  it("keeps outside links and mailto links unchanged on desktop", () => {
    enter_desktop_shell();

    expect(public_web_url("https://example.com/a?b=1")).toBe(
      "https://example.com/a?b=1",
    );
    expect(public_web_url("mailto:someone@example.com")).toBe(
      "mailto:someone@example.com",
    );
  });

  it("leaves browser urls on the page origin", () => {
    expect(public_web_url("/invite/ABC123")).toBe(
      `${window.location.origin}/invite/ABC123`,
    );
  });
});

describe("build_referral_invite_url", () => {
  it("never points at the desktop shell origin", () => {
    enter_desktop_shell();

    expect(build_referral_invite_url("ABC123")).toBe(
      "https://app.astermail.org/invite/ABC123",
    );
  });
});
