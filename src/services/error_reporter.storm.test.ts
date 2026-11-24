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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const routing = vi.hoisted(() => ({
  status: 204,
  retry_after: null as string | null,
  fetch: vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(),
}));

vi.mock("@/services/api/base_url", () => ({
  get_api_base_url: () => "https://app.astermail.org/api",
}));

vi.mock("@/services/routing/routing_provider", () => ({
  get_effective_base_url: (default_base: string) => default_base,
  routed_fetch: routing.fetch,
}));

type Reporter = typeof import("./error_reporter");

async function fresh_reporter(): Promise<Reporter> {
  vi.resetModules();
  const consent = await import("./error_report_consent");

  consent.set_error_report_choice(true);

  return import("./error_reporter");
}

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
  }
}

const TRANSPORT_FEATURES = [
  "mail_messages_stats",
  "mail_labels_counts",
  "addresses_aliases",
  "settings_preferences",
  "mail_labels",
  "mail_snooze",
  "mail_tags_counts",
  "contacts_count",
  "crypto_ratchet",
  "core_auth_me",
];

describe("error reports stay quiet under load", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-23T12:00:00Z"));
    window.sessionStorage.clear();
    routing.status = 204;
    routing.retry_after = null;
    routing.fetch.mockReset();
    routing.fetch.mockImplementation(async () => {
      const headers = new Headers();

      if (routing.retry_after !== null) {
        headers.set("Retry-After", routing.retry_after);
      }

      return new Response(null, { status: routing.status, headers });
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends one report for a connection drop that fails every feature at once", async () => {
    const reporter = await fresh_reporter();

    for (const feature of TRANSPORT_FEATURES) {
      reporter.report_client_error({
        feature,
        error_code: `${feature}_network`,
        severity: "warn",
      });
      reporter.report_client_error({
        feature,
        error_code: `${feature}_timeout`,
        severity: "warn",
      });
    }

    expect(routing.fetch).toHaveBeenCalledTimes(2);
  });

  it("never reports a signed out session", async () => {
    const reporter = await fresh_reporter();

    reporter.report_client_error({
      feature: "core_auth_refresh",
      error_code: "core_auth_refresh_http_401",
      http_status: 401,
    });
    reporter.report_client_error({
      feature: "core_auth_refresh",
      error_code: "core_auth_refresh_http_500",
      http_status: 500,
    });

    expect(routing.fetch).toHaveBeenCalledTimes(1);
    expect(String(routing.fetch.mock.calls[0][1]?.body)).toContain(
      "core_auth_refresh_http_500",
    );
  });

  it("stops sending after a 429 until the retry window passes", async () => {
    const reporter = await fresh_reporter();

    routing.status = 429;
    routing.retry_after = "120";
    reporter.report_client_error({ feature: "first", error_code: "boom" });
    await settle();

    routing.status = 204;
    routing.retry_after = null;
    for (let i = 0; i < 20; i += 1) {
      reporter.report_client_error({
        feature: `held_${i}`,
        error_code: "boom",
      });
    }
    expect(routing.fetch).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + 119_000);
    reporter.report_client_error({ feature: "still_held", error_code: "boom" });
    expect(routing.fetch).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + 1_000);
    reporter.report_client_error({ feature: "after", error_code: "boom" });
    expect(routing.fetch).toHaveBeenCalledTimes(2);
  });

  it("keeps the pause and the budget across a reload", async () => {
    let reporter = await fresh_reporter();

    for (let i = 0; i < 60; i += 1) {
      vi.setSystemTime(Date.now() + 61_000);
      reporter.report_client_error({ feature: "loop", error_code: "boom" });
    }
    expect(routing.fetch).toHaveBeenCalledTimes(40);

    reporter = await fresh_reporter();
    reporter.report_client_error({
      feature: "after_reload",
      error_code: "boom",
    });
    expect(routing.fetch).toHaveBeenCalledTimes(40);

    window.sessionStorage.clear();
    reporter = await fresh_reporter();
    routing.status = 503;
    reporter.report_client_error({
      feature: "server_down",
      error_code: "boom",
    });
    await settle();
    reporter = await fresh_reporter();
    routing.status = 204;
    reporter.report_client_error({ feature: "after_503", error_code: "boom" });
    expect(routing.fetch).toHaveBeenCalledTimes(41);
  });

  it("works when session storage is unavailable", async () => {
    const reporter = await fresh_reporter();
    const get_item = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    const set_item = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });

    reporter.report_client_error({ feature: "no_storage", error_code: "boom" });
    expect(routing.fetch).toHaveBeenCalledTimes(1);

    get_item.mockRestore();
    set_item.mockRestore();
  });

  it("clamps the pause between one and fifteen minutes", async () => {
    const reporter = await fresh_reporter();

    expect(reporter.report_pause_ms(null)).toBe(60_000);
    expect(reporter.report_pause_ms("abc")).toBe(60_000);
    expect(reporter.report_pause_ms("5")).toBe(60_000);
    expect(reporter.report_pause_ms("300")).toBe(300_000);
    expect(reporter.report_pause_ms("86400")).toBe(900_000);
  });

  it("keeps separate keys for distinct HTTP failures", async () => {
    const reporter = await fresh_reporter();

    expect(
      reporter.report_dedupe_key(
        "mail_labels_network",
        "mail_labels",
        undefined,
      ),
    ).toBe("transport|_network");
    expect(
      reporter.report_dedupe_key("mail_labels_http_500", "mail_labels", 500),
    ).toBe("mail_labels|mail_labels_http_500|500");
  });
});
