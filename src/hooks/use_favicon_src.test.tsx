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
import { describe, it, expect, vi, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

const warm = new Map<string, string>([["warm.example", "blob:warm"]]);

vi.mock("@/services/routing/routing_provider", () => ({
  routed_fetch: vi.fn(),
}));

vi.mock("@/services/routing/connection_store", () => ({
  connection_store: { get_method: () => "direct" },
}));

vi.mock("@/services/lockdown_store", () => ({
  is_any_lockdown_active: () => false,
}));

vi.mock("@/lib/favicon_url", () => ({
  get_favicon_url: (domain: string) => `/api/images/v1/favicon/${domain}`,
  is_valid_favicon_domain: () => true,
}));

vi.mock("@/lib/favicon_cache_db", () => ({
  peek_favicon_object_url: (domain: string) => warm.get(domain) ?? null,
  get_favicon_object_url: (domain: string) =>
    Promise.resolve(warm.get(domain) ?? null),
  cache_favicon_blob: vi.fn(),
}));

const { use_favicon_src } = await import("./use_favicon_src");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let observed: string[] = [];

function Probe({ domain }: { domain: string }) {
  observed.push(use_favicon_src(domain));

  return null;
}

function render(domain: string) {
  act(() => {
    root!.render(createElement(Probe, { domain }));
  });
}

function mount(domain: string) {
  observed = [];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  render(domain);
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

describe("use_favicon_src", () => {
  it("starts from the cached blob url when one is already live", () => {
    mount("warm.example");

    expect(observed[0]).toBe("blob:warm");
    expect(observed).not.toContain("/api/images/v1/favicon/warm.example");
  });

  it("falls back to the api url for a cold domain", () => {
    mount("cold.example");

    expect(observed[0]).toBe("/api/images/v1/favicon/cold.example");
  });

  it("re-resolves synchronously when the domain changes", () => {
    mount("cold.example");
    render("warm.example");

    expect(observed[observed.length - 1]).toBe("blob:warm");
  });
});
