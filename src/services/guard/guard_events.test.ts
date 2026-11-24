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
  guard_push_body,
  create_guard_push_ledger,
  guard_push_is_ended,
  guard_push_notification_tag,
  guard_push_resolved_tag,
  guard_push_tag,
  GUARD_PUSH_FALLBACK_ACTIVITY,
  GUARD_PUSH_FALLBACK_ENDED,
  GUARD_PUSH_FALLBACK_SIGN_IN,
  guard_window_is_watching,
  read_guard_push,
} from "@/lib/guard_push";
import { GUARD_HELD_EVENT } from "@/services/api/client/helpers";
import {
  emit_guard_event,
  GUARD_DEDUPE_MS,
  on_guard_event,
  parse_guard_event,
  receive_guard_frame,
  reset_guard_events_for_tests,
  set_guard_event_account,
  start_guard_event_bridge,
} from "@/services/guard/guard_events";

class FakeChannel {
  static all: FakeChannel[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  closed = false;

  constructor() {
    FakeChannel.all.push(this);
  }

  postMessage(message: unknown): void {
    for (const other of FakeChannel.all) {
      if (other !== this && !other.closed) {
        other.onmessage?.({ data: message } as MessageEvent);
      }
    }
  }

  close(): void {
    this.closed = true;
  }
}

let now = 1_000_000;
let known = new Set(["u1", "u2"]);

function frame(event: string, id = "r1", account_id = "u1") {
  return { type: "guard", event, id, account_id };
}

beforeEach(() => {
  now = 1_000_000;
  known = new Set(["u1", "u2"]);
  FakeChannel.all = [];
  reset_guard_events_for_tests({
    now: () => now,
    open_channel: () => new FakeChannel(),
    is_known_account: async (id) => known.has(id),
  });
  set_guard_event_account("u1");
});

afterEach(() => {
  reset_guard_events_for_tests();
});

describe("guard events", () => {
  it("calls listeners once for a sync socket frame", async () => {
    const cb = vi.fn();

    on_guard_event(cb);
    expect(await receive_guard_frame(frame("sign_in_request"))).toBe(true);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith({
      event: "sign_in_request",
      id: "r1",
      account_id: "u1",
    });
  });

  it("ignores PascalCase and unknown names", async () => {
    const cb = vi.fn();

    on_guard_event(cb);
    await receive_guard_frame(frame("SignInRequest"));
    await receive_guard_frame(frame("something_else"));
    await receive_guard_frame({ ...frame("panic"), type: "new_mail" });
    expect(cb).not.toHaveBeenCalled();
    expect(parse_guard_event(frame("SignInRequest"))).toBeNull();
    expect(parse_guard_event({ type: "guard", event: "panic" })).toBeNull();
  });

  it("dedupes push and socket within 60 s and allows it after", async () => {
    const cb = vi.fn();

    on_guard_event(cb);
    await receive_guard_frame(frame("sign_in_request"));
    now += 30_000;
    await receive_guard_frame(frame("sign_in_request"));
    expect(cb).toHaveBeenCalledTimes(1);
    await receive_guard_frame(frame("change_held"));
    expect(cb).toHaveBeenCalledTimes(2);
    now += GUARD_DEDUPE_MS;
    await receive_guard_frame(frame("sign_in_request"));
    expect(cb).toHaveBeenCalledTimes(3);
  });

  it("ignores an account that is not signed in here", async () => {
    const cb = vi.fn();

    on_guard_event(cb);
    expect(await receive_guard_frame(frame("panic", "x", "u9"))).toBe(false);
    expect(cb).not.toHaveBeenCalled();
    expect(await receive_guard_frame(frame("panic", "x", "u2"))).toBe(true);
    expect(cb).toHaveBeenCalledWith(
      expect.objectContaining({ account_id: "u2" }),
    );
  });

  it("reaches another tab once per held id", () => {
    const other_tab = new FakeChannel();
    const other_tab_cb = vi.fn();
    const own_cb = vi.fn();

    other_tab.onmessage = (message) =>
      other_tab_cb(parse_guard_event(message.data));
    on_guard_event(own_cb);
    other_tab.postMessage(frame("change_held", "h1"));
    other_tab.postMessage(frame("change_held", "h1"));
    expect(own_cb).toHaveBeenCalledTimes(1);
    expect(own_cb).toHaveBeenCalledWith(expect.objectContaining({ id: "h1" }));
    emit_guard_event({ event: "change_held", id: "h2", account_id: "u1" });
    emit_guard_event({ event: "change_held", id: "h2", account_id: "u1" });
    expect(other_tab_cb).toHaveBeenCalledTimes(1);
    expect(other_tab_cb).toHaveBeenCalledWith(
      expect.objectContaining({ id: "h2" }),
    );
  });

  it("rebroadcasts a held response once", () => {
    const cb = vi.fn();
    const stop = start_guard_event_bridge();

    on_guard_event(cb);
    const detail = {
      id: "h9",
      kind: "forwarding_change",
      apply_after: "2026-11-16T00:00:00Z",
      skippable: true,
    };

    window.dispatchEvent(new CustomEvent(GUARD_HELD_EVENT, { detail }));
    window.dispatchEvent(new CustomEvent(GUARD_HELD_EVENT, { detail }));
    stop();
    window.dispatchEvent(
      new CustomEvent(GUARD_HELD_EVENT, { detail: { ...detail, id: "h10" } }),
    );
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith({
      event: "change_held",
      id: "h9",
      account_id: "u1",
    });
  });

  it("keeps working when a listener throws", async () => {
    const cb = vi.fn();

    on_guard_event(() => {
      throw new Error("boom");
    });
    on_guard_event(cb);
    await receive_guard_frame(frame("rescue_started", "s1"));
    expect(cb).toHaveBeenCalledTimes(1);
  });
});

describe("guard push text", () => {
  const REQUEST = "5b0c7d2e-1f3a-4c5b-9d6e-7f8091a2b3c4";
  const ACCOUNT = "0e1f2a3b-4c5d-4e6f-8a9b-0c1d2e3f4a5b";
  const PROMPT_TAG = `guard_sign_in_request_${REQUEST}`;
  const push = (event: string) => frame(event, REQUEST, ACCOUNT);

  it("never includes context details", () => {
    const payload = read_guard_push({
      ...push("sign_in_request"),
      city: "Berlin",
      browser: "Firefox on Windows",
    });

    expect(payload).toEqual(push("sign_in_request"));
    expect(guard_push_body(payload!, null)).toBe(GUARD_PUSH_FALLBACK_SIGN_IN);
    expect(
      guard_push_body(payload!, { guard_sign_in: "Neue Anmeldung" }),
    ).toBe("Neue Anmeldung");
    expect(guard_push_body(read_guard_push(push("panic"))!, {})).toBe(
      GUARD_PUSH_FALLBACK_ACTIVITY,
    );
    expect(guard_push_tag(payload!)).toBe(PROMPT_TAG);
    expect(read_guard_push({ type: "new_mail" })).toBeNull();
  });

  it("rejects ids that are not UUIDs", () => {
    expect(read_guard_push(frame("sign_in_request", "r1", ACCOUNT))).toBeNull();
    expect(read_guard_push(frame("sign_in_request", REQUEST, "u1"))).toBeNull();
    expect(
      read_guard_push(frame("sign_in_request", `${REQUEST}/../x`, ACCOUNT)),
    ).toBeNull();
    expect(read_guard_push(frame("Sign In!", REQUEST, ACCOUNT))).toBeNull();
  });

  it("closes the prompt when a request is resolved elsewhere", () => {
    const approved = read_guard_push(push("sign_in_approved"))!;
    const denied = read_guard_push(push("sign_in_denied"))!;
    const expired = read_guard_push(push("sign_in_expired"))!;
    const held = read_guard_push(push("change_held"))!;

    expect(guard_push_resolved_tag(approved)).toBe(PROMPT_TAG);
    expect(guard_push_resolved_tag(denied)).toBe(PROMPT_TAG);
    expect(guard_push_resolved_tag(expired)).toBe(PROMPT_TAG);
    expect(guard_push_resolved_tag(held)).toBeNull();
    expect(guard_push_is_ended(approved)).toBe(false);
    expect(guard_push_is_ended(denied)).toBe(true);
    expect(guard_push_is_ended(expired)).toBe(true);
    expect(guard_push_is_ended(held)).toBe(false);
    expect(guard_push_notification_tag(denied)).toBe(PROMPT_TAG);
    expect(guard_push_notification_tag(expired)).toBe(PROMPT_TAG);
    expect(guard_push_body(denied, null)).toBe(GUARD_PUSH_FALLBACK_ENDED);
    expect(guard_push_body(expired, { guard_ended: "Beendet" })).toBe(
      "Beendet",
    );
  });

  it("notifies each request at most once and never after it ends", () => {
    const ledger = create_guard_push_ledger();
    const request = read_guard_push(push("sign_in_request"))!;
    const expired = read_guard_push(push("sign_in_expired"))!;
    const held = read_guard_push(push("change_held"))!;

    expect(ledger.should_notify(request)).toBe(true);
    expect(ledger.should_notify(request)).toBe(false);
    expect(ledger.should_notify(expired)).toBe(false);
    expect(ledger.should_notify(held)).toBe(true);
    expect(ledger.should_notify(held)).toBe(false);

    const late = create_guard_push_ledger();

    expect(late.should_notify(expired)).toBe(false);
    expect(late.should_notify(request)).toBe(false);
  });

  it("treats only a focused, visible window as watching", () => {
    expect(guard_window_is_watching([])).toBe(false);
    expect(
      guard_window_is_watching([{ focused: false, visibilityState: "hidden" }]),
    ).toBe(false);
    expect(
      guard_window_is_watching([{ focused: false, visibilityState: "visible" }]),
    ).toBe(false);
    expect(
      guard_window_is_watching([{ focused: true, visibilityState: "visible" }]),
    ).toBe(true);
  });

  it("accepts the new alert events", () => {
    for (const name of [
      "sign_in_approved",
      "sign_in_denied",
      "sign_in_expired",
      "device_added",
      "device_removed",
      "rescue_completed",
      "guard_disabled",
    ]) {
      expect(parse_guard_event(frame(name))?.event).toBe(name);
    }
  });
});
