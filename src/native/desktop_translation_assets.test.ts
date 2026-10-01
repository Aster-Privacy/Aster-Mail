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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invoke_mock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke_mock(...args),
}));

const { fetch_translation_asset, uses_native_translation_assets } =
  await import("./desktop_translation_assets");
const { asset_name, load_registry } =
  await import("@/services/translation/model_source");

function set_tauri(enabled: boolean) {
  const target = window as unknown as Record<string, unknown>;

  if (enabled) target.__TAURI_INTERNALS__ = {};
  else delete target.__TAURI_INTERNALS__;
}

describe("desktop translation assets", () => {
  beforeEach(() => {
    invoke_mock.mockReset();
  });

  afterEach(() => {
    set_tauri(false);
  });

  it("detects the desktop app", () => {
    expect(uses_native_translation_assets()).toBe(false);
    set_tauri(true);
    expect(uses_native_translation_assets()).toBe(true);
  });

  it("returns an array buffer for every binary payload shape", async () => {
    const bytes = Uint8Array.from([1, 2, 3, 4]);

    invoke_mock.mockResolvedValueOnce(bytes.buffer);
    expect(
      Array.from(new Uint8Array(await fetch_translation_asset("a.bin"))),
    ).toEqual([1, 2, 3, 4]);

    invoke_mock.mockResolvedValueOnce(bytes.subarray(1, 3));
    expect(
      Array.from(new Uint8Array(await fetch_translation_asset("a.bin"))),
    ).toEqual([2, 3]);

    invoke_mock.mockResolvedValueOnce([5, 6]);
    expect(
      Array.from(new Uint8Array(await fetch_translation_asset("a.bin"))),
    ).toEqual([5, 6]);

    expect(invoke_mock).toHaveBeenCalledWith("fetch_translation_asset", {
      name: "a.bin",
    });
  });

  it("rejects a payload that is not binary", async () => {
    invoke_mock.mockResolvedValueOnce("nope");

    await expect(fetch_translation_asset("a.bin")).rejects.toThrow(
      "translation asset payload is not binary",
    );
  });

  it("maps a model url back to its asset name", () => {
    const base = "/bergamot/models/v1";
    const origin = window.location.origin;

    expect(
      asset_name(`${origin}/bergamot/models/v1/esen/model.bin?r=3`, base),
    ).toBe("esen/model.bin");
    expect(asset_name(`${origin}/other/esen/model.bin`, base)).toBeNull();
    expect(asset_name(`${origin}/bergamot/models/v1/`, base)).toBeNull();
  });

  it("loads the registry through the native client in the desktop app", async () => {
    const registry = {
      esen: {
        model: {
          name: "esen/model.esen.intgemm.alphas.bin",
          size: 10,
          expectedSha256Hash: "00",
        },
      },
    };
    const fetch_spy = vi.spyOn(globalThis, "fetch");

    set_tauri(true);
    invoke_mock.mockResolvedValueOnce(
      new TextEncoder().encode(JSON.stringify(registry)).buffer,
    );

    const loaded = await load_registry();

    expect(invoke_mock).toHaveBeenCalledWith("fetch_translation_asset", {
      name: "registry.json",
    });
    expect(fetch_spy).not.toHaveBeenCalled();
    expect(loaded.esen.model.name).toBe("esen/model.esen.intgemm.alphas.bin");
    fetch_spy.mockRestore();
  });
});
