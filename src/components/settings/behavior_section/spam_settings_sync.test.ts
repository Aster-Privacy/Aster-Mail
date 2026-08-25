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

import { describe, expect, it, vi } from "vitest";

import { apply_spam_settings_patch } from "./spam_settings_sync";

const DEFAULTS = {
  spam_retention_days: 30,
  spam_sensitivity: "medium",
  spam_filter_enabled: true,
};

const SAVED = {
  spam_retention_days: 7,
  spam_sensitivity: "high",
  spam_filter_enabled: true,
};

describe("apply_spam_settings_patch", () => {
  it("never writes hardcoded defaults over saved settings when the load failed", async () => {
    const save = vi.fn(async () => ({ data: { success: true } }));
    const load = vi.fn(async () => ({ data: SAVED }));

    const result = await apply_spam_settings_patch({
      loaded: false,
      current: DEFAULTS,
      patch: { spam_filter_enabled: false },
      load,
      save,
    });

    expect(load).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({
      spam_retention_days: 7,
      spam_sensitivity: "high",
      spam_filter_enabled: false,
    });
    expect(result.next.spam_retention_days).toBe(7);
    expect(result.loaded).toBe(true);
  });

  it("refuses to save anything when the settings are still unknown", async () => {
    const save = vi.fn(async () => ({ data: { success: true } }));

    const result = await apply_spam_settings_patch({
      loaded: false,
      current: DEFAULTS,
      patch: { spam_sensitivity: "low" },
      load: async () => ({ data: null }),
      save,
    });

    expect(save).not.toHaveBeenCalled();
    expect(result.saved).toBe(false);
    expect(result.loaded).toBe(false);
    expect(result.next).toEqual(DEFAULTS);
  });

  it("treats a thrown load as unknown rather than as defaults", async () => {
    const save = vi.fn(async () => ({ data: { success: true } }));

    const result = await apply_spam_settings_patch({
      loaded: false,
      current: DEFAULTS,
      patch: { spam_retention_days: 0 },
      load: async () => {
        throw new Error("offline");
      },
      save,
    });

    expect(save).not.toHaveBeenCalled();
    expect(result.saved).toBe(false);
  });

  it("saves directly once the settings have loaded", async () => {
    const save = vi.fn(async () => ({ data: { success: true } }));
    const load = vi.fn(async () => ({ data: SAVED }));

    const result = await apply_spam_settings_patch({
      loaded: true,
      current: SAVED,
      patch: { spam_sensitivity: "low" },
      load,
      save,
    });

    expect(load).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledWith({
      spam_retention_days: 7,
      spam_sensitivity: "low",
      spam_filter_enabled: true,
    });
    expect(result.saved).toBe(true);
  });
  it("reverts to the last known settings when the save fails", async () => {
    const save = vi.fn(async () => ({ data: { success: false } }));

    const result = await apply_spam_settings_patch({
      loaded: true,
      current: SAVED,
      patch: { spam_filter_enabled: false },
      load: async () => ({ data: SAVED }),
      save,
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(result.saved).toBe(false);
    expect(result.next).toEqual(SAVED);
  });

  it("reverts to the freshly loaded settings when the save throws", async () => {
    const save = vi.fn(async () => {
      throw new Error("offline");
    });

    const result = await apply_spam_settings_patch({
      loaded: false,
      current: DEFAULTS,
      patch: { spam_sensitivity: "low" },
      load: async () => ({ data: SAVED }),
      save,
    });

    expect(result.saved).toBe(false);
    expect(result.next).toEqual(SAVED);
  });
});
