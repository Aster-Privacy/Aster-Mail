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

import { viewer_still_showing } from "@/components/email/thread_reply_target";

describe("viewer_still_showing", () => {
  it("accepts a refresh for the thread the viewer still shows", () => {
    expect(
      viewer_still_showing(
        { email_id: "email_a", thread_token: "thread_a" },
        { thread_token: "thread_a", original_email_id: "email_a" },
      ),
    ).toBe(true);
  });

  it("accepts a refresh for a sibling message of the open thread", () => {
    expect(
      viewer_still_showing(
        { email_id: "email_b", thread_token: "thread_a" },
        { thread_token: "thread_a", original_email_id: "email_a" },
      ),
    ).toBe(true);
  });

  it("rejects a refresh after the viewer moved to another thread", () => {
    expect(
      viewer_still_showing(
        { email_id: "email_b", thread_token: "thread_b" },
        { thread_token: "thread_a", original_email_id: "email_a" },
      ),
    ).toBe(false);
  });

  it("accepts a refresh for the open email before its thread token is known", () => {
    expect(
      viewer_still_showing(
        { email_id: "email_a", thread_token: null },
        { thread_token: "thread_a", original_email_id: "email_a" },
      ),
    ).toBe(true);
  });

  it("rejects a refresh with no thread token match and no originating email", () => {
    expect(
      viewer_still_showing(
        { email_id: "email_b", thread_token: null },
        { thread_token: "thread_a", original_email_id: null },
      ),
    ).toBe(false);
  });

  it("rejects a refresh once the viewer has closed", () => {
    expect(
      viewer_still_showing(
        { email_id: null, thread_token: null },
        { thread_token: "thread_a", original_email_id: "email_a" },
      ),
    ).toBe(false);
  });
});
