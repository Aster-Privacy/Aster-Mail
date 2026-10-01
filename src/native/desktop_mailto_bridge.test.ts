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
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  deliver_mailto_link,
  reset_mailto_bridge,
  subscribe_mailto_drafts,
} from "./desktop_mailto_bridge";

describe("desktop mailto bridge", () => {
  beforeEach(() => {
    reset_mailto_bridge();
  });

  it("holds links until a subscriber exists, then delivers them in order", () => {
    deliver_mailto_link("mailto:ada@example.com");
    deliver_mailto_link("mailto:grace@example.com?subject=Hi");

    const listener = vi.fn();

    subscribe_mailto_drafts(listener);

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls[0][0].to).toEqual(["ada@example.com"]);
    expect(listener.mock.calls[1][0].subject).toBe("Hi");
  });

  it("delivers immediately once subscribed and only once", () => {
    const listener = vi.fn();

    subscribe_mailto_drafts(listener);
    deliver_mailto_link("mailto:ada@example.com");

    expect(listener).toHaveBeenCalledTimes(1);

    const second_listener = vi.fn();

    subscribe_mailto_drafts(second_listener);

    expect(second_listener).not.toHaveBeenCalled();
  });

  it("queues again after the subscriber leaves", () => {
    const listener = vi.fn();
    const unsubscribe = subscribe_mailto_drafts(listener);

    unsubscribe();
    deliver_mailto_link("mailto:ada@example.com");

    expect(listener).not.toHaveBeenCalled();

    const next_listener = vi.fn();

    subscribe_mailto_drafts(next_listener);

    expect(next_listener).toHaveBeenCalledTimes(1);
  });

  it("drops links that are not mailto links", () => {
    const listener = vi.fn();

    subscribe_mailto_drafts(listener);
    deliver_mailto_link("https://example.com");
    deliver_mailto_link("aster://oauth/callback?state=abc");

    expect(listener).not.toHaveBeenCalled();
  });

  it("keeps only the newest queued links", () => {
    for (let index = 0; index < 12; index += 1) {
      deliver_mailto_link(`mailto:user${index}@example.com`);
    }

    const listener = vi.fn();

    subscribe_mailto_drafts(listener);

    expect(listener).toHaveBeenCalledTimes(8);
    expect(listener.mock.calls[0][0].to).toEqual(["user4@example.com"]);
  });
});
