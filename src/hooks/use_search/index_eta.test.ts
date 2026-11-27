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
  ETA_MIN_ELAPSED_MS,
  ETA_PUBLISH_INTERVAL_MS,
  create_eta_estimator,
  eta_phrase,
  round_eta_seconds,
} from "./index_eta";

function feed(
  estimator: ReturnType<typeof create_eta_estimator>,
  from_ms: number,
  until_ms: number,
  step_ms: number,
  rate_per_s: (at_ms: number) => number,
  start_done: number,
  total: number,
) {
  const shown: (number | null)[] = [];
  let done = start_done;

  for (let at = from_ms; at <= until_ms; at += step_ms) {
    done += (rate_per_s(at) * step_ms) / 1000;
    shown.push(estimator.sample(at, Math.floor(done), total));
  }

  return { shown, done };
}

describe("round_eta_seconds", () => {
  it("rounds to coarse steps that read naturally", () => {
    expect(round_eta_seconds(20)).toBe(59);
    expect(round_eta_seconds(4 * 60 + 20)).toBe(4 * 60);
    expect(round_eta_seconds(54 * 60 + 46)).toBe(55 * 60);
    expect(round_eta_seconds(47 * 60)).toBe(45 * 60);
    expect(round_eta_seconds(100 * 60)).toBe(90 * 60);
    expect(round_eta_seconds(4.4 * 3600)).toBe(4 * 3600);
  });
});

describe("eta_phrase", () => {
  it("picks a plural aware key with a whole count", () => {
    expect(eta_phrase(30)).toEqual({ key: "search_index_eta_under_minute" });
    expect(eta_phrase(60)).toEqual({
      key: "search_index_eta_minutes",
      count: 1,
    });
    expect(eta_phrase(55 * 60)).toEqual({
      key: "search_index_eta_minutes",
      count: 55,
    });
    expect(eta_phrase(90 * 60)).toEqual({
      key: "search_index_eta_hours",
      count: 1.5,
    });
    expect(eta_phrase(3 * 3600)).toEqual({
      key: "search_index_eta_hours",
      count: 3,
    });
  });
});

describe("create_eta_estimator", () => {
  it("shows nothing until there is enough data", () => {
    const estimator = create_eta_estimator();
    const { shown } = feed(
      estimator,
      0,
      ETA_MIN_ELAPSED_MS - 250,
      250,
      () => 10,
      0,
      30000,
    );

    expect(shown.every((value) => value === null)).toBe(true);
  });

  it("holds a published value for the publish interval while progress ticks", () => {
    const estimator = create_eta_estimator();
    const { shown } = feed(estimator, 0, 120000, 250, () => 10, 0, 30000);
    const first = shown.findIndex((value) => value !== null);

    expect(first).toBeGreaterThan(0);

    let changes = 0;

    for (let i = first + 1; i < shown.length; i++) {
      if (shown[i] !== shown[i - 1]) changes++;
    }

    const visible_ms = (shown.length - first) * 250;

    expect(changes).toBeLessThanOrEqual(
      Math.ceil(visible_ms / ETA_PUBLISH_INTERVAL_MS),
    );
    expect(shown[shown.length - 1]).toBe(50 * 60);
  });

  it("smooths a short burst instead of jumping with it", () => {
    const estimator = create_eta_estimator();
    const steady = feed(estimator, 0, 60000, 250, () => 10, 0, 40000);
    const before = steady.shown[steady.shown.length - 1]!;
    const burst = feed(
      estimator,
      60250,
      62500,
      250,
      () => 200,
      steady.done,
      40000,
    );
    const after = burst.shown[burst.shown.length - 1]!;

    const naive = (40000 - burst.done) / 200;

    expect(before).toBeGreaterThan(0);
    expect(naive).toBeLessThan(4 * 60);
    expect(after).toBeGreaterThanOrEqual(10 * 60);
  });

  it("resets when the run finishes or the count goes backwards", () => {
    const estimator = create_eta_estimator();

    feed(estimator, 0, 60000, 250, () => 10, 0, 30000);

    expect(estimator.sample(60250, 30000, 30000)).toBeNull();
    expect(estimator.sample(60500, 10, 30000)).toBeNull();
  });
});
