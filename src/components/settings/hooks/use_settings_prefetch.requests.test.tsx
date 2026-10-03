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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/services/crypto/memory_key_store", async (import_original) => {
  const actual =
    await import_original<
      typeof import("@/services/crypto/memory_key_store")
    >();

  return { ...actual, get_vault_from_memory: () => ({}) };
});

import { use_settings_prefetch } from "./use_settings_prefetch";

import { SettingsCacheProvider } from "@/contexts/settings_cache_context";
import { api_client } from "@/services/api/client";
import { request_cache } from "@/services/api/request_cache";
import { list_blocked_senders } from "@/services/api/blocked_senders";
import { list_forwarding_rules } from "@/services/api/auto_forward";
import { list_sessions } from "@/services/api/sessions";

type RequestFn = (endpoint: string, config?: unknown) => Promise<unknown>;

let container: HTMLDivElement;
let root: Root;
let request_spy: ReturnType<typeof vi.spyOn>;
let run_prefetch: ((force: boolean) => Promise<void>) | null = null;

function Probe() {
  run_prefetch = use_settings_prefetch(false).run_prefetch;

  return null;
}

function requested_endpoints(): string[] {
  return request_spy.mock.calls.map((call: unknown[]) => String(call[0]));
}

async function open_settings() {
  await act(async () => {
    root.render(
      <SettingsCacheProvider>
        <Probe />
      </SettingsCacheProvider>,
    );
  });
  await act(async () => {
    await run_prefetch?.(false);
  });
}

beforeEach(() => {
  request_cache.clear();
  request_spy = vi
    .spyOn(api_client as unknown as { request: RequestFn }, "request")
    .mockResolvedValue({ error: "offline" });
  vi.spyOn(console, "error").mockImplementation(() => {});
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  run_prefetch = null;
  request_cache.clear();
  vi.restoreAllMocks();
});

describe("use_settings_prefetch request count", () => {
  it("only requests panels whose result Settings can reuse", async () => {
    await open_settings();

    const endpoints = requested_endpoints();

    expect(endpoints).not.toContain("/addresses/v1/aliases");
    expect(
      endpoints.filter((endpoint) =>
        endpoint.startsWith("/mail/v1/subscriptions"),
      ),
    ).toEqual([]);
    expect(endpoints).toHaveLength(15);
  });

  it("still warms the request cache for sections opened right after Settings", async () => {
    request_spy.mockResolvedValue({ data: {} });
    await open_settings();

    const after_prefetch = request_spy.mock.calls.length;

    await list_blocked_senders().catch(() => undefined);
    await list_forwarding_rules().catch(() => undefined);
    await list_sessions().catch(() => undefined);

    expect(after_prefetch).toBe(15);
    expect(request_spy.mock.calls.length).toBe(after_prefetch);
  });
});
