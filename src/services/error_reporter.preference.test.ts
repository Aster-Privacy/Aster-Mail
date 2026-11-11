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
import {
  apply_loaded_error_report_preference,
  ERROR_REPORT_CONSENT_KEY,
  forget_error_report_grant,
  set_error_report_choice,
} from "./error_report_consent";

import {
  cache_preferences_locally,
  clear_preferences_cache,
  DEFAULT_PREFERENCES,
} from "@/services/api/preferences";

const PREFS_CACHE_KEY = "aster_preferences_cache";

let case_index = 0;

function next_feature(): string {
  case_index += 1;

  return `pref_case_${case_index}`;
}

describe("error reports respect the user's choice", () => {
  const direct_fetch = vi.fn(async () => new Response(null, { status: 204 }));

  beforeEach(() => {
    forget_error_report_grant();
    state.lockdown = false;
    state.onion = false;
    state.fetch.mockClear();
    direct_fetch.mockClear();
    localStorage.removeItem(PREFS_CACHE_KEY);
    localStorage.removeItem(ERROR_REPORT_CONSENT_KEY);
    vi.stubGlobal("fetch", direct_fetch);
  });

  afterEach(() => {
    localStorage.removeItem(PREFS_CACHE_KEY);
    localStorage.removeItem(ERROR_REPORT_CONSENT_KEY);
    vi.unstubAllGlobals();
  });

  it("sends nothing when no choice has been loaded", () => {
    expect(is_error_reporting_allowed()).toBe(false);

    report_client_error({ feature: next_feature(), error_code: "boom" });

    expect(state.fetch).not.toHaveBeenCalled();
    expect(direct_fetch).not.toHaveBeenCalled();
  });

  it("sends nothing from a cached preference blob alone", () => {
    localStorage.setItem(
      PREFS_CACHE_KEY,
      JSON.stringify({ send_error_reports: true }),
    );

    report_client_error({ feature: next_feature(), error_code: "boom" });

    expect(state.fetch).not.toHaveBeenCalled();
  });

  it("sends a report once loaded preferences have the setting on", () => {
    cache_preferences_locally({
      ...DEFAULT_PREFERENCES,
      send_error_reports: true,
    });

    expect(is_error_reporting_allowed()).toBe(true);

    report_client_error({ feature: next_feature(), error_code: "boom" });

    expect(state.fetch).toHaveBeenCalledTimes(1);
  });

  it("sends nothing when loaded preferences have the setting off", () => {
    cache_preferences_locally({
      ...DEFAULT_PREFERENCES,
      send_error_reports: false,
    });

    expect(is_error_reporting_allowed()).toBe(false);

    report_client_error({ feature: next_feature(), error_code: "boom" });

    expect(state.fetch).not.toHaveBeenCalled();
    expect(direct_fetch).not.toHaveBeenCalled();
  });

  it("stops sending the moment the setting is turned off", () => {
    set_error_report_choice(true);
    report_client_error({ feature: next_feature(), error_code: "boom" });
    expect(state.fetch).toHaveBeenCalledTimes(1);

    set_error_report_choice(false);
    report_client_error({ feature: next_feature(), error_code: "boom" });

    expect(state.fetch).toHaveBeenCalledTimes(1);
  });

  it("cancels a report that is still in flight when the setting is turned off", () => {
    state.fetch.mockImplementationOnce(() => new Promise<Response>(() => {}));
    set_error_report_choice(true);
    report_client_error({ feature: next_feature(), error_code: "boom" });

    const signal = state.fetch.mock.calls[0][1]?.signal;

    expect(signal?.aborted).toBe(false);

    set_error_report_choice(false);

    expect(signal?.aborted).toBe(true);
  });

  it("sends nothing after sign-out clears the cached preferences", () => {
    cache_preferences_locally({
      ...DEFAULT_PREFERENCES,
      send_error_reports: true,
    });

    clear_preferences_cache();

    expect(is_error_reporting_allowed()).toBe(false);

    report_client_error({ feature: next_feature(), error_code: "boom" });

    expect(state.fetch).not.toHaveBeenCalled();
  });

  it("sends nothing after sign-out until preferences are loaded again", () => {
    set_error_report_choice(false);

    clear_preferences_cache();

    expect(localStorage.getItem(ERROR_REPORT_CONSENT_KEY)).toBe("off");
    expect(is_error_reporting_allowed()).toBe(false);

    report_client_error({ feature: next_feature(), error_code: "boom" });

    expect(state.fetch).not.toHaveBeenCalled();
  });

  it("follows the next account's setting after another account turned it off", () => {
    set_error_report_choice(false);
    clear_preferences_cache();

    cache_preferences_locally({
      ...DEFAULT_PREFERENCES,
      send_error_reports: true,
    });

    expect(is_error_reporting_allowed()).toBe(true);

    report_client_error({ feature: next_feature(), error_code: "boom" });

    expect(state.fetch).toHaveBeenCalledTimes(1);
  });

  it("follows the setting when it is turned on from another device", () => {
    cache_preferences_locally({
      ...DEFAULT_PREFERENCES,
      send_error_reports: false,
    });
    expect(is_error_reporting_allowed()).toBe(false);

    apply_loaded_error_report_preference(true);

    expect(is_error_reporting_allowed()).toBe(true);
  });

  it("follows a stored opt-out from an earlier visit once the setting loads on", () => {
    localStorage.setItem(ERROR_REPORT_CONSENT_KEY, "off");

    cache_preferences_locally({
      ...DEFAULT_PREFERENCES,
      send_error_reports: true,
    });

    expect(is_error_reporting_allowed()).toBe(true);
  });

  it("keeps a choice made here until loaded preferences agree with it", () => {
    set_error_report_choice(false);

    cache_preferences_locally({
      ...DEFAULT_PREFERENCES,
      send_error_reports: true,
    });

    expect(is_error_reporting_allowed()).toBe(false);

    report_client_error({ feature: next_feature(), error_code: "boom" });

    expect(state.fetch).not.toHaveBeenCalled();

    cache_preferences_locally({
      ...DEFAULT_PREFERENCES,
      send_error_reports: false,
    });
    expect(is_error_reporting_allowed()).toBe(false);

    cache_preferences_locally({
      ...DEFAULT_PREFERENCES,
      send_error_reports: true,
    });
    expect(is_error_reporting_allowed()).toBe(true);
  });

  it("sends again after the setting is turned back on by hand", () => {
    set_error_report_choice(false);
    set_error_report_choice(true);

    report_client_error({ feature: next_feature(), error_code: "boom" });

    expect(state.fetch).toHaveBeenCalledTimes(1);
  });

  it("stores only an on or off marker", () => {
    set_error_report_choice(true);
    expect(localStorage.getItem(ERROR_REPORT_CONSENT_KEY)).toBe("on");

    set_error_report_choice(false);
    expect(localStorage.getItem(ERROR_REPORT_CONSENT_KEY)).toBe("off");
  });

  it("sends nothing while lockdown mode is on", () => {
    set_error_report_choice(true);
    state.lockdown = true;

    report_client_error({ feature: next_feature(), error_code: "boom" });

    expect(state.fetch).not.toHaveBeenCalled();
    expect(direct_fetch).not.toHaveBeenCalled();
  });

  it("sends nothing on the onion site", () => {
    set_error_report_choice(true);
    state.onion = true;

    report_client_error({ feature: next_feature(), error_code: "boom" });

    expect(state.fetch).not.toHaveBeenCalled();
    expect(direct_fetch).not.toHaveBeenCalled();
  });

  it("sends nothing when the stored marker is unreadable", () => {
    localStorage.setItem(ERROR_REPORT_CONSENT_KEY, "{not json");

    report_client_error({ feature: next_feature(), error_code: "boom" });

    expect(state.fetch).not.toHaveBeenCalled();
  });

  it("sends only coarse, non-identifying fields", () => {
    set_error_report_choice(true);
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
