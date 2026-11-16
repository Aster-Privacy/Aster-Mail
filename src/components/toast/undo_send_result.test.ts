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
import { describe, expect, it } from "vitest";

import { plan_undo_send_result } from "./undo_send_result";

describe("plan_undo_send_result", () => {
  it("settles a recalled send as undone", () => {
    expect(plan_undo_send_result("cancelled", false)).toBeNull();
  });

  it("says the message already went out when it is too late", () => {
    expect(plan_undo_send_result("too_late", false)).toEqual({
      message_key: "common.undo_send_already_sent",
      tone: "error",
      keep_undo: false,
    });
  });

  it("never offers undo again once the message went out", () => {
    expect(plan_undo_send_result("too_late", true)?.keep_undo).toBe(false);
  });

  it("points at the connection when the request never reached the server", () => {
    expect(plan_undo_send_result("offline", true)).toEqual({
      message_key: "common.undo_send_failed_offline",
      tone: "error",
      keep_undo: true,
    });
  });

  it("keeps undo available after a server error while the send still waits", () => {
    expect(plan_undo_send_result("failed", true)).toEqual({
      message_key: "common.undo_send_failed",
      tone: "error",
      keep_undo: true,
    });
  });

  it("drops undo after a failure once the send stopped waiting", () => {
    expect(plan_undo_send_result("failed", false)?.keep_undo).toBe(false);
  });
});
