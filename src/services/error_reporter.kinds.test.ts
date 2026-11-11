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
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

const routing = vi.hoisted(() => ({
  fetch: vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
    async () => new Response(null, { status: 204 }),
  ),
}));

vi.mock("@/services/api/base_url", () => ({
  get_api_base_url: () => "https://app.astermail.org/api",
}));

vi.mock("@/services/routing/routing_provider", () => ({
  get_effective_base_url: (default_base: string) => default_base,
  routed_fetch: routing.fetch,
}));

import { error_kind, install_global_error_reporting } from "./error_reporter";
import { set_error_report_choice } from "./error_report_consent";

function sent_reports(): Record<string, unknown>[] {
  return routing.fetch.mock.calls.map(
    ([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>,
  );
}

function dom_error(name: string): Error {
  const error = new Error("detail");

  error.name = name;

  return error;
}

describe("error kinds", () => {
  it("names standard errors without sending their message", () => {
    expect(error_kind(new TypeError("x.y is undefined"))).toBe("type_error");
    expect(error_kind(new RangeError("bad"))).toBe("range_error");
    expect(error_kind(dom_error("AbortError"))).toBe("abort");
    expect(error_kind(dom_error("QuotaExceededError"))).toBe("quota");
  });

  it("recognizes failed fetches and chunk loads", () => {
    expect(error_kind(new TypeError("Failed to fetch"))).toBe("fetch_failed");
    expect(error_kind(new TypeError("Load failed"))).toBe("fetch_failed");
    expect(
      error_kind(
        new TypeError("NetworkError when attempting to fetch resource."),
      ),
    ).toBe("fetch_failed");
    expect(
      error_kind(
        new TypeError(
          "Failed to fetch dynamically imported module: https://app.astermail.org/assets/a.js",
        ),
      ),
    ).toBe("chunk_load");
  });

  it("separates values that are not errors", () => {
    expect(error_kind(undefined)).toBe("empty");
    expect(error_kind(null)).toBe("empty");
    expect(error_kind("boom")).toBe("non_error");
    expect(error_kind({ code: 1 })).toBe("non_error");
    expect(error_kind(dom_error("CustomThing"))).toBe("error");
  });

  it("survives a reason that throws when read", () => {
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error("no");
        },
      },
    );

    expect(error_kind(hostile)).toBe("other");
  });
});

describe("global error reporting", () => {
  beforeAll(() => {
    install_global_error_reporting();
  });

  beforeEach(() => {
    routing.fetch.mockClear();
    set_error_report_choice(true);
  });

  it("reports an unhandled rejection with its kind", () => {
    const event = new Event("unhandledrejection") as Event & {
      reason?: unknown;
    };

    event.reason = new TypeError("x is not a function");
    window.dispatchEvent(event);

    expect(sent_reports()).toEqual([
      expect.objectContaining({
        feature: "app",
        error_code: "unhandled_rejection_type_error",
        severity: "error",
      }),
    ]);
  });

  it("reports an aborted request as a warning", () => {
    const event = new Event("unhandledrejection") as Event & {
      reason?: unknown;
    };

    event.reason = dom_error("AbortError");
    window.dispatchEvent(event);

    expect(sent_reports()).toEqual([
      expect.objectContaining({
        error_code: "unhandled_rejection_abort",
        severity: "warn",
      }),
    ]);
  });

  it("reports a cross-origin script error as a warning", () => {
    window.dispatchEvent(
      new ErrorEvent("error", { message: "Script error.", error: null }),
    );

    expect(sent_reports()).toEqual([
      expect.objectContaining({
        error_code: "uncaught_exception_cross_origin",
        severity: "warn",
      }),
    ]);
  });

  it("reports an uncaught exception from our code as an error", () => {
    window.dispatchEvent(
      new ErrorEvent("error", {
        message: "boom",
        error: new ReferenceError("boom"),
      }),
    );

    expect(sent_reports()).toEqual([
      expect.objectContaining({
        error_code: "uncaught_exception_reference_error",
        severity: "error",
      }),
    ]);
  });

  it("never sends the error message", () => {
    window.dispatchEvent(
      new ErrorEvent("error", {
        message: "secret detail",
        error: new SyntaxError("secret detail"),
      }),
    );

    const body = String(routing.fetch.mock.calls[0]?.[1]?.body);

    expect(body).not.toContain("secret");
  });
});
