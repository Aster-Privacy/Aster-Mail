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
import { describe, it, expect, beforeEach } from "vitest";

import {
  can_acquire_send_lock,
  is_repeat_send,
  SEND_LOCK_STALL_MS,
  SEND_REPEAT_GUARD_MS,
  is_attachment_set_incomplete,
  build_send_fingerprint,
  is_duplicate_send,
  record_send,
  forget_send,
  reset_recent_sends,
  DUPLICATE_SEND_WINDOW_MS,
} from "@/components/compose/send_lock";

describe("can_acquire_send_lock", () => {
  it("allows sending when no send is in flight", () => {
    expect(can_acquire_send_lock({ held: false, started_at: 0 }, 1000)).toBe(
      true,
    );
  });

  it("blocks a second send while one is genuinely in flight", () => {
    expect(can_acquire_send_lock({ held: true, started_at: 1000 }, 1200)).toBe(
      false,
    );
  });

  it("breaks a lock that was leaked and never released", () => {
    expect(
      can_acquire_send_lock(
        { held: true, started_at: 1000 },
        1000 + SEND_LOCK_STALL_MS,
      ),
    ).toBe(true);
  });

  it("never strands the send button forever", () => {
    expect(
      can_acquire_send_lock({ held: true, started_at: 0 }, 24 * 60 * 60 * 1000),
    ).toBe(true);
  });
});

describe("is_repeat_send", () => {
  it("does not throttle the first send", () => {
    expect(is_repeat_send(0, 5000)).toBe(false);
  });

  it("swallows an accidental double submit", () => {
    expect(is_repeat_send(5000, 5100)).toBe(true);
  });

  it("allows a deliberate resend once the guard elapses", () => {
    expect(is_repeat_send(5000, 5000 + SEND_REPEAT_GUARD_MS)).toBe(false);
  });

  it("allows an immediate retry after a failure clears the marker", () => {
    expect(is_repeat_send(0, 5100)).toBe(false);
  });
});

describe("is_attachment_set_incomplete", () => {
  it("blocks a send while forwarded attachments are still loading", () => {
    expect(is_attachment_set_incomplete(true)).toBe(true);
  });

  it("allows a send once forwarded attachments have loaded", () => {
    expect(is_attachment_set_incomplete(false)).toBe(false);
  });

  it("allows a send when the compose was never a forward", () => {
    expect(is_attachment_set_incomplete(undefined)).toBe(false);
  });
});

describe("build_send_fingerprint", () => {
  it("matches the same message regardless of recipient order or casing", () => {
    const first = build_send_fingerprint(
      ["A@example.com", "b@example.com"],
      "Re: Hello",
      "Same body",
    );
    const second = build_send_fingerprint(
      ["b@example.com", " a@example.com "],
      "re:  hello",
      "Same  body",
    );

    expect(first).toBe(second);
  });

  it("separates different bodies, recipients, and attachment sets", () => {
    const base = build_send_fingerprint(["a@example.com"], "Hi", "Body");

    expect(base).not.toBe(
      build_send_fingerprint(["a@example.com"], "Hi", "Other body"),
    );
    expect(base).not.toBe(
      build_send_fingerprint(["c@example.com"], "Hi", "Body"),
    );
    expect(base).not.toBe(
      build_send_fingerprint(["a@example.com"], "Hi", "Body", "file.pdf:12"),
    );
  });

  it("returns an empty fingerprint when there is nothing to compare", () => {
    expect(build_send_fingerprint([], "Hi", "Body")).toBe("");
    expect(build_send_fingerprint(["a@example.com"], "  ", " ")).toBe("");
  });
});

describe("duplicate send guard", () => {
  beforeEach(() => {
    reset_recent_sends();
  });

  it("allows the first send of a message", () => {
    const fingerprint = build_send_fingerprint(["a@example.com"], "Hi", "Body");

    expect(is_duplicate_send(fingerprint, 1000)).toBe(false);
  });

  it("blocks the same message resent inside the window", () => {
    const fingerprint = build_send_fingerprint(["a@example.com"], "Hi", "Body");

    record_send(fingerprint, 1000);

    expect(is_duplicate_send(fingerprint, 1000 + 5400)).toBe(true);
  });

  it("allows a deliberate resend once the window elapses", () => {
    const fingerprint = build_send_fingerprint(["a@example.com"], "Hi", "Body");

    record_send(fingerprint, 1000);

    expect(
      is_duplicate_send(fingerprint, 1000 + DUPLICATE_SEND_WINDOW_MS),
    ).toBe(false);
  });

  it("never blocks a different message", () => {
    record_send(build_send_fingerprint(["a@example.com"], "Hi", "Body"), 1000);

    expect(
      is_duplicate_send(
        build_send_fingerprint(["a@example.com"], "Hi", "Second thought"),
        1200,
      ),
    ).toBe(false);
  });

  it("allows an immediate retry after a failed send clears the record", () => {
    const fingerprint = build_send_fingerprint(["a@example.com"], "Hi", "Body");

    record_send(fingerprint, 1000);
    forget_send(fingerprint);

    expect(is_duplicate_send(fingerprint, 1100)).toBe(false);
  });

  it("ignores an empty fingerprint", () => {
    record_send("", 1000);

    expect(is_duplicate_send("", 1100)).toBe(false);
  });
});
