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

vi.mock("./tor_transport", () => ({
  tor_start: vi.fn(async () => undefined),
  is_tor_connected: () => false,
  is_tor_supported: () => false,
  is_snowflake_supported: () => false,
  is_cdn_relay_supported: () => true,
}));

vi.mock("@/services/api/client", () => ({
  api_client: { get: vi.fn(async () => ({ data: null })) },
}));

import { connection_store } from "./connection_store";

const STORAGE_KEY = "aster_connection_method";

describe("unsupported connection method fallback", () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    connection_store.take_unsupported_method_fallback();
  });

  afterEach(() => {
    localStorage.removeItem(STORAGE_KEY);
  });

  it("falls back to direct and remembers that Tor was dropped", async () => {
    localStorage.setItem(STORAGE_KEY, "tor");

    await connection_store.initialize();

    expect(connection_store.get_method()).toBe("direct");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("direct");
    expect(connection_store.take_unsupported_method_fallback()).toBe("tor");
  });

  it("reports the fallback only once", async () => {
    localStorage.setItem(STORAGE_KEY, "tor_snowflake");

    await connection_store.initialize();

    expect(connection_store.take_unsupported_method_fallback()).toBe(
      "tor_snowflake",
    );
    expect(connection_store.take_unsupported_method_fallback()).toBeNull();
  });

  it("does not report again on the next launch", async () => {
    localStorage.setItem(STORAGE_KEY, "tor");

    await connection_store.initialize();
    connection_store.take_unsupported_method_fallback();
    await connection_store.initialize();

    expect(connection_store.get_method()).toBe("direct");
    expect(connection_store.take_unsupported_method_fallback()).toBeNull();
  });

  it("reports nothing for a supported method", async () => {
    localStorage.setItem(STORAGE_KEY, "cdn_relay");

    await connection_store.initialize();

    expect(connection_store.get_method()).toBe("cdn_relay");
    expect(connection_store.take_unsupported_method_fallback()).toBeNull();
  });

  it("reports nothing when no method was saved", async () => {
    await connection_store.initialize();

    expect(connection_store.get_method()).toBe("direct");
    expect(connection_store.take_unsupported_method_fallback()).toBeNull();
  });
});
