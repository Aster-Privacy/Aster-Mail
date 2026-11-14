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

const invoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

const { tauri_proxy_fetch } = await import("./tauri_proxy_transport");

const URL_UNDER_TEST = "https://app.astermail.org/api/mail/v1/messages";

beforeEach(() => {
  invoke.mockReset();
  invoke.mockResolvedValue({ status: 200, body: "", headers: {} });
});

describe("tauri_proxy_fetch", () => {
  it("sends text bodies and every header the app sets", async () => {
    await tauri_proxy_fetch(URL_UNDER_TEST, {
      method: "POST",
      body: "{\"a\":1}",
      headers: {
        "Content-Type": "application/json",
        "X-Folder-Unlock": "unlock-token",
        "X-CSRF-Token": "csrf",
      },
    });

    const args = invoke.mock.calls[0][1] as {
      body: string;
      headers: Record<string, string>;
    };

    const sent = Object.fromEntries(
      Object.entries(args.headers).map(([k, v]) => [k.toLowerCase(), v]),
    );

    expect(args.body).toBe("{\"a\":1}");
    expect(sent["x-folder-unlock"]).toBe("unlock-token");
    expect(sent["x-csrf-token"]).toBe("csrf");
  });

  it("encodes form parameters as text", async () => {
    await tauri_proxy_fetch(URL_UNDER_TEST, {
      method: "POST",
      body: new URLSearchParams({ a: "1", b: "two" }),
    });

    expect((invoke.mock.calls[0][1] as { body: string }).body).toBe(
      "a=1&b=two",
    );
  });

  it.each([
    ["FormData", () => new FormData()],
    ["Blob", () => new Blob(["x"])],
    ["ArrayBuffer", () => new ArrayBuffer(4)],
    ["Uint8Array", () => new Uint8Array([1, 2, 3])],
  ])("refuses a %s body instead of sending it as text", async (_, make) => {
    await expect(
      tauri_proxy_fetch(URL_UNDER_TEST, {
        method: "POST",
        body: make() as BodyInit,
      }),
    ).rejects.toThrow(TypeError);
    expect(invoke).not.toHaveBeenCalled();
  });
});
