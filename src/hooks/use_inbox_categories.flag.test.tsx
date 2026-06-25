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
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement, act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";

const prefs_state = vi.hoisted(() => ({
  inbox_categories_enabled: true as boolean,
  has_loaded_from_server: false as boolean,
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({
    preferences: { inbox_categories_enabled: prefs_state.inbox_categories_enabled },
    has_loaded_from_server: prefs_state.has_loaded_from_server,
  }),
}));

vi.mock("@/services/mail_categorizer", () => ({
  CATEGORY_TABS: ["primary", "promotions", "social", "updates"],
}));

vi.mock("@/services/category_index", () => ({
  get_counts: () => ({}),
  mark_category_seen: vi.fn(),
  subscribe: () => () => {},
  get_version: () => 0,
}));

vi.mock("@/services/crypto/secure_storage", () => ({
  secure_store: vi.fn(async () => {}),
  secure_retrieve: vi.fn(async () => null),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  on_keys_ready: () => () => {},
}));

import { use_inbox_categories } from "@/hooks/use_inbox_categories";

const FLAG_KEY = "astermail_inbox_categories_enabled";

let container: HTMLDivElement;
let root: Root;
let last_enabled = false;

function Probe() {
  const { enabled } = use_inbox_categories("inbox");
  useEffect(() => {
    last_enabled = enabled;
  });
  last_enabled = enabled;
  return null;
}

function render() {
  act(() => {
    root.render(createElement(Probe));
  });
}

describe("use_inbox_categories cold-cache flag guard", () => {
  beforeEach(() => {
    localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    prefs_state.inbox_categories_enabled = true;
    prefs_state.has_loaded_from_server = false;
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("does not flash categories on when the local flag says disabled and server has not loaded", () => {
    localStorage.setItem(FLAG_KEY, "0");
    prefs_state.inbox_categories_enabled = true;
    prefs_state.has_loaded_from_server = false;

    render();

    expect(last_enabled).toBe(false);
  });

  it("respects a server-loaded re-enable even if the stale flag says disabled", () => {
    localStorage.setItem(FLAG_KEY, "0");
    prefs_state.inbox_categories_enabled = true;
    prefs_state.has_loaded_from_server = true;

    render();

    expect(last_enabled).toBe(true);
  });

  it("keeps categories on by default when no flag is set", () => {
    prefs_state.inbox_categories_enabled = true;
    prefs_state.has_loaded_from_server = false;

    render();

    expect(last_enabled).toBe(true);
  });

  it("persists the disabled choice to the local flag for the next cold load", () => {
    prefs_state.inbox_categories_enabled = false;
    prefs_state.has_loaded_from_server = true;

    render();

    expect(localStorage.getItem(FLAG_KEY)).toBe("0");
  });
});
