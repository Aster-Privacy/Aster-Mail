//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { describe, it, expect } from "vitest";

import { plan_reply_cancel } from "./reply_cancel_outcome";

describe("closing a reply while its send is queued", () => {
  it("clears the reply without a notice when the send was cancelled", () => {
    expect(plan_reply_cancel("cancelled")).toEqual({
      toast_key: null,
      is_sent: false,
      keeps_text: false,
    });
  });

  it("reports the reply as sent when the undo window has passed", () => {
    expect(plan_reply_cancel("expired")).toEqual({
      toast_key: "common.undo_send_too_late",
      is_sent: true,
      keeps_text: false,
    });
  });

  it("keeps the text and never claims sent when the cancel request fails", () => {
    expect(plan_reply_cancel("failed")).toEqual({
      toast_key: "common.something_went_wrong_try_again",
      is_sent: false,
      keeps_text: true,
    });
  });
});
