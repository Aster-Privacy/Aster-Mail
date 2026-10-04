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

import { MODEL_CACHE_NAME } from "@/services/translation/model_source";

type Listener = (event: unknown) => void;

const PUSH_STRINGS_CACHE = "aster_push_strings";
const STALE_APP_CACHES = [
  "workbox-precache-v2-https://app.astermail.org/",
  "aster-runtime-assets",
  "aster-translation-models-v0",
];

let listeners: Map<string, Listener>;
let cache_names: Set<string>;
let deleted: string[];

async function dispatch(type: string, data?: unknown): Promise<void> {
  const pending: Promise<unknown>[] = [];
  const listener = listeners.get(type);

  expect(listener).toBeDefined();
  listener!({
    data,
    origin: "",
    waitUntil: (promise: Promise<unknown>) => pending.push(promise),
  });
  await Promise.all(pending);
}

beforeEach(async () => {
  listeners = new Map();
  cache_names = new Set([
    PUSH_STRINGS_CACHE,
    MODEL_CACHE_NAME,
    ...STALE_APP_CACHES,
  ]);
  deleted = [];

  vi.stubGlobal("caches", {
    keys: vi.fn(async () => [...cache_names]),
    delete: vi.fn(async (name: string) => {
      deleted.push(name);

      return cache_names.delete(name);
    }),
  });
  vi.stubGlobal("self", {
    addEventListener: (type: string, listener: Listener) => {
      listeners.set(type, listener);
    },
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn(async () => undefined) },
    location: { origin: "https://app.astermail.org" },
  });

  vi.resetModules();
  await import("./sw");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("service worker activate", () => {
  it("keeps downloaded translation models across app updates", async () => {
    await dispatch("activate");

    expect(cache_names.has(MODEL_CACHE_NAME)).toBe(true);
    expect(cache_names.has(PUSH_STRINGS_CACHE)).toBe(true);
    expect(deleted).not.toContain(MODEL_CACHE_NAME);
  });

  it("still deletes every stale app cache", async () => {
    await dispatch("activate");

    expect(deleted).toHaveLength(STALE_APP_CACHES.length);
    expect([...deleted].sort()).toEqual([...STALE_APP_CACHES].sort());
  });

  it("still removes translation models on logout purge", async () => {
    await dispatch("message", { type: "LOGOUT_PURGE" });

    expect(deleted).toContain(MODEL_CACHE_NAME);
    expect([...cache_names]).toEqual([PUSH_STRINGS_CACHE]);
  });
});
