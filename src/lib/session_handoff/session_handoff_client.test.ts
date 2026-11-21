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
import { describe, it, expect, vi } from "vitest";

import {
  await_sibling_approval,
  request_sibling_session,
  type HandoffChannel,
  type HandoffConsumerDeps,
} from "./session_handoff_client";
import {
  CALENDAR_WEB_ORIGIN,
  MAIL_WEB_ORIGIN,
  build_handoff_message,
} from "./session_handoff_protocol";

const USER_ID = "3f2a8c1e-5b4d-4e6f-9a7b-1c2d3e4f5a6b";
const OTHER_ID = "9b8a7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const GRANT = "g".repeat(43);
const WITH_GRANT = { grant: GRANT };

const session = {
  user: { id: USER_ID, username: "alex", email: "alex@astermail.org" },
  passphrase: "secret",
  encrypted_vault: "QUJD",
  vault_nonce: "bm9u",
};

function fake_channel(replies: unknown[]) {
  const sent: unknown[] = [];
  const close = vi.fn();
  const channel: HandoffChannel = {
    send: (message) => {
      sent.push(message);
    },
    next: async () => replies.shift() ?? null,
    close,
  };

  return { channel, sent, close };
}

function make_deps(
  channel: HandoffChannel | null,
  overrides: Partial<HandoffConsumerDeps> = {},
) {
  const open_channel = vi.fn(async (_origin: string) => channel);
  const deps: HandoffConsumerDeps = {
    origin: MAIL_WEB_ORIGIN,
    has_session_cookie: () => true,
    verify_server_session: async () => USER_ID,
    has_local_lock: () => false,
    open_channel,
    ...overrides,
  };

  return { deps, open_channel };
}

const available = build_handoff_message({
  type: "probe_result",
  available: true,
});
const not_available = build_handoff_message({
  type: "probe_result",
  available: false,
});
const session_reply = build_handoff_message({ type: "session", session });

describe("request_sibling_session", () => {
  it("completes the exchange with the sibling origin", async () => {
    const { channel, sent, close } = fake_channel([available, session_reply]);
    const { deps, open_channel } = make_deps(channel);

    expect(await request_sibling_session(deps, WITH_GRANT)).toEqual(session);
    expect(open_channel).toHaveBeenCalledWith(CALENDAR_WEB_ORIGIN);
    expect(sent).toEqual([
      build_handoff_message({ type: "probe", grant: GRANT, wait: false }),
      build_handoff_message({ type: "request", grant: GRANT, user_id: USER_ID }),
    ]);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("does nothing on an unknown origin or without a session cookie", async () => {
    const first = make_deps(fake_channel([]).channel, {
      origin: "https://evil.example",
    });
    const second = make_deps(fake_channel([]).channel, {
      has_session_cookie: () => false,
    });

    expect(await request_sibling_session(first.deps, WITH_GRANT)).toBeNull();
    expect(first.open_channel).not.toHaveBeenCalled();
    expect(await request_sibling_session(second.deps, WITH_GRANT)).toBeNull();
    expect(second.open_channel).not.toHaveBeenCalled();
  });

  it("stops after a negative probe without asking the server", async () => {
    const verify = vi.fn(async () => USER_ID);
    const { channel, sent, close } = fake_channel([not_available]);
    const { deps } = make_deps(channel, { verify_server_session: verify });

    expect(await request_sibling_session(deps, WITH_GRANT)).toBeNull();
    expect(verify).not.toHaveBeenCalled();
    expect(sent).toHaveLength(1);
    expect(close).toHaveBeenCalled();
  });

  it("never requests a session without a verified server user", async () => {
    const { channel, sent } = fake_channel([available, session_reply]);
    const { deps } = make_deps(channel, {
      verify_server_session: async () => null,
    });

    expect(await request_sibling_session(deps, WITH_GRANT)).toBeNull();
    expect(sent).toHaveLength(1);
  });

  it("refuses a different expected user", async () => {
    const { channel, sent } = fake_channel([available, session_reply]);
    const { deps } = make_deps(channel);

    expect(
      await request_sibling_session(deps, {
        grant: GRANT,
        expected_user_id: OTHER_ID,
      }),
    ).toBeNull();
    expect(sent).toHaveLength(1);
  });

  it("refuses when this app is locked", async () => {
    const { channel, sent } = fake_channel([available, session_reply]);
    const { deps } = make_deps(channel, { has_local_lock: () => true });

    expect(await request_sibling_session(deps, WITH_GRANT)).toBeNull();
    expect(sent).toHaveLength(1);
  });

  it("rejects a session for another user", async () => {
    const reply = build_handoff_message({
      type: "session",
      session: { ...session, user: { ...session.user, id: OTHER_ID } },
    });
    const { channel, close } = fake_channel([available, reply]);
    const { deps } = make_deps(channel);

    expect(await request_sibling_session(deps, WITH_GRANT)).toBeNull();
    expect(close).toHaveBeenCalled();
  });

  it("rejects malformed and missing replies", async () => {
    const cases: unknown[][] = [
      [available, { type: "session", session }],
      [available, build_handoff_message({ type: "unavailable" })],
      [available],
      [],
      [{ protocol: "x", type: "probe_result", available: true }],
    ];

    for (const replies of cases) {
      const { channel, close } = fake_channel([...replies]);
      const { deps } = make_deps(channel);

      expect(await request_sibling_session(deps, WITH_GRANT)).toBeNull();
      expect(close).toHaveBeenCalled();
    }
  });

  it("returns null when the channel cannot open", async () => {
    const { deps } = make_deps(null);

    expect(await request_sibling_session(deps, WITH_GRANT)).toBeNull();
  });

  it("closes the channel when a dependency throws", async () => {
    const { channel, close } = fake_channel([available]);
    const { deps } = make_deps(channel, {
      verify_server_session: async () => {
        throw new Error("network");
      },
    });

    expect(await request_sibling_session(deps, WITH_GRANT)).toBeNull();
    expect(close).toHaveBeenCalled();
  });

  it("does nothing without a well-formed grant", async () => {
    for (const grant of ["", "short", "g".repeat(44), "g".repeat(42) + "!"]) {
      const { deps, open_channel } = make_deps(fake_channel([]).channel);

      expect(await request_sibling_session(deps, { grant })).toBeNull();
      expect(open_channel).not.toHaveBeenCalled();
    }
  });
});

describe("await_sibling_approval", () => {
  it("waits on the grant through the sibling bridge", async () => {
    const { channel, sent, close } = fake_channel([available]);
    const open_channel = vi.fn(async (_origin: string) => channel);

    expect(await await_sibling_approval(MAIL_WEB_ORIGIN, GRANT, open_channel)).toBe(
      true,
    );
    expect(open_channel).toHaveBeenCalledWith(CALENDAR_WEB_ORIGIN);
    expect(sent).toEqual([
      build_handoff_message({ type: "probe", grant: GRANT, wait: true }),
    ]);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("reports a refusal, a timeout, or a broken channel", async () => {
    const cases: unknown[][] = [[not_available], []];

    for (const replies of cases) {
      const { channel, close } = fake_channel([...replies]);

      expect(
        await await_sibling_approval(MAIL_WEB_ORIGIN, GRANT, async () => channel),
      ).toBe(false);
      expect(close).toHaveBeenCalled();
    }
    expect(
      await await_sibling_approval(MAIL_WEB_ORIGIN, GRANT, async () => null),
    ).toBe(false);
    expect(
      await await_sibling_approval(MAIL_WEB_ORIGIN, GRANT, async () => {
        throw new Error("frame");
      }),
    ).toBe(false);
  });

  it("refuses an unknown origin or a malformed grant", async () => {
    const open_channel = vi.fn(async () => fake_channel([available]).channel);

    expect(
      await await_sibling_approval("https://other.example", GRANT, open_channel),
    ).toBe(false);
    expect(await await_sibling_approval(MAIL_WEB_ORIGIN, "x", open_channel)).toBe(
      false,
    );
    expect(open_channel).not.toHaveBeenCalled();
  });
});
