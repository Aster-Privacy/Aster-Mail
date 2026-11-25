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

import { scheduled_failure_message_key } from "@/components/scheduled/scheduled_failure";

describe("scheduled_failure_message_key", () => {
  it("explains a refused sending address", () => {
    expect(scheduled_failure_message_key("ALIAS_SENDING_DISABLED")).toBe(
      "mail.scheduled_send_failed_sending_disabled",
    );
  });

  it("keeps the generic message for anything else", () => {
    expect(scheduled_failure_message_key(undefined)).toBe(
      "mail.scheduled_send_failed",
    );
    expect(scheduled_failure_message_key("smtp timeout")).toBe(
      "mail.scheduled_send_failed",
    );
  });
});
