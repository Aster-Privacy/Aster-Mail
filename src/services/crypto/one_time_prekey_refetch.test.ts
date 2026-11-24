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
import { describe, it, expect } from "vitest";

import * as watch from "./one_time_prekey_watch";

interface FakeBundle {
  identity: string;
  one_time: string | null;
}

interface FakeSession {
  name: string;
  withheld: boolean;
}

const start_session = async (bundle: FakeBundle): Promise<FakeSession> => ({
  name: `session:${bundle.one_time ?? "signed-only"}`,
  withheld: !bundle.one_time,
});

const is_withheld = (session: FakeSession) => session.withheld;

const same_peer = (a: FakeBundle, b: FakeBundle) => a.identity === b.identity;

const offers_one_time = (bundle: FakeBundle) => Boolean(bundle.one_time);

function helper() {
  const start = (watch as Record<string, unknown>)[
    "start_with_fresh_bundle_once"
  ];

  expect(typeof start).toBe("function");

  return start as typeof watch.start_with_fresh_bundle_once;
}

async function run(
  bundle: FakeBundle,
  refetch: () => Promise<FakeBundle | null>,
) {
  return helper()(
    bundle,
    start_session,
    refetch,
    same_peer,
    is_withheld,
    offers_one_time,
  ).then(
    (outcome) => outcome,
    () => null,
  );
}

describe("one-time prekey fresh bundle retry", () => {
  it("does not start a session from a fresh bundle that still lacks a one-time prekey", async () => {
    const first: FakeBundle = { identity: "peer", one_time: null };
    const fresh: FakeBundle = { identity: "peer", one_time: null };
    const started: FakeBundle[] = [];
    const outcome = await helper()(
      first,
      async (candidate: FakeBundle) => {
        started.push(candidate);

        return start_session(candidate);
      },
      async () => fresh,
      same_peer,
      is_withheld,
      offers_one_time,
    );

    expect(started).toEqual([first]);
    expect(started[0]).toBe(first);
    expect(outcome.bundle).toBe(first);
    expect(outcome.withheld).toBe(true);
  });

  it("requests a fresh bundle once and uses its one-time prekey", async () => {
    let fetches = 0;
    const outcome = await run({ identity: "peer", one_time: null }, async () => {
      fetches += 1;

      return { identity: "peer", one_time: "opk-7" };
    });

    expect(fetches).toBe(1);
    expect(outcome?.started.name).toBe("session:opk-7");
    expect(outcome?.bundle.one_time).toBe("opk-7");
    expect(outcome?.withheld).toBe(false);
  });

  it("keeps the signed prekey session when the fresh bundle still withholds the prekey", async () => {
    let fetches = 0;
    const outcome = await run({ identity: "peer", one_time: null }, async () => {
      fetches += 1;

      return { identity: "peer", one_time: null };
    });

    expect(fetches).toBe(1);
    expect(outcome?.started.name).toBe("session:signed-only");
    expect(outcome?.withheld).toBe(true);
  });

  it("keeps the first session when the fresh bundle is for a different identity", async () => {
    const outcome = await run({ identity: "peer", one_time: null }, async () => ({
      identity: "someone-else",
      one_time: "opk-9",
    }));

    expect(outcome?.started.name).toBe("session:signed-only");
    expect(outcome?.bundle.identity).toBe("peer");
    expect(outcome?.withheld).toBe(true);
  });

  it("keeps the first session when the refetch fails", async () => {
    const outcome = await run({ identity: "peer", one_time: null }, async () => {
      throw new Error("offline");
    });

    expect(outcome?.started.name).toBe("session:signed-only");
    expect(outcome?.withheld).toBe(true);
  });

  it("does not refetch when the first bundle offers a prekey", async () => {
    let fetches = 0;
    const outcome = await run({ identity: "peer", one_time: "opk-1" }, async () => {
      fetches += 1;

      return null;
    });

    expect(fetches).toBe(0);
    expect(outcome?.started.name).toBe("session:opk-1");
    expect(outcome?.withheld).toBe(false);
  });
});
