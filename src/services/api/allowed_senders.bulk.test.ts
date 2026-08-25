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
import { describe, it, expect, vi, beforeEach } from "vitest";

const { delete_mock } = vi.hoisted(() => ({ delete_mock: vi.fn() }));

vi.mock("./client", () => ({
  api_client: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: delete_mock,
  },
}));

import { bulk_remove_allowed_senders_by_tokens } from "./allowed_senders";

describe("bulk_remove_allowed_senders_by_tokens", () => {
  beforeEach(() => {
    delete_mock.mockReset();
  });

  it("splits the tokens into batches the server accepts", async () => {
    delete_mock.mockResolvedValue({
      data: { success: true, removed_count: 100 },
    });

    const tokens = Array.from({ length: 250 }, (_, i) => `token_${i}`);
    const result = await bulk_remove_allowed_senders_by_tokens(tokens);

    expect(delete_mock).toHaveBeenCalledTimes(3);

    for (const call of delete_mock.mock.calls) {
      const sent = JSON.parse(call[1].body).sender_tokens as string[];

      expect(sent.length).toBeLessThanOrEqual(100);
    }

    expect(result.error).toBeUndefined();
  });

  it("reports a failure when one batch is rejected", async () => {
    delete_mock
      .mockResolvedValueOnce({ data: { success: true, removed_count: 100 } })
      .mockResolvedValueOnce({ error: "rejected" });

    const tokens = Array.from({ length: 150 }, (_, i) => `token_${i}`);
    const result = await bulk_remove_allowed_senders_by_tokens(tokens);

    expect(result.error).toBe("rejected");
  });
});
