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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { undo_send_manager } from "./undo_send_manager";
import { undo_send_api } from "./api/undo_send";

vi.mock("./api/undo_send", () => ({
  undo_send_api: {
    queue_email: vi.fn(),
    cancel_email: vi.fn(),
    send_now: vi.fn(),
    get_status: vi.fn(),
    get_pending: vi.fn(),
  },
}));

const mocked_api = vi.mocked(undo_send_api);

async function queue_pending(queue_id: string) {
  const scheduled = new Date(Date.now() + 30_000);
  const deadline = new Date(Date.now() + 29_000);

  mocked_api.queue_email.mockResolvedValue({
    data: {
      queue_id,
      scheduled_send_time: scheduled.toISOString(),
      can_cancel_until: deadline.toISOString(),
      delay_seconds: 30,
    },
  } as never);

  await undo_send_manager.queue_email({
    to: ["a@astermail.org"],
    subject: "hi",
    body: "b",
    delay_seconds: 30,
  } as never);
}

describe("cancel_send_with_reason server outcomes", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocked_api.get_pending.mockResolvedValue({
      data: { emails: [] },
    } as never);
  });

  afterEach(() => {
    undo_send_manager.destroy();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("reports a conflict as already sent", async () => {
    await queue_pending("q-conflict");
    mocked_api.cancel_email.mockResolvedValue({
      error: "cannot cancel email: already being sent",
      code: "CONFLICT",
      status: 409,
    } as never);

    await expect(
      undo_send_manager.cancel_send_with_reason("q-conflict"),
    ).resolves.toBe("expired");
  });

  it("reports a network failure as offline", async () => {
    await queue_pending("q-network");
    mocked_api.cancel_email.mockResolvedValue({
      error: "Network error",
      code: "NETWORK_ERROR",
    } as never);

    await expect(
      undo_send_manager.cancel_send_with_reason("q-network"),
    ).resolves.toBe("offline");
  });

  it("reports a timeout as offline", async () => {
    await queue_pending("q-timeout");
    mocked_api.cancel_email.mockResolvedValue({
      error: "Timed out",
      code: "TIMEOUT_ERROR",
    } as never);

    await expect(
      undo_send_manager.cancel_send_with_reason("q-timeout"),
    ).resolves.toBe("offline");
  });

  it("reports a server error as failed", async () => {
    await queue_pending("q-server");
    mocked_api.cancel_email.mockResolvedValue({
      error: "Internal error",
      code: "SERVER_ERROR",
      status: 500,
    } as never);

    await expect(
      undo_send_manager.cancel_send_with_reason("q-server"),
    ).resolves.toBe("failed");
  });

  it("cancels when the server accepts", async () => {
    await queue_pending("q-ok");
    mocked_api.cancel_email.mockResolvedValue({
      data: { success: true },
    } as never);

    await expect(
      undo_send_manager.cancel_send_with_reason("q-ok"),
    ).resolves.toBe("cancelled");
  });
});
