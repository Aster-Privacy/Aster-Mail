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
import { beforeEach, describe, expect, it, vi } from "vitest";

const STORAGE_KEY = "astermail:pending_sends";

async function load_manager() {
  vi.resetModules();

  return (await import("./use_undo_send")).undo_send_manager;
}

describe("undo send restore after a reload", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("drops locally queued sends that can no longer be cancelled", async () => {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        {
          id: "local-1",
          to: [],
          subject: "",
          body: "",
          scheduled_time: Date.now() + 10_000,
          total_seconds: 15,
        },
      ]),
    );

    const manager = await load_manager();

    expect(manager.get_all()).toHaveLength(0);
  });

  it("keeps server queued sends that the server can still cancel", async () => {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        {
          id: "queue-1",
          to: [],
          subject: "",
          body: "",
          scheduled_time: Date.now() + 10_000,
          total_seconds: 15,
          is_server_queued: true,
          server_queue_id: "queue-1",
        },
      ]),
    );

    const manager = await load_manager();

    expect(manager.get_all().map((p) => p.id)).toEqual(["queue-1"]);
  });
});
