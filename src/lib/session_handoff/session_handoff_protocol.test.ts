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
import { describe, it, expect } from "vitest";

import {
  CALENDAR_WEB_ORIGIN,
  MAIL_WEB_ORIGIN,
  SESSION_HANDOFF_PROTOCOL,
  build_handoff_message,
  get_handoff_sibling_origin,
  is_handoff_connect_message,
  is_handoff_grant_id,
  parse_handoff_bridge_reply,
  parse_handoff_port_request,
  parse_handoff_session,
  parse_handoff_user,
} from "./session_handoff_protocol";

const USER_ID = "3f2a8c1e-5b4d-4e6f-9a7b-1c2d3e4f5a6b";
const GRANT = "Q".repeat(43);

const valid_user = {
  id: USER_ID,
  username: "alex",
  email: "alex@astermail.org",
};

const valid_session = {
  user: valid_user,
  passphrase: "correct horse battery staple",
  encrypted_vault: "QUJDREVGR0g=",
  vault_nonce: "bm9uY2U=",
};

describe("get_handoff_sibling_origin", () => {
  it("pairs the mail and calendar origins", () => {
    expect(get_handoff_sibling_origin(MAIL_WEB_ORIGIN)).toBe(
      CALENDAR_WEB_ORIGIN,
    );
    expect(get_handoff_sibling_origin(CALENDAR_WEB_ORIGIN)).toBe(
      MAIL_WEB_ORIGIN,
    );
  });

  it("returns null for every other origin", () => {
    for (const origin of [
      "https://cal.astermail.org",
      "https://calendar.aster.cx",
      "https://app.aster.cx",
      "http://app.astermail.org",
      "https://evil.example",
      "https://app.astermail.org.evil.example",
      "null",
      "",
    ]) {
      expect(get_handoff_sibling_origin(origin)).toBeNull();
    }
  });
});

describe("is_handoff_connect_message", () => {
  it("accepts only the exact connect message", () => {
    expect(
      is_handoff_connect_message(build_handoff_message({ type: "connect" })),
    ).toBe(true);
    expect(is_handoff_connect_message({ type: "connect" })).toBe(false);
    expect(
      is_handoff_connect_message({
        protocol: "aster-session-handoff-0",
        type: "connect",
      }),
    ).toBe(false);
    expect(
      is_handoff_connect_message({
        protocol: SESSION_HANDOFF_PROTOCOL,
        type: "connect",
        extra: 1,
      }),
    ).toBe(false);
    expect(is_handoff_connect_message("connect")).toBe(false);
    expect(is_handoff_connect_message(null)).toBe(false);
  });
});

describe("parse_handoff_port_request", () => {
  it("parses a probe and a request that carry a grant", () => {
    expect(
      parse_handoff_port_request(
        build_handoff_message({ type: "probe", grant: GRANT }),
      ),
    ).toEqual({ type: "probe", grant: GRANT, wait: false });
    expect(
      parse_handoff_port_request(
        build_handoff_message({ type: "probe", grant: GRANT, wait: true }),
      ),
    ).toEqual({ type: "probe", grant: GRANT, wait: true });
    expect(
      parse_handoff_port_request(
        build_handoff_message({ type: "request", grant: GRANT, user_id: USER_ID }),
      ),
    ).toEqual({ type: "request", grant: GRANT, user_id: USER_ID });
  });

  it("rejects requests without a valid grant", () => {
    for (const grant of [undefined, "", "short", GRANT + "a", "!".repeat(43)]) {
      expect(
        parse_handoff_port_request(build_handoff_message({ type: "probe", grant })),
      ).toBeNull();
      expect(
        parse_handoff_port_request(
          build_handoff_message({ type: "request", grant, user_id: USER_ID }),
        ),
      ).toBeNull();
    }
  });

  it("rejects malformed requests", () => {
    expect(
      parse_handoff_port_request(
        build_handoff_message({
          type: "request",
          grant: GRANT,
          user_id: "not-a-uuid",
        }),
      ),
    ).toBeNull();
    expect(
      parse_handoff_port_request(
        build_handoff_message({
          type: "request",
          grant: GRANT,
          user_id: USER_ID,
          x: 1,
        }),
      ),
    ).toBeNull();
    expect(
      parse_handoff_port_request(
        build_handoff_message({ type: "probe", grant: GRANT, wait: "yes" }),
      ),
    ).toBeNull();
    expect(
      parse_handoff_port_request({ type: "probe", grant: GRANT }),
    ).toBeNull();
    expect(
      parse_handoff_port_request(
        Object.assign(Object.create({ inherited: true }), {
          protocol: SESSION_HANDOFF_PROTOCOL,
          type: "probe",
          grant: GRANT,
        }),
      ),
    ).toBeNull();
    expect(parse_handoff_port_request([])).toBeNull();
  });

  it("rejects messages from the previous protocol version", () => {
    expect(
      parse_handoff_port_request({
        protocol: "aster-session-handoff-1",
        type: "probe",
        grant: GRANT,
      }),
    ).toBeNull();
  });
});

describe("is_handoff_grant_id", () => {
  it("accepts only 43 base64url characters", () => {
    expect(is_handoff_grant_id(GRANT)).toBe(true);
    expect(is_handoff_grant_id("A-_" + "z".repeat(40))).toBe(true);
    expect(is_handoff_grant_id("z".repeat(42))).toBe(false);
    expect(is_handoff_grant_id("z".repeat(44))).toBe(false);
    expect(is_handoff_grant_id("+".repeat(43))).toBe(false);
    expect(is_handoff_grant_id(42)).toBe(false);
  });
});

describe("parse_handoff_user", () => {
  it("keeps optional fields that are valid", () => {
    expect(
      parse_handoff_user({
        ...valid_user,
        display_name: "Alex",
        profile_color: "#ff0000",
      }),
    ).toEqual({
      ...valid_user,
      display_name: "Alex",
      profile_color: "#ff0000",
    });
  });

  it("drops empty and null optional fields", () => {
    expect(
      parse_handoff_user({
        ...valid_user,
        display_name: "",
        profile_color: null,
      }),
    ).toEqual(valid_user);
  });

  it("rejects invalid users", () => {
    expect(parse_handoff_user({ ...valid_user, id: "x" })).toBeNull();
    expect(
      parse_handoff_user({ ...valid_user, email: "no-at-sign" }),
    ).toBeNull();
    expect(parse_handoff_user({ ...valid_user, username: "" })).toBeNull();
    expect(
      parse_handoff_user({ ...valid_user, username: "a".repeat(257) }),
    ).toBeNull();
    expect(parse_handoff_user({ ...valid_user, display_name: 42 })).toBeNull();
  });
});

describe("parse_handoff_session", () => {
  it("accepts a valid session", () => {
    expect(parse_handoff_session(valid_session)).toEqual(valid_session);
  });

  it("rejects extra keys, oversize and non-base64 values", () => {
    expect(parse_handoff_session({ ...valid_session, token: "t" })).toBeNull();
    expect(
      parse_handoff_session({ ...valid_session, passphrase: "" }),
    ).toBeNull();
    expect(
      parse_handoff_session({
        ...valid_session,
        passphrase: "p".repeat(4097),
      }),
    ).toBeNull();
    expect(
      parse_handoff_session({ ...valid_session, encrypted_vault: "<script>" }),
    ).toBeNull();
    expect(
      parse_handoff_session({ ...valid_session, vault_nonce: "a b" }),
    ).toBeNull();
    expect(
      parse_handoff_session({ ...valid_session, user: { id: USER_ID } }),
    ).toBeNull();
  });
});

describe("parse_handoff_bridge_reply", () => {
  it("parses each reply type", () => {
    expect(
      parse_handoff_bridge_reply(
        build_handoff_message({ type: "probe_result", available: true }),
      ),
    ).toEqual({ type: "probe_result", available: true });
    expect(
      parse_handoff_bridge_reply(
        build_handoff_message({ type: "unavailable" }),
      ),
    ).toEqual({ type: "unavailable" });
    expect(
      parse_handoff_bridge_reply(
        build_handoff_message({ type: "session", session: valid_session }),
      ),
    ).toEqual({ type: "session", session: valid_session });
  });

  it("rejects malformed replies", () => {
    expect(
      parse_handoff_bridge_reply(
        build_handoff_message({ type: "probe_result", available: "yes" }),
      ),
    ).toBeNull();
    expect(
      parse_handoff_bridge_reply(
        build_handoff_message({
          type: "session",
          session: { ...valid_session, passphrase: 1 },
        }),
      ),
    ).toBeNull();
    expect(parse_handoff_bridge_reply({ type: "unavailable" })).toBeNull();
  });
});
