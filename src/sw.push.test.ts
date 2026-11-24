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

import {
  GUARD_PUSH_FALLBACK_SIGN_IN,
  GUARD_PUSH_SW_MESSAGE,
} from "@/lib/guard_push";

type Listener = (event: unknown) => void;

interface FakeClient {
  focused: boolean;
  visibilityState: DocumentVisibilityState;
  url: string;
  postMessage: ReturnType<typeof vi.fn>;
}

const REQUEST = "5b0c7f3e-2a41-4d8e-9c6b-1f2e3d4c5b6a";
const ACCOUNT = "0f1e2d3c-4b5a-4968-8776-655443322110";
const PROMPT_TAG = `guard_sign_in_request_${REQUEST}`;

let listeners: Map<string, Listener>;
let window_clients: FakeClient[];
let show_notification: ReturnType<typeof vi.fn>;
let closed: string[];

function window_client(
  visibility: DocumentVisibilityState,
  focused = false,
): FakeClient {
  return {
    focused,
    visibilityState: visibility,
    url: "https://app.astermail.org/inbox",
    postMessage: vi.fn(),
  };
}

async function push(event: string): Promise<void> {
  const pending: Promise<unknown>[] = [];
  const listener = listeners.get("push");

  expect(listener).toBeDefined();
  listener!({
    data: {
      json: () => ({ type: "guard", event, id: REQUEST, account_id: ACCOUNT }),
      text: () => "",
    },
    waitUntil: (promise: Promise<unknown>) => pending.push(promise),
  });
  await Promise.all(pending);
}

beforeEach(async () => {
  listeners = new Map();
  window_clients = [];
  closed = [];
  show_notification = vi.fn(async () => undefined);

  vi.stubGlobal("caches", {
    keys: vi.fn(async () => []),
    delete: vi.fn(async () => true),
    open: vi.fn(async () => ({ match: async () => undefined })),
  });
  vi.stubGlobal("self", {
    addEventListener: (type: string, listener: Listener) => {
      listeners.set(type, listener);
    },
    skipWaiting: vi.fn(),
    clients: {
      claim: vi.fn(async () => undefined),
      matchAll: vi.fn(async () => window_clients),
    },
    registration: {
      showNotification: show_notification,
      getNotifications: vi.fn(async ({ tag }: { tag: string }) => [
        { close: () => closed.push(tag) },
      ]),
    },
    location: { origin: "https://app.astermail.org" },
  });

  vi.resetModules();
  await import("./sw");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("service worker guard push", () => {
  it("closes the prompt and shows nothing when a request is denied", async () => {
    await push("sign_in_denied");

    expect(closed).toEqual([PROMPT_TAG]);
    expect(show_notification).not.toHaveBeenCalled();
  });

  it("never notifies for an expired request", async () => {
    await push("sign_in_expired");

    expect(closed).toEqual([PROMPT_TAG]);
    expect(show_notification).not.toHaveBeenCalled();
  });

  it("closes the prompt without a new notice when a request is approved", async () => {
    await push("sign_in_approved");

    expect(closed).toEqual([PROMPT_TAG]);
    expect(show_notification).not.toHaveBeenCalled();
  });

  it("notifies once per request", async () => {
    await push("sign_in_request");
    await push("sign_in_request");

    expect(show_notification).toHaveBeenCalledTimes(1);
  });

  it("does not notify for a request that already ended", async () => {
    await push("sign_in_expired");
    await push("sign_in_request");

    expect(show_notification).not.toHaveBeenCalled();
  });

  it("shows a sign-in prompt when the only window is in the background", async () => {
    const hidden = window_client("hidden");

    window_clients = [hidden];
    await push("sign_in_request");

    expect(hidden.postMessage).toHaveBeenCalledWith({
      type: GUARD_PUSH_SW_MESSAGE,
      payload: {
        type: "guard",
        event: "sign_in_request",
        id: REQUEST,
        account_id: ACCOUNT,
      },
    });
    expect(show_notification).toHaveBeenCalledWith(
      "Aster Mail",
      expect.objectContaining({
        body: GUARD_PUSH_FALLBACK_SIGN_IN,
        tag: PROMPT_TAG,
      }),
    );
  });

  it("leaves the prompt to a focused, visible window", async () => {
    const visible = window_client("visible", true);

    window_clients = [visible];
    await push("sign_in_request");

    expect(visible.postMessage).toHaveBeenCalledTimes(1);
    expect(show_notification).not.toHaveBeenCalled();
  });
});
