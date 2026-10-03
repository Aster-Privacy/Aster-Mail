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
import { describe, it, expect, vi, beforeEach } from "vitest";

const list_mail_items = vi.fn();
const decrypt_mail_envelope = vi.fn();
const locked_tokens = new Set<string>();

vi.mock("@/services/api/mail", () => ({
  list_mail_items: (...args: unknown[]) => list_mail_items(...args),
}));

vi.mock("@/services/api/attachments", () => ({
  list_attachments: vi.fn(),
}));

vi.mock("@/services/locked_folders", () => ({
  get_locked_folder_tokens: () => new Set(locked_tokens),
  filter_locked_mail_items: <T extends { folder_token?: string }>(items: T[]) =>
    items.filter((item) => !locked_tokens.has(item.folder_token ?? "")),
}));

vi.mock("@/components/email/shared/decrypt_envelope", () => ({
  decrypt_mail_envelope: (...args: unknown[]) => decrypt_mail_envelope(...args),
}));

vi.mock("@/services/crypto/attachment_crypto", () => ({
  decrypt_attachment_meta: vi.fn(),
  decrypt_attachment_data: vi.fn(),
}));

vi.mock("./destination", () => ({
  sink_write_mbox: vi.fn(async () => undefined),
  sink_write_eml: vi.fn(async () => 0),
  sink_finalize: vi.fn(async () => undefined),
}));

import { create_account_message_source } from "./message_source";
import {
  run_export,
  type ExportProgress,
  type ExportScope,
  type RunExportArgs,
} from "./pipeline";

interface FakeItem {
  id: string;
  sent_at: string;
  folder_token: string;
}

const MAILBOX: FakeItem[] = [
  { id: "m1", sent_at: "2024-01-10T10:00:00.000Z", folder_token: "inbox" },
  { id: "m2", sent_at: "2025-03-02T10:00:00.000Z", folder_token: "inbox" },
  { id: "m3", sent_at: "2025-06-10T10:00:00.000Z", folder_token: "inbox" },
  { id: "m4", sent_at: "2025-06-11T10:00:00.000Z", folder_token: "vault" },
  { id: "m5", sent_at: "2025-09-20T10:00:00.000Z", folder_token: "inbox" },
];

function to_api_item(item: FakeItem) {
  return {
    id: item.id,
    encrypted_envelope: item.sent_at,
    envelope_nonce: "nonce",
    created_at: item.sent_at,
    folder_token: item.folder_token,
    item_type: "received",
    has_attachments: false,
  };
}

async function export_with(scope: ExportScope) {
  const progress: ExportProgress[] = [];
  const summary = await run_export({
    scope,
    format: "mbox",
    sink: {} as RunExportArgs["sink"],
    source: create_account_message_source(),
    signal: new AbortController().signal,
    on_progress: (p) => progress.push(p),
  });

  return { summary, progress };
}

describe("account message export totals", () => {
  beforeEach(() => {
    locked_tokens.clear();
    list_mail_items.mockReset();
    decrypt_mail_envelope.mockReset();

    list_mail_items.mockImplementation(async (params: { limit?: number }) => ({
      data: {
        total: MAILBOX.length,
        has_more: false,
        items: MAILBOX.slice(0, params.limit).map(to_api_item),
      },
    }));
    decrypt_mail_envelope.mockImplementation(async (sent_at: string) => ({
      subject: "Quarterly report",
      sent_at,
      from: { email: "sender@example.com", name: "Sender" },
      to: [{ email: "reader@example.com", name: "Reader" }],
      cc: [],
      bcc: [],
      body_text: "Hello",
    }));
  });

  it("does not show the unfiltered mailbox size as the total of a date-range export", async () => {
    const { summary, progress } = await export_with({
      preset: "custom",
      date_from: "2025-06-01",
      date_to: "2025-06-30",
    });

    expect(progress[0].total).toBe(0);
    expect(summary.processed).toBe(2);
    expect(summary.total).toBe(2);
    expect(summary.cancelled).toBe(false);
  });

  it("does not count mail in locked folders towards the total", async () => {
    locked_tokens.add("vault");

    const { summary, progress } = await export_with({ preset: "all" });

    expect(progress[0].total).toBe(0);
    expect(summary.processed).toBe(4);
    expect(summary.total).toBe(4);
  });

  it("keeps the server total when nothing is filtered", async () => {
    const { summary, progress } = await export_with({ preset: "all" });

    expect(progress[0].total).toBe(5);
    expect(summary.processed).toBe(5);
    expect(summary.total).toBe(5);
  });

  it("counts undecryptable messages in the final total", async () => {
    decrypt_mail_envelope.mockImplementation(async (sent_at: string) =>
      sent_at.startsWith("2025-06-10")
        ? null
        : {
            subject: "Quarterly report",
            sent_at,
            from: { email: "sender@example.com", name: "Sender" },
            to: [],
            cc: [],
            bcc: [],
            body_text: "Hello",
          },
    );

    const { summary } = await export_with({
      preset: "custom",
      date_from: "2025-06-01",
      date_to: "2025-06-30",
    });

    expect(summary.processed).toBe(1);
    expect(summary.total).toBe(2);
  });

  it("reports a cancelled run as cancelled and keeps the unknown total", async () => {
    const controller = new AbortController();
    const summary = await run_export({
      scope: { preset: "custom", date_from: "2025-01-01" },
      format: "mbox",
      sink: {} as RunExportArgs["sink"],
      source: create_account_message_source(),
      signal: controller.signal,
      on_progress: (p) => {
        if (p.processed === 1) controller.abort();
      },
    });

    expect(summary.cancelled).toBe(true);
    expect(summary.processed).toBe(1);
    expect(summary.total).toBe(0);
  });
});
