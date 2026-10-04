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

const stored_ids: string[] = [];
const created_folders: string[] = [];
const created_tags: string[] = [];
const stored_tag_tokens = new Map<string, string[]>();
const duplicate_hashes = new Set<string>();

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({
    vault: { identity_key: "test-identity-key" },
    user: { email: "me@astermail.org" },
  }),
}));

vi.mock("@/hooks/use_folders", () => ({
  use_folders: () => ({
    create_new_folder: vi.fn(async (name: string) => {
      created_folders.push(name);

      return { folder: { folder_token: "tok-" + name } };
    }),
    state: { folders: [] },
  }),
}));

vi.mock("@/hooks/use_tags", () => ({
  use_tags: () => ({
    create_new_tag: vi.fn(async (name: string) => {
      created_tags.push(name);

      return { name, tag_token: "tag-" + name };
    }),
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
  check_duplicates: vi.fn(async (_job: string, hashes: string[]) => ({
    data: { duplicates: hashes.filter((h) => duplicate_hashes.has(h)) },
  })),
  store_imported_emails: vi.fn(
    async (
      _job: string,
      batch: { message_id_hash: string; tag_tokens?: string[] }[],
    ) => {
      for (const item of batch) {
        stored_ids.push(item.message_id_hash);
        stored_tag_tokens.set(item.message_id_hash, item.tag_tokens ?? []);
      }

      return {
        data: {
          stored_count: batch.length,
          duplicate_count: 0,
          skipped_quota_count: 0,
          quota_exceeded: false,
        },
      };
    },
  ),
}));

vi.mock("@/services/api/aliases", () => ({
  list_aliases: vi.fn(async () => ({ data: { aliases: [] } })),
  decrypt_aliases: vi.fn(async () => []),
}));

vi.mock("@/services/import/encrypt", () => ({
  encrypt_imported_email: vi.fn(async (email: { message_id: string }) => ({
    message_id_hash: email.message_id,
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

import { update_import_job } from "@/services/api/email_import";
import { compute_message_id_hash } from "@/services/import/parser";

function mbox_message(
  id: string,
  labels: string,
  options: { subject?: string; body?: string } = {},
): string {
  const subject = options.subject ?? `Message ${id}`;
  const body = options.body ?? `Body of ${id}.`;

  return (
    `From 1234@xxx Mon Jun 01 10:00:00 +0000 2026\n` +
    `X-Gmail-Labels: ${labels}\n` +
    `From: Sender <sender@example.com>\n` +
    `To: me@astermail.org\n` +
    `Subject: ${subject}\n` +
    `Date: Mon, 01 Jun 2026 10:00:00 +0000\n` +
    `Message-ID: <${id}@example.com>\n` +
    `Content-Type: text/plain; charset=utf-8\n` +
    `\n` +
    `${body}\n` +
    `\n`
  );
}

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe("ImportModal skip counts and Gmail labels (integration)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    stored_ids.length = 0;
    created_folders.length = 0;
    created_tags.length = 0;
    stored_tag_tokens.clear();
    duplicate_hashes.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("imports nested system-named labels and reports each skip reason", async () => {
    duplicate_hashes.add(
      await compute_message_id_hash("dup@example.com", "test-identity-key"),
    );

    const mbox =
      mbox_message("plain", "Inbox,Opened") +
      mbox_message("team-chat", 'Inbox,Team/Chat,"Taxes, 2025"') +
      mbox_message("project-draft", "Inbox,Projects/Draft") +
      mbox_message("client-archive", "Archived,Clients/Archive") +
      mbox_message("draft-1", "Drafts") +
      mbox_message("draft-2", "Drafts") +
      mbox_message("chat-1", "Chat") +
      mbox_message("dup", "Inbox") +
      mbox_message("empty", "Inbox", { subject: "", body: "" });

    await act(async () => {
      root.render(<ImportModal is_open on_close={() => {}} provider="mbox" />);
    });

    const file_input = container.querySelector(
      'input[type="file"]:not([webkitdirectory])',
    ) as HTMLInputElement | null;

    expect(file_input).not.toBeNull();

    Object.defineProperty(file_input!, "files", {
      configurable: true,
      value: [new File([mbox], "takeout.mbox")],
    });

    await act(async () => {
      file_input!.dispatchEvent(new Event("change", { bubbles: true }));
    });

    for (
      let i = 0;
      i < 200 && !container.textContent?.includes("common.import_complete");
      i++
    ) {
      await flush();
    }

    expect(stored_ids.sort()).toEqual(
      [
        "client-archive@example.com",
        "plain@example.com",
        "project-draft@example.com",
        "team-chat@example.com",
      ].sort(),
    );
    expect(created_folders).toEqual([]);
    expect(created_tags.sort()).toEqual(
      [
        "Archive",
        "Chat",
        "Clients",
        "Draft",
        "Projects",
        "Taxes, 2025",
        "Team",
      ].sort(),
    );
    expect(stored_tag_tokens.get("team-chat@example.com")).toEqual([
      "tag-Chat",
      "tag-Taxes, 2025",
    ]);
    expect(stored_tag_tokens.get("plain@example.com")).toEqual([]);

    const text = container.textContent ?? "";

    expect(text).toContain('settings.emails_imported_count {"count":4}');
    expect(text).toContain('settings.duplicates_skipped {"count":1}');
    expect(text).toContain('settings.import_drafts_chats_skipped {"count":3}');
    expect(text).toContain('settings.import_invalid_skipped {"count":1}');
    expect(text).toContain('settings.import_labels_created {"count":7}');
    expect(text).not.toContain("settings.import_labels_skipped");

    expect(update_import_job).toHaveBeenLastCalledWith("job-1", {
      status: "completed",
      processed_emails: 4,
      skipped_emails: 5,
      failed_emails: 0,
    });
  });

  it("does not call drafts duplicates when nothing is left to import", async () => {
    const mbox =
      mbox_message("draft-1", "Drafts") + mbox_message("chat-1", "Chat");

    await act(async () => {
      root.render(<ImportModal is_open on_close={() => {}} provider="mbox" />);
    });

    const file_input = container.querySelector(
      'input[type="file"]:not([webkitdirectory])',
    ) as HTMLInputElement;

    Object.defineProperty(file_input, "files", {
      configurable: true,
      value: [new File([mbox], "takeout.mbox")],
    });

    await act(async () => {
      file_input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    for (
      let i = 0;
      i < 200 && !container.textContent?.includes("common.import_complete");
      i++
    ) {
      await flush();
    }

    const text = container.textContent ?? "";

    expect(text).toContain('settings.import_drafts_chats_skipped {"count":2}');
    expect(text).not.toContain("settings.duplicates_skipped");
  });
});
