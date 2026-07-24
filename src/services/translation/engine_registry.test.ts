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
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  load_engine,
  register_engine,
  reset_engine_registry,
} from "./engine_registry";
import { EngineUnavailableError, type TranslationEngine } from "./engine_types";

function fake_engine(id: string): TranslationEngine {
  return {
    id,
    is_available: async () => true,
    requires_download: async () => 0,
    prepare: async () => {},
    translate: async (segments) => segments,
    release: () => {},
  };
}

afterEach(() => {
  reset_engine_registry();
});

describe("engine_registry", () => {
  it("rejects for an engine that was never registered", async () => {
    await expect(load_engine("bergamot")).rejects.toBeInstanceOf(
      EngineUnavailableError,
    );
  });

  it("loads a registered engine once and reuses it", async () => {
    const loader = vi.fn(async () => fake_engine("test"));

    register_engine("test", loader);

    const first = await load_engine("test");
    const second = await load_engine("test");

    expect(first).toBe(second);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("does not cache a failed load", async () => {
    let attempts = 0;
    const loader = vi.fn(async (): Promise<TranslationEngine> => {
      attempts += 1;

      if (attempts === 1) throw new Error("model missing");

      return fake_engine("test");
    });

    register_engine("test", loader);

    await expect(load_engine("test")).rejects.toThrow("model missing");
    await expect(load_engine("test")).resolves.toBeDefined();
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("releases loaded engines on reset", async () => {
    const engine = fake_engine("test");
    const release = vi.spyOn(engine, "release");

    register_engine("test", async () => engine);
    await load_engine("test");
    reset_engine_registry();
    await Promise.resolve();

    expect(release).toHaveBeenCalled();
  });
});
