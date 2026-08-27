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

import { StorageSection } from "./storage_section";

import { empty_spam } from "@/services/api/mail";
import { get_storage_overview } from "@/services/api/storage";

vi.mock("@/services/api/mail", () => ({
  empty_spam: vi.fn(),
  empty_trash: vi.fn(),
}));

vi.mock("@/services/api/storage", () => ({
  get_storage_overview: vi.fn(),
}));

vi.mock("@/services/api/billing", () => ({
  cancel_storage_addon: vi.fn(),
  get_credits: vi.fn(async () => ({ data: null })),
  get_storage_addons: vi.fn(async () => ({ data: null })),
  purchase_storage_addon: vi.fn(),
  format_price: (cents: number) => `$${(cents / 100).toFixed(2)}`,
}));

vi.mock("@/services/api/request_cache", () => ({
  request_cache: { invalidate: vi.fn() },
}));

vi.mock("@/hooks/use_mail_stats", () => ({
  invalidate_mail_stats: vi.fn(),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: vi.fn(),
}));

vi.mock("@/components/settings/billing/storage_addons_section", () => ({
  StorageAddonsSection: () => null,
}));

const mocked_overview = vi.mocked(get_storage_overview);
const mocked_empty_spam = vi.mocked(empty_spam);

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const OVERVIEW = {
  total_used_bytes: 1000,
  total_limit_bytes: 10000,
  percentage_used: 10,
  categories: [
    { name: "spam", bytes_used: 1000, item_count: 4 },
    { name: "emails", bytes_used: 0, item_count: 0 },
  ],
};

describe("StorageSection spam cleanup", () => {
  let container: HTMLDivElement;
  let root: Root;

  const find_button = (text: string) =>
    Array.from(document.body.querySelectorAll("button")).find(
      (button) =>
        button.textContent?.includes(text) || button.ariaLabel === text,
    ) as HTMLButtonElement | undefined;

  beforeEach(async () => {
    vi.clearAllMocks();
    mocked_overview.mockResolvedValue({ data: OVERVIEW } as never);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<StorageSection />);
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("runs the purge and re-enables the button when confirmed", async () => {
    let resolve_purge: (value: unknown) => void = () => {};

    mocked_empty_spam.mockReturnValue(
      new Promise((resolve) => {
        resolve_purge = resolve;
      }) as never,
    );

    const empty_button = find_button("mail.empty_spam");

    expect(empty_button).toBeTruthy();
    await act(async () => {
      empty_button?.click();
    });

    const confirm_button = find_button("common.confirm");

    expect(confirm_button).toBeTruthy();
    await act(async () => {
      confirm_button?.click();
    });

    const action_button = document.body.querySelector(
      "button.aster_btn_destructive",
    ) as HTMLButtonElement | null;

    expect(mocked_empty_spam).toHaveBeenCalledTimes(1);
    expect(action_button?.disabled).toBe(true);
    expect(action_button?.querySelector("svg.animate-spin")).toBeTruthy();

    await act(async () => {
      resolve_purge({ data: { success: true, deleted_count: 4 } });
    });

    expect(
      document.body.querySelector("button.aster_btn_destructive"),
    ).toBeNull();
    expect(find_button("mail.empty_spam")?.disabled).toBe(false);
  });
});
