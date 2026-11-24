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
import { describe, it, expect, vi, beforeEach } from "vitest";

const native_state = { native: false };
const open_external_mock = vi.fn();

vi.mock("@/services/api/base_url", () => ({
  is_native_app: () => native_state.native,
  get_api_base_url: () =>
    native_state.native ? "https://app.astermail.org/api" : "/api",
}));

vi.mock("@/utils/open_link", () => ({
  open_external: (url: string) => open_external_mock(url),
}));

import { bridge_download_url, open_bridge_download } from "./bridge_download";

describe("bridge download", () => {
  beforeEach(() => {
    open_external_mock.mockReset();
  });

  it("uses a relative url on the web", () => {
    native_state.native = false;
    expect(bridge_download_url("macos-dmg")).toBe(
      "/api/bridge/v1/download/macos-dmg",
    );
  });

  it("uses an absolute url in the desktop app", () => {
    native_state.native = true;
    expect(bridge_download_url("macos-dmg")).toBe(
      "https://app.astermail.org/api/bridge/v1/download/macos-dmg",
    );
  });

  it("opens the download in the system browser in the desktop app", () => {
    native_state.native = true;
    const url = bridge_download_url("macos-dmg");

    open_bridge_download(url);
    expect(open_external_mock).toHaveBeenCalledWith(url);
  });
});
