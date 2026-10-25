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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const state = vi.hoisted(() => ({
  lockdown: false,
  onion: false,
  fetch: vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
    async () => new Response(null, { status: 204 }),
  ),
}));

vi.mock("@/services/api/base_url", () => ({
  get_api_base_url: () => "https://app.astermail.org/api",
}));

vi.mock("@/services/routing/routing_provider", () => ({
  get_effective_base_url: (default_base: string) => default_base,
  routed_fetch: state.fetch,
}));

vi.mock("@/services/lockdown_store", () => ({
  is_any_lockdown_active: () => state.lockdown,
}));

vi.mock("@/lib/onion_host", () => ({
  is_onion_host: () => state.onion,
}));

import {
  is_error_reporting_allowed,
  report_client_error,
} from "./error_reporter";

const PREFS_CACHE_KEY = "aster_preferences_cache";

let case_index = 0;

function next_feature(): string {
  case_index += 1;

  return `pref_case_${case_index}`;
}

describe("error reports respect the user's choice", () => {
  const direct_fetch = vi.fn(async () => new Response(null, { status: 204 }));

  beforeEach(() => {
    state.lockdown = false;
    state.onion = false;
    state.fetch.mockClear();
    direct_fetch.mockClear();
    localStorage.removeItem(PREFS_CACHE_KEY);
    vi.stubGlobal("fetch", direct_fetch);
  });

  afterEach(() => {
    localStorage.removeItem(PREFS_CACHE_KEY);
    vi.unstubAllGlobals();
  });

  it("sends a report when no preference has been saved", () => {
    expect(is_error_reporting_allowed()).toBe(true);

    report_client_error({ feature: next_feature(), error_code: "boom" });

    expect(state.fetch).toHaveBeenCalledTimes(1);
  });

  it("sends a report when the preference is on", () => {
    localStorage.setItem(
      PREFS_CACHE_KEY,
      JSON.stringify({ send_error_reports: true }),
    );

    report_client_error({ feature: next_feature(), error_code: "boom" });

    expect(state.fetch).toHaveBeenCalledTimes(1);
  });

  it("sends a report when the cached preferences predate the setting", () => {
    localStorage.setItem(PREFS_CACHE_KEY, JSON.stringify({ theme: "dark" }));

    report_client_error({ feature: next_feature(), error_code: "boom" });

    expect(state.fetch).toHaveBeenCalledTimes(1);
  });

  it("sends nothing when the preference is off", () => {
    localStorage.setItem(
      PREFS_CACHE_KEY,
      JSON.stringify({ send_error_reports: false }),
    );

    expect(is_error_reporting_allowed()).toBe(false);

    report_client_error({ feature: next_feature(), error_code: "boom" });

    expect(state.fetch).not.toHaveBeenCalled();
    expect(direct_fetch).not.toHaveBeenCalled();
  });

  it("sends nothing while lockdown mode is on", () => {
    state.lockdown = true;

    report_client_error({ feature: next_feature(), error_code: "boom" });

    expect(state.fetch).not.toHaveBeenCalled();
    expect(direct_fetch).not.toHaveBeenCalled();
  });

  it("sends nothing on the onion site", () => {
    state.onion = true;

    report_client_error({ feature: next_feature(), error_code: "boom" });

    expect(state.fetch).not.toHaveBeenCalled();
    expect(direct_fetch).not.toHaveBeenCalled();
  });

  it("keeps sending when the cached preferences are unreadable", () => {
    localStorage.setItem(PREFS_CACHE_KEY, "{not json");

    report_client_error({ feature: next_feature(), error_code: "boom" });

    expect(state.fetch).toHaveBeenCalledTimes(1);
  });

  it("sends only coarse, non-identifying fields", () => {
    report_client_error({
      feature: next_feature(),
      error_code: "boom",
      http_status: 500,
    });

    const init = state.fetch.mock.calls[0][1];
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;

    expect(init?.credentials).toBe("omit");
    expect(Object.keys(body).sort()).toEqual(
      [
        "error_code",
        "feature",
        "http_status",
        "platform",
        "release",
        "route",
        "severity",
        "surface",
      ].sort(),
    );
  });
});
