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

const { get_relay_mock, fetch_info_mock } = vi.hoisted(() => ({
  get_relay_mock: vi.fn(),
  fetch_info_mock: vi.fn(),
}));

vi.mock("./connection_store", () => ({
  connection_store: {
    get_cdn_relay_url: get_relay_mock,
    fetch_connection_info: fetch_info_mock,
  },
}));

vi.mock("./tauri_proxy_transport", () => ({
  is_tauri_env: () => false,
  tauri_proxy_fetch: vi.fn(),
}));

import { cdn_relay_fetch } from "./cdn_relay_transport";

describe("cdn_relay_fetch", () => {
  const relay = "https://relay.astermail.org";
  let fetch_spy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    get_relay_mock.mockReset();
    fetch_info_mock.mockReset();
    fetch_spy = vi.fn(async (u: string) => new Response(u, { status: 200 }));
    vi.stubGlobal("fetch", fetch_spy);
  });

  it("bootstraps the relay url via connection-info when missing, then relays", async () => {
    get_relay_mock.mockReturnValueOnce(null).mockReturnValue(relay);
    fetch_info_mock.mockResolvedValue(undefined);

    await cdn_relay_fetch(
      "https://app.astermail.org/api/core/v1/auth/device/code",
      { method: "POST" },
    );

    expect(fetch_info_mock).toHaveBeenCalledTimes(1);
    expect(fetch_spy).toHaveBeenCalledWith(
      "https://relay.astermail.org/api/core/v1/auth/device/code",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("relays directly without bootstrap when the relay url is already known", async () => {
    get_relay_mock.mockReturnValue(relay);

    await cdn_relay_fetch(
      "https://app.astermail.org/api/core/v1/auth/device/code",
      {},
    );

    expect(fetch_info_mock).not.toHaveBeenCalled();
    expect(fetch_spy).toHaveBeenCalledWith(
      "https://relay.astermail.org/api/core/v1/auth/device/code",
      expect.anything(),
    );
  });

  it("fails closed when the relay url stays unavailable after bootstrap", async () => {
    get_relay_mock.mockReturnValue(null);
    fetch_info_mock.mockResolvedValue(undefined);

    await expect(
      cdn_relay_fetch(
        "https://app.astermail.org/api/core/v1/auth/device/code",
        {},
      ),
    ).rejects.toThrow(/refusing to send request over clearnet/);
    expect(fetch_spy).not.toHaveBeenCalled();
  });

  it("lets the connection-info request itself reach the origin directly", async () => {
    get_relay_mock.mockReturnValue(null);

    await cdn_relay_fetch(
      "https://app.astermail.org/api/core/v1/connection-info",
      {},
    );

    expect(fetch_info_mock).not.toHaveBeenCalled();
    expect(fetch_spy).toHaveBeenCalledWith(
      "https://app.astermail.org/api/core/v1/connection-info",
      expect.anything(),
    );
  });
});
