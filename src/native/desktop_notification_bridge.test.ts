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
  deliver_notification_open,
  reset_notification_bridge,
  subscribe_notification_opens,
} from "./desktop_notification_bridge";

const EMAIL_ID = "4f0c2a8e-91b3-4c4e-9a52-0d3f1e2b7c11";

describe("desktop notification bridge", () => {
  beforeEach(() => {
    reset_notification_bridge();
  });

  it("holds the clicked message until the inbox subscribes", () => {
    deliver_notification_open(EMAIL_ID);

    const listener = vi.fn();

    subscribe_notification_opens(listener);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(EMAIL_ID);
  });

  it("keeps only the latest click while nothing is subscribed", () => {
    deliver_notification_open("first");
    deliver_notification_open(EMAIL_ID);

    const listener = vi.fn();

    subscribe_notification_opens(listener);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(EMAIL_ID);
  });

  it("delivers immediately once subscribed and only once", () => {
    const listener = vi.fn();

    subscribe_notification_opens(listener);
    deliver_notification_open(EMAIL_ID);

    expect(listener).toHaveBeenCalledTimes(1);

    const next_listener = vi.fn();

    subscribe_notification_opens(next_listener);

    expect(next_listener).not.toHaveBeenCalled();
  });

  it("queues again after the subscriber leaves", () => {
    const listener = vi.fn();
    const unsubscribe = subscribe_notification_opens(listener);

    unsubscribe();
    deliver_notification_open(EMAIL_ID);

    expect(listener).not.toHaveBeenCalled();

    const next_listener = vi.fn();

    subscribe_notification_opens(next_listener);

    expect(next_listener).toHaveBeenCalledWith(EMAIL_ID);
  });

  it("drops ids that are not message ids", () => {
    const listener = vi.fn();

    subscribe_notification_opens(listener);
    deliver_notification_open("");
    deliver_notification_open("../settings");
    deliver_notification_open("a b");
    deliver_notification_open("x".repeat(129));

    expect(listener).not.toHaveBeenCalled();
  });
});
