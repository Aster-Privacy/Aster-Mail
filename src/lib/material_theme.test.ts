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
import { describe, expect, it } from "vitest";

import {
  CUSTOM_THEME_ROLE_KEYS,
  compute_custom_theme_vars,
  generate_material_theme,
} from "./material_theme";

const SEED = "#3b82f6";

describe("compute_custom_theme_vars", () => {
  it("keeps the stock palette when nothing is overridden", () => {
    expect(compute_custom_theme_vars(SEED, true, {})).toEqual(
      generate_material_theme(SEED, true),
    );
  });

  it("offers the sidebar as an editable role", () => {
    expect(CUSTOM_THEME_ROLE_KEYS).toContain("--sidebar-bg");
  });

  it("recolors the sidebar from the secondary background", () => {
    const vars = compute_custom_theme_vars(SEED, true, {
      "--bg-secondary": "#2a1050",
    });

    expect(vars["--sidebar-bg"]).toBe("#2a1050");
    expect(vars["--sidebar"]).toBe("#2a1050");
    expect(vars["--background"]).toBe("#2a1050");
    expect(vars["--sidebar-hover"]).not.toBe("#0f0f0f");
  });

  it("lets the sidebar override win over the secondary background", () => {
    const vars = compute_custom_theme_vars(SEED, true, {
      "--bg-secondary": "#2a1050",
      "--sidebar-bg": "#103050",
    });

    expect(vars["--sidebar-bg"]).toBe("#103050");
    expect(vars["--sidebar"]).toBe("#103050");
    expect(vars["--bg-secondary"]).toBe("#2a1050");
  });

  it("derives every surface from an overridden background", () => {
    const base = generate_material_theme(SEED, true);
    const vars = compute_custom_theme_vars(SEED, true, {
      "--bg-primary": "#3b1a6e",
    });

    for (const key of [
      "--bg-card",
      "--indicator-bg",
      "--modal-bg",
      "--dropdown-bg",
      "--thread-content-bg",
      "--card",
      "--popover",
    ] as const) {
      expect(vars[key]).toBe("#3b1a6e");
    }

    for (const key of [
      "--bg-tertiary",
      "--bg-hover",
      "--bg-selected",
      "--input-bg",
      "--dropdown-hover",
      "--thread-card-bg",
      "--thread-header-bg",
    ] as const) {
      expect(vars[key]).not.toBe(base[key]);
    }
  });

  it("ignores invalid and unknown overrides", () => {
    const base = generate_material_theme(SEED, true);
    const vars = compute_custom_theme_vars(SEED, true, {
      "--bg-primary": "purple",
      "--not-a-var": "#ffffff",
    } as Record<string, string>);

    expect(vars).toEqual(base);
  });
});
