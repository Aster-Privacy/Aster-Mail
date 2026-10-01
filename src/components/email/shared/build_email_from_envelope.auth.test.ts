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
import type { DecryptedEnvelope } from "@/types/email";

import { describe, it, expect } from "vitest";

import { build_single_thread_message } from "@/components/email/shared/build_email_from_envelope";

describe("build_single_thread_message", () => {
  it("keeps the authentication results the server recorded", () => {
    const message = build_single_thread_message(
      {
        id: "m1",
        item_type: "received",
        created_at: "2026-09-30T10:00:00Z",
        is_external: true,
        spf_result: "pass",
        dkim_result: "fail",
        dmarc_result: "none",
      },
      {
        subject: "Hello",
        from: { name: "Shop", email: "news@shop.test" },
        to: [],
        cc: [],
        bcc: [],
        sent_at: "2026-09-30T10:00:00Z",
      } as unknown as DecryptedEnvelope,
      "body",
      undefined,
      null,
    );

    expect([
      message.spf_result,
      message.dkim_result,
      message.dmarc_result,
    ]).toEqual(["pass", "fail", "none"]);
  });
});
