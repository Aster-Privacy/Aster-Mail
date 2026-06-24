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

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const store_calls: number[] = [];

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

vi.mock("@/provider", () => ({
  use_should_reduce_motion: () => true,
}));

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children?: unknown }) =>
    children as never,
  motion: new Proxy(
    {},
    {
      get:
        () =>
        ({ children, ...rest }: { children?: unknown }) => {
          const { animate, exit, initial, transition, ...dom } =
            rest as Record<string, unknown>;

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
  store_imported_emails: vi.fn(async (_job: string, batch: unknown[]) => {
    store_calls.push(batch.length);

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

vi.mock("@/hooks/mail_events", () => ({ emit_mail_changed: vi.fn() }));
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
      root.render(
        <ImportModal is_open on_close={() => {}} provider="mbox" />,
      );
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

    for (let i = 0; i < 60 && store_calls.length === 0; i++) await flush();
    for (let i = 0; i < 60; i++) await flush();

    const total_stored = store_calls.reduce((a, b) => a + b, 0);

    expect(store_imported_emails).toHaveBeenCalled();
    expect(total_stored).toBe(300);
    expect(container.textContent).toContain(
      'settings.emails_imported_count {"count":"300"}',
    );
  });
});
