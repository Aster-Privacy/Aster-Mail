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

import { open_bridge_channel } from "./session_handoff_client";
import {
  CALENDAR_WEB_ORIGIN,
  MAIL_WEB_ORIGIN,
} from "./session_handoff_protocol";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  document.body.innerHTML = "";
});

async function frames_opened_for(origin: string): Promise<number> {
  const pending = open_bridge_channel(origin);
  const framed = document.querySelectorAll("iframe").length;

  vi.runOnlyPendingTimers();
  await pending;

  return framed;
}

describe("open_bridge_channel frame origin", () => {
  it("never frames the app's own origin", async () => {
    expect(await frames_opened_for(window.location.origin)).toBe(0);
  });

  it("frames only the sibling of the current origin", async () => {
    expect(window.location.origin).not.toBe(MAIL_WEB_ORIGIN);
    expect(await frames_opened_for(CALENDAR_WEB_ORIGIN)).toBe(0);
  });
});

describe("open_bridge_channel from the mail origin", () => {
  const original_location = window.location;

  beforeEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: new URL(`${MAIL_WEB_ORIGIN}/`),
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: original_location,
    });
    vi.restoreAllMocks();
  });

  it("frames the calendar bridge and connects to it", async () => {
    const pending = open_bridge_channel(CALENDAR_WEB_ORIGIN);
    const frames = document.querySelectorAll("iframe");

    expect(frames).toHaveLength(1);

    const frame = frames[0];

    expect(new URL(frame.src).origin).toBe(CALENDAR_WEB_ORIGIN);
    expect(frame.getAttribute("sandbox")).toBe(
      "allow-scripts allow-same-origin",
    );
    expect(frame.referrerPolicy).toBe("no-referrer");

    const target = frame.contentWindow;

    expect(target).not.toBeNull();

    const post = vi
      .spyOn(target as Window, "postMessage")
      .mockImplementation(() => undefined);

    frame.dispatchEvent(new Event("load"));

    const channel = await pending;

    expect(channel).not.toBeNull();
    expect(post).toHaveBeenCalledTimes(1);
    const [, target_origin, transfer] = post.mock.calls[0] as unknown[];

    expect(target_origin).toBe(CALENDAR_WEB_ORIGIN);
    expect(transfer).toHaveLength(1);

    channel?.close();
    expect(document.querySelectorAll("iframe")).toHaveLength(0);
  });
});
