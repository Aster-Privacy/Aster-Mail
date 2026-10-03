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
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const h = vi.hoisted(() => ({
  show_action_toast: vi.fn(),
  show_toast: vi.fn(),
  bulk_snooze_emails: vi.fn(),
  emit_mail_items_removed: vi.fn(),
  emit_mail_changed: vi.fn(),
  emit_snoozed_changed: vi.fn(),
  remove_index_ids: vi.fn(),
  reindex_ids: vi.fn(),
  invalidate_mail_stats: vi.fn(),
}));

const LABELS: Record<string, string> = {
  "common.tomorrow": "Tomorrow",
  "common.later": "Later",
};

vi.mock("@/lib/i18n/context", () => {
  const t = (key: string, params?: Record<string, string | number>) =>
    params
      ? `${LABELS[key] ?? key} ${JSON.stringify(params)}`
      : (LABELS[key] ?? key);
  const i18n = { t };

  return { use_i18n: () => i18n };
});

vi.mock("framer-motion", () => ({
  motion: new Proxy(
    {},
    {
      get:
        () =>
        ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    },
  ),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("@/provider", () => ({
  use_should_reduce_motion: () => true,
}));

vi.mock("@/lib/overlay_layer_stack", () => ({
  use_escape_layer: () => {},
}));

vi.mock("@/components/toast/action_toast", () => ({
  show_action_toast: h.show_action_toast,
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: h.show_toast,
}));

vi.mock("@/services/api/snooze", () => ({
  bulk_snooze_emails: h.bulk_snooze_emails,
}));

vi.mock("@/hooks/mail_events", () => ({
  emit_mail_items_removed: h.emit_mail_items_removed,
  emit_mail_changed: h.emit_mail_changed,
  emit_snoozed_changed: h.emit_snoozed_changed,
}));

vi.mock("@/services/category_index", () => ({
  remove_ids: h.remove_index_ids,
  reindex_ids: h.reindex_ids,
}));

vi.mock("@/hooks/use_mail_stats", () => ({
  invalidate_mail_stats: h.invalidate_mail_stats,
}));

vi.mock("@/hooks/use_folders", () => ({
  has_protected_folder_label: () => false,
}));

vi.mock("@/services/bulk_mail_scan", () => ({
  DECRYPT_YIELD_CHUNK: 25,
  scan_received_items: vi.fn(async () => ({
    items: ["m1", "m2", "m3"].map((id) => ({
      id,
      encrypted_envelope: "env",
      envelope_nonce: "nonce",
      labels: [],
      metadata: {},
    })),
    failed: false,
  })),
  decrypt_items_metadata_for_action: vi.fn(async () => {}),
}));

vi.mock("@/components/email/shared/decrypt_envelope", () => ({
  decrypt_mail_envelope: vi.fn(async () => ({
    from: { name: "News", email: "news@example.com" },
  })),
}));

vi.mock("@/utils/date_format", async (import_original) => ({
  ...(await import_original<object>()),
  format_datetime_hint: () => "Mon, Oct 5, 9:00 AM",
}));

vi.mock("@/components/modals/custom_snooze_modal", () => ({
  CustomSnoozeModal: ({
    is_open,
    on_snooze,
  }: {
    is_open: boolean;
    on_snooze: (date: Date) => void;
  }) =>
    is_open ? (
      <button
        data-testid="pick-custom"
        type="button"
        onClick={() => on_snooze(new Date("2026-10-05T09:00:00Z"))}
      >
        pick
      </button>
    ) : null,
}));

const { SnoozeSimilarModal } = await import("./snooze_similar_modal");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ALL_IDS = ["m1", "m2", "m3"];

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function button_with_text(text: string): HTMLButtonElement {
  const button = Array.from(container!.querySelectorAll("button")).find((b) =>
    (b.textContent ?? "").includes(text),
  );

  if (!button) throw new Error(`button not found: ${text}`);

  return button as HTMLButtonElement;
}

async function flush() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function open_and_snooze(pick: "preset" | "custom") {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(<SnoozeSimilarModal is_open on_close={() => {}} />);
  });
  await flush();

  act(() => button_with_text("news@example.com").click());

  if (pick === "preset") {
    act(() => button_with_text("Tomorrow").click());
  } else {
    act(() => button_with_text("mail.pick_date_time").click());
    act(() => {
      (
        document.querySelector("[data-testid=pick-custom]") as HTMLButtonElement
      ).click();
    });
  }

  act(() => button_with_text("mail.snooze").click());
  await flush();
}

function failure_action_toasts() {
  return h.show_action_toast.mock.calls.filter(([options]) =>
    String(options.message).startsWith("common.failed_to_snooze_emails"),
  );
}

describe("SnoozeSimilarModal results", () => {
  beforeEach(() => {
    for (const fn of Object.values(h)) fn.mockReset();
  });

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    root = null;
    container = null;
  });

  it("reports an API error with the error toast, not the success style", async () => {
    h.bulk_snooze_emails.mockResolvedValue({ error: "boom" });
    await open_and_snooze("preset");

    expect(failure_action_toasts()).toHaveLength(0);
    expect(h.show_toast).toHaveBeenCalledWith(
      "common.failed_to_snooze_emails",
      "error",
    );
    expect(h.emit_mail_items_removed).not.toHaveBeenCalled();
  });

  it("reports a thrown request with the error toast", async () => {
    h.bulk_snooze_emails.mockRejectedValue(new Error("network"));
    await open_and_snooze("preset");

    expect(failure_action_toasts()).toHaveLength(0);
    expect(h.show_toast).toHaveBeenCalledWith(
      "common.failed_to_snooze_emails",
      "error",
    );
  });

  it("treats a result with nothing snoozed as a failure", async () => {
    h.bulk_snooze_emails.mockResolvedValue({
      data: { snoozed_count: 0, failed_count: 3 },
    });
    await open_and_snooze("preset");

    expect(h.show_toast).toHaveBeenCalledWith(
      "common.failed_to_snooze_emails",
      "error",
    );
    expect(h.emit_mail_items_removed).not.toHaveBeenCalled();
    expect(h.remove_index_ids).not.toHaveBeenCalled();
    expect(container!.textContent).not.toContain("common.emails_snoozed");
  });

  it("keeps messages that were not snoozed on a partial result", async () => {
    h.bulk_snooze_emails.mockResolvedValue({
      data: { snoozed_count: 1, failed_count: 2 },
    });
    await open_and_snooze("preset");

    expect(h.emit_mail_items_removed).not.toHaveBeenCalled();
    expect(h.remove_index_ids).not.toHaveBeenCalled();
    expect(h.reindex_ids).toHaveBeenCalledWith(ALL_IDS);
    expect(h.emit_mail_changed).toHaveBeenCalled();
    expect(h.show_toast).toHaveBeenCalledWith(
      `common.bulk_action_partially_applied ${JSON.stringify({ count: 1, total: 3 })}`,
      "warning",
    );
  });

  it("removes every id when all of them were snoozed", async () => {
    h.bulk_snooze_emails.mockResolvedValue({
      data: { snoozed_count: 3, failed_count: 0 },
    });
    await open_and_snooze("preset");

    expect(h.emit_mail_items_removed).toHaveBeenCalledWith({ ids: ALL_IDS });
    expect(h.show_toast).not.toHaveBeenCalled();
    const [options] = h.show_action_toast.mock.calls[0];

    expect(options.action_type).toBe("snooze");
    expect(options.message).toContain('"time":"tomorrow"');
  });

  it("keeps the case of a custom date in the success toast", async () => {
    h.bulk_snooze_emails.mockResolvedValue({
      data: { snoozed_count: 3, failed_count: 0 },
    });
    await open_and_snooze("custom");

    const [options] = h.show_action_toast.mock.calls[0];

    expect(options.message).toContain('"time":"Mon, Oct 5, 9:00 AM"');
    expect(container!.textContent).toContain("Mon, Oct 5, 9:00 AM");
    expect(container!.textContent).not.toContain("mon, oct 5");
  });
});
