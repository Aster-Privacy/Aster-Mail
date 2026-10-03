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

const routing = vi.hoisted(() => ({
  base: (default_base: string) => default_base,
  fetch: vi.fn(async () => new Response(null, { status: 204 })),
}));

vi.mock("@/services/api/base_url", () => ({
  get_api_base_url: () => "https://app.astermail.org/api",
}));

vi.mock("@/services/routing/routing_provider", () => ({
  get_effective_base_url: (default_base: string) => routing.base(default_base),
  routed_fetch: routing.fetch,
}));

import { report_client_error } from "./error_reporter";

describe("error reports follow the chosen connection", () => {
  const direct_fetch = vi.fn(async () => new Response(null, { status: 204 }));

  beforeEach(() => {
    routing.fetch.mockClear();
    direct_fetch.mockClear();
    vi.stubGlobal("fetch", direct_fetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends through the relay when one is configured", () => {
    routing.base = () => "https://relay.example/api";

    report_client_error({ feature: "relay_case", error_code: "boom" });

    expect(routing.fetch).toHaveBeenCalledTimes(1);
    expect(routing.fetch.mock.calls[0][0]).toBe(
      "https://relay.example/api/core/v1/client-errors",
    );
    expect(direct_fetch).not.toHaveBeenCalled();
  });

  it("sends nothing when the private route is not ready", () => {
    routing.base = () => {
      throw new Error("tor_not_running");
    };

    report_client_error({ feature: "tor_case", error_code: "boom" });

    expect(routing.fetch).not.toHaveBeenCalled();
    expect(direct_fetch).not.toHaveBeenCalled();
  });
});
