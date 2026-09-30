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
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

const profiles = vi.hoisted(() => ({
  cache: new Map<string, unknown>(),
  pending: [] as Array<(value: unknown) => void>,
}));

vi.mock("@/services/api/profiles", () => ({
  is_aster_email: () => true,
  get_cached_peer_profile: (email: string) => profiles.cache.get(email),
  get_peer_profile_hint: () => null,
  fetch_peer_profile: () =>
    new Promise((resolve) => {
      profiles.pending.push(resolve);
    }),
  subscribe_profile_updates: () => () => {},
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: { low_network_mode: false } }),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { use_peer_profile } = await import("@/hooks/use_peer_profile");

function render_probe(email: string) {
  const seen: Array<unknown> = [];

  function Probe({ address }: { address: string }) {
    seen.push(use_peer_profile(address));

    return null;
  }

  const container = document.createElement("div");
  let root: Root | null = null;

  act(() => {
    root = createRoot(container);
    root.render(createElement(Probe, { address: email }));
  });

  return {
    seen,
    rerender: (next: string) => {
      act(() => {
        root?.render(createElement(Probe, { address: next }));
      });
    },
  };
}

describe("use_peer_profile", () => {
  beforeEach(() => {
    profiles.cache.clear();
    profiles.pending.length = 0;
  });

  it("does not report the previous peer's profile while the next one loads", () => {
    profiles.cache.set("first@astermail.org", {
      display_name: "First Peer",
      profile_picture: "https://example.test/first.png",
    });

    const probe = render_probe("first@astermail.org");

    expect(probe.seen.at(-1)).toMatchObject({ display_name: "First Peer" });

    probe.rerender("second@astermail.org");

    expect(probe.seen.at(-1)).toBeUndefined();
  });

  it("serves a cached profile for the new peer without waiting", () => {
    profiles.cache.set("first@astermail.org", { display_name: "First Peer" });
    profiles.cache.set("second@astermail.org", { display_name: "Second Peer" });

    const probe = render_probe("first@astermail.org");

    probe.rerender("second@astermail.org");

    expect(probe.seen.at(-1)).toMatchObject({ display_name: "Second Peer" });
  });
});
