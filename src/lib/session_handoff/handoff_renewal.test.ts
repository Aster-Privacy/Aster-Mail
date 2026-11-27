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
import { describe, expect, it, vi } from "vitest";

import {
  answer_renewal_ask,
  ask_for_renewal,
  type RenewalPort,
} from "./handoff_renewal";

const FINDLEY_ID = "0b6f1c2e-4a3d-4c8e-9f10-2a3b4c5d6e7f";
const AUDIENCE = "https://calendar.astermail.org";
const NONCE = "n".repeat(43);
const GRANT = "g".repeat(43);

function loopback_port(
  answer: (data: unknown) => unknown[],
): RenewalPort & { closed: boolean } {
  let handler: ((data: unknown) => void) | null = null;
  const port = {
    closed: false,
    post: (message: unknown) => {
      for (const reply of answer(message)) {
        queueMicrotask(() => handler?.(reply));
      }
    },
    listen: (next: (data: unknown) => void) => {
      handler = next;
    },
    close: () => {
      port.closed = true;
    },
  };

  return port;
}

describe("handoff renewal channel", () => {
  it("takes the first grant answered for its own nonce", async () => {
    const port = loopback_port(() => [
      { type: "renew_grant", nonce: "x".repeat(43), grant: "h".repeat(43) },
      { type: "renew_grant", nonce: NONCE, grant: GRANT },
    ]);

    await expect(
      ask_for_renewal(port, FINDLEY_ID, AUDIENCE, NONCE, 1000),
    ).resolves.toBe(GRANT);
    expect(port.closed).toBe(true);
  });

  it("gives up when no Mail tab answers", async () => {
    vi.useFakeTimers();
    const port = loopback_port(() => []);
    const pending = ask_for_renewal(port, FINDLEY_ID, AUDIENCE, NONCE, 1000);

    await vi.advanceTimersByTimeAsync(1000);
    await expect(pending).resolves.toBeNull();
    expect(port.closed).toBe(true);
    vi.useRealTimers();
  });

  it("answers only when the tab mints for the asked account", async () => {
    const ask = {
      type: "renew_ask",
      nonce: NONCE,
      user_id: FINDLEY_ID,
      audience: AUDIENCE,
    };
    const switched = vi.fn(async () => null);
    const same = vi.fn(async () => GRANT);

    await expect(answer_renewal_ask(ask, switched)).resolves.toBeNull();
    expect(switched).toHaveBeenCalledWith(AUDIENCE, FINDLEY_ID);
    await expect(answer_renewal_ask(ask, same)).resolves.toEqual({
      type: "renew_grant",
      nonce: NONCE,
      grant: GRANT,
    });
  });

  it("ignores malformed asks", async () => {
    const mint = vi.fn(async () => GRANT);

    await expect(
      answer_renewal_ask(
        { type: "renew_ask", nonce: NONCE, user_id: "x", audience: AUDIENCE },
        mint,
      ),
    ).resolves.toBeNull();
    expect(mint).not.toHaveBeenCalled();
  });
});
