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
import { describe, it, expect, vi } from "vitest";

import { save_failed_send_as_draft } from "@/components/compose/compose_failed_send_draft";

const vault = {} as never;

const failed = {
  to: ["me@astermail.org"],
  subject: "photo",
  body: "<p>see attached</p>",
  attachments: [
    {
      id: "att_1",
      name: "photo.jpg",
      size: "4 B",
      size_bytes: 4,
      mime_type: "image/jpeg",
      data: new Uint8Array([1, 2, 3, 4]).buffer,
    },
  ],
} as never;

function make_store(results: boolean[]) {
  const outcomes = [...results];

  return {
    create_context: vi.fn(() => "created"),
    load_context: vi.fn(() => "loaded"),
    save_draft: vi.fn(
      async (_context_id: string, _data: unknown, _vault: unknown) => ({
        success: outcomes.shift() ?? false,
      }),
    ),
    clear_context: vi.fn(),
  };
}

describe("a failed send is saved back to Drafts with its attachments", () => {
  it("creates a new draft that carries the attachment data", async () => {
    const store = make_store([true]);

    await expect(
      save_failed_send_as_draft(store, vault, failed, null),
    ).resolves.toBe(true);

    expect(store.create_context).toHaveBeenCalledWith(
      "new",
      undefined,
      undefined,
    );

    const data = store.save_draft.mock.calls[0][1] as {
      to_recipients: string[];
      attachments: { name: string; data_base64: string }[];
    };

    expect(data.to_recipients).toEqual(["me@astermail.org"]);
    expect(data.attachments).toHaveLength(1);
    expect(data.attachments[0].name).toBe("photo.jpg");
    expect(data.attachments[0].data_base64).toBe("AQIDBA==");
    expect(store.clear_context).toHaveBeenCalledWith("created");
  });

  it("updates the draft that still exists instead of adding a second one", async () => {
    const store = make_store([true]);

    await save_failed_send_as_draft(store, vault, failed, {
      id: "draft_1",
      version: 3,
    });

    expect(store.load_context).toHaveBeenCalledWith(
      "draft_1",
      3,
      "new",
      undefined,
      undefined,
    );
    expect(store.create_context).not.toHaveBeenCalled();
  });

  it("creates a new draft when the kept draft can no longer be updated", async () => {
    const store = make_store([false, true]);

    await expect(
      save_failed_send_as_draft(store, vault, failed, {
        id: "gone",
        version: 1,
      }),
    ).resolves.toBe(true);

    expect(store.create_context).toHaveBeenCalledTimes(1);
    expect(store.clear_context).toHaveBeenCalledWith("loaded");
    expect(store.clear_context).toHaveBeenCalledWith("created");
  });

  it("reports failure when the draft cannot be saved at all", async () => {
    const store = make_store([false]);

    await expect(
      save_failed_send_as_draft(store, vault, failed, null),
    ).resolves.toBe(false);
  });

  it("keeps the reply context of the original message", async () => {
    const store = make_store([true]);

    await save_failed_send_as_draft(store, vault, failed, null, {
      draft_type: "reply",
      reply_to_id: "mail_9",
    } as never);

    expect(store.create_context).toHaveBeenCalledWith(
      "reply",
      "mail_9",
      undefined,
    );
  });
});
