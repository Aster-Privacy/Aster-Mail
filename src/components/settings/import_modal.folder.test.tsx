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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

interface StoredItem {
  message_id_hash: string;
  is_trashed?: boolean;
  is_archived?: boolean;
  is_read?: boolean;
}

const store_calls: number[] = [];
const stored_items: StoredItem[] = [];

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({
    vault: { identity_key: "test-identity-key" },
    user: { email: "me@astermail.org" },
  }),
}));

vi.mock("@/hooks/use_folders", () => ({
  use_folders: () => ({
    create_new_folder: vi.fn(async () => ({ folder: null })),
    state: { folders: [] },
  }),
}));

vi.mock("@/hooks/use_tags", () => ({
  use_tags: () => ({
    create_new_tag: vi.fn(async () => null),
    refresh: vi.fn(async () => {}),
    state: { tags: [], is_loading: false },
  }),
}));

vi.mock("@/provider", () => ({
  use_should_reduce_motion: () => true,
}));

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children?: unknown }) => children as never,
  motion: new Proxy(
    {},
    {
      get:
        () =>
        ({ children, ...rest }: { children?: unknown }) => {
          const { animate, exit, initial, transition, ...dom } = rest as Record<
            string,
            unknown
          >;

          void animate;
          void exit;
          void initial;
          void transition;

          return <div {...(dom as object)}>{children as never}</div>;
        },
    },
  ),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, vars?: Record<string, string>) =>
      vars ? `${key} ${JSON.stringify(vars)}` : key,
  }),
}));

vi.mock("@/services/api/email_import", () => ({
  create_import_job: vi.fn(async () => ({ data: { id: "job-1" } })),
  update_import_job: vi.fn(async () => ({})),
  check_duplicates: vi.fn(async () => ({ data: { duplicates: [] } })),
  store_imported_emails: vi.fn(async (_job: string, batch: StoredItem[]) => {
    store_calls.push(batch.length);
    stored_items.push(...batch);

    return {
      data: {
        stored_count: batch.length,
        duplicate_count: 0,
        skipped_quota_count: 0,
        quota_exceeded: false,
      },
    };
  }),
}));

vi.mock("@/services/api/aliases", () => ({
  list_aliases: vi.fn(async () => ({ data: { aliases: [] } })),
  decrypt_aliases: vi.fn(async () => []),
}));

vi.mock("@/services/import/encrypt", () => ({
  encrypt_imported_email: vi.fn(async (email: { message_id: string }) => ({
    message_id_hash: "h-" + email.message_id,
    encrypted_envelope: "ZW52",
    envelope_nonce: "bm9uY2U=",
    content_hash: "c-" + email.message_id,
    received_at: new Date(0).toISOString(),
  })),
}));

vi.mock("@/hooks/mail_events", async (import_original) => ({
  ...(await import_original<typeof import("@/hooks/mail_events")>()),
  emit_mail_changed: vi.fn(),
}));
vi.mock("@/hooks/use_email_list", () => ({ invalidate_mail_cache: vi.fn() }));
vi.mock("@/services/import/repair_threads", () => ({
  thread_imported_emails: vi.fn(async () => 0),
}));

import { ImportModal } from "./import_modal";

import { store_imported_emails } from "@/services/api/email_import";

function make_eml_file(i: number): File {
  const body =
    `From: sender${i} <sender${i}@example.com>\r\n` +
    `To: me@astermail.org\r\n` +
    `Subject: Test message ${i}\r\n` +
    `Date: Mon, 0${(i % 9) + 1} Jun 2026 10:00:00 +0000\r\n` +
    `Message-ID: <msg-${i}@example.com>\r\n` +
    `Content-Type: text/plain; charset=utf-8\r\n` +
    `\r\n` +
    `Body of message number ${i}.\r\n`;

  return new File([body], `message-${i}.eml`, { type: "message/rfc822" });
}

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe("ImportModal folder selection (integration)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    store_calls.length = 0;
    stored_items.length = 0;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("imports all 300 emails from a folder of 300 .eml files (plus junk)", async () => {
    await act(async () => {
      root.render(<ImportModal is_open on_close={() => {}} provider="mbox" />);
    });

    const folder_input = container.querySelector(
      "input[webkitdirectory]",
    ) as HTMLInputElement | null;

    expect(folder_input).not.toBeNull();

    const files: File[] = [];

    for (let i = 0; i < 300; i++) files.push(make_eml_file(i));
    files.push(new File(["junk"], ".DS_Store"));
    files.push(new File(["PNG"], "photo.png", { type: "image/png" }));

    Object.defineProperty(folder_input!, "files", {
      configurable: true,
      value: files,
    });

    await act(async () => {
      folder_input!.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await vi.waitFor(
      async () => {
        await flush();
        expect(container.textContent).toContain(
          'settings.emails_imported_count {"count":300}',
        );
      },
      { timeout: 20000, interval: 0 },
    );

    expect(store_imported_emails).toHaveBeenCalled();
    expect(store_calls.reduce((a, b) => a + b, 0)).toBe(300);
  });

  it("asks about Trash in an export folder and archives it by default", async () => {
    await act(async () => {
      root.render(<ImportModal is_open on_close={() => {}} provider="mbox" />);
    });

    const folder_input = container.querySelector(
      "input[webkitdirectory]",
    ) as HTMLInputElement;
    const sidecar = (id: number, label_ids: string[]) =>
      new File(
        [
          JSON.stringify({
            Version: 1,
            Payload: {
              ID: `pm-${id}`,
              LabelIDs: label_ids,
              Unread: 0,
              Subject: "x",
            },
          }),
        ],
        `message-${id}.metadata.json`,
      );
    const files: File[] = [];

    for (let i = 0; i < 6; i++) files.push(make_eml_file(i));
    files.push(sidecar(0, ["0", "5", "15"]));
    files.push(sidecar(1, ["0", "5"]));
    files.push(sidecar(2, ["3", "5"]));
    files.push(sidecar(3, ["3", "5", "10"]));
    files.push(sidecar(4, ["3", "5"]));
    files.push(sidecar(5, ["6", "5"]));

    Object.defineProperty(folder_input, "files", {
      configurable: true,
      value: files,
    });

    await act(async () => {
      folder_input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await vi.waitFor(
      async () => {
        await flush();
        expect(container.textContent).toContain(
          "settings.import_review_start",
        );
      },
      { timeout: 20000, interval: 0 },
    );

    expect(container.textContent).toContain(
      'settings.import_review_trash_found {"count":3}',
    );
    expect(stored_items).toEqual([]);

    const start = Array.from(container.querySelectorAll("button")).find(
      (node) => node.textContent?.includes("settings.import_review_start"),
    )!;

    await act(async () => {
      start.click();
    });

    await vi.waitFor(
      async () => {
        await flush();
        expect(container.textContent).toContain(
          'settings.emails_imported_count {"count":6}',
        );
      },
      { timeout: 20000, interval: 0 },
    );

    const by_id = new Map(
      stored_items.map((item) => [item.message_id_hash, item]),
    );

    for (const i of [2, 3, 4]) {
      expect(by_id.get(`h-msg-${i}@example.com`)?.is_trashed).toBeFalsy();
      expect(by_id.get(`h-msg-${i}@example.com`)?.is_archived).toBe(true);
    }
    expect(by_id.get("h-msg-0@example.com")?.is_archived).toBeFalsy();
    expect(by_id.get("h-msg-5@example.com")?.is_archived).toBe(true);
    expect(stored_items.some((item) => item.is_trashed)).toBe(false);
    expect(container.textContent).toContain(
      'settings.import_trash_archived {"count":3}',
    );
  });
});
