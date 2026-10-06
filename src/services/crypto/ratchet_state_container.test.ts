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
  decode_ratchet_state_container,
  encode_ratchet_state_container,
  next_sync_version,
  ratchet_state_bound_aad,
} from "./ratchet_state_container";

function container(fields: Record<string, unknown>): string {
  return JSON.stringify(fields);
}

const STATE = { root_key: "root", send_message_number: 4 };

describe("ratchet state container", () => {
  it("derives the bound associated data from the conversation", () => {
    expect(new TextDecoder().decode(ratchet_state_bound_aad("conv-a"))).toBe(
      "aster-ratchet-state-v2:conv-a",
    );
  });

  it("moves the version forward even when the clock is behind", () => {
    expect(next_sync_version(10, 500)).toBe(500);
    expect(next_sync_version(900, 500)).toBe(901);
  });

  it("keeps the fields older readers expect and adds the version", () => {
    const encoded = JSON.parse(
      encode_ratchet_state_container(
        { state: STATE, conversation_id: "conv-a" } as never,
        77,
      ),
    );

    expect(encoded).toEqual({
      state: STATE,
      conversation_id: "conv-a",
      sync_version: 77,
    });
  });

  it("accepts a legacy container without a version", () => {
    const result = decode_ratchet_state_container(
      container({ state: STATE, conversation_id: "conv-a" }),
      "conv-a",
      40,
      false,
    );

    expect(result).toEqual({
      kind: "accepted",
      state: { state: STATE, conversation_id: "conv-a" },
      sync_version: null,
    });
  });

  it("accepts a versioned container at or above the floor", () => {
    const result = decode_ratchet_state_container(
      container({ state: STATE, conversation_id: "conv-a", sync_version: 50 }),
      "conv-a",
      50,
      true,
    );

    expect(result.kind).toBe("accepted");
    expect(result.kind === "accepted" && result.sync_version).toBe(50);
  });

  it("refuses a container that names another conversation", () => {
    expect(
      decode_ratchet_state_container(
        container({ state: STATE, conversation_id: "conv-b" }),
        "conv-a",
        0,
        false,
      ).kind,
    ).toBe("wrong_conversation");
  });

  it("refuses a state that names another conversation inside", () => {
    expect(
      decode_ratchet_state_container(
        container({
          state: { ...STATE, conversation_id: "conv-b" },
          conversation_id: "conv-a",
        }),
        "conv-a",
        0,
        false,
      ).kind,
    ).toBe("wrong_conversation");
  });

  it("refuses a version below the floor", () => {
    expect(
      decode_ratchet_state_container(
        container({
          state: STATE,
          conversation_id: "conv-a",
          sync_version: 49,
        }),
        "conv-a",
        50,
        false,
      ).kind,
    ).toBe("rolled_back");
  });

  it("refuses a bound container that lacks the id or the version", () => {
    expect(
      decode_ratchet_state_container(
        container({ state: STATE, sync_version: 50 }),
        "conv-a",
        0,
        true,
      ).kind,
    ).toBe("unbound");
    expect(
      decode_ratchet_state_container(
        container({ state: STATE, conversation_id: "conv-a" }),
        "conv-a",
        0,
        true,
      ).kind,
    ).toBe("unbound");
  });

  it("refuses text that is not a state container", () => {
    for (const text of ["not json", "[]", "null", container({ stub: true })]) {
      expect(
        decode_ratchet_state_container(text, "conv-a", 0, false).kind,
      ).toBe("malformed");
    }
  });
});
