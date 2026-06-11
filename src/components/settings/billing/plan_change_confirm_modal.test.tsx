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

import { PlanChangeConfirmModal } from "./plan_change_confirm_modal";
import { preview_plan_change } from "@/services/api/billing";

vi.mock("@/services/api/billing", () => ({
  preview_plan_change: vi.fn(),
  format_price: (cents: number) => `$${(cents / 100).toFixed(2)}`,
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/components/ui/modal", () => ({
  Modal: ({
    is_open,
    children,
  }: {
    is_open: boolean;
    children?: unknown;
  }) => (is_open ? <div data-testid="modal">{children as never}</div> : null),
  ModalHeader: ({ children }: { children?: unknown }) => (
    <div>{children as never}</div>
  ),
  ModalTitle: ({ children }: { children?: unknown }) => (
    <h2>{children as never}</h2>
  ),
  ModalDescription: ({ children }: { children?: unknown }) => (
    <p>{children as never}</p>
  ),
  ModalBody: ({ children }: { children?: unknown }) => (
    <div>{children as never}</div>
  ),
  ModalFooter: ({ children }: { children?: unknown }) => (
    <div>{children as never}</div>
  ),
}));

vi.mock("@aster/ui", () => ({
  Button: ({
    children,
    disabled,
    onClick,
  }: {
    children?: unknown;
    disabled?: boolean;
    onClick?: () => void;
  }) => (
    <button disabled={disabled} onClick={onClick}>
      {children as never}
    </button>
  ),
}));

const mocked_preview = vi.mocked(preview_plan_change);

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("PlanChangeConfirmModal", () => {
  let container: HTMLDivElement;
  let root: Root;

  const render_modal = async (
    overrides: Partial<Parameters<typeof PlanChangeConfirmModal>[0]> = {},
  ) => {
    const props = {
      open: true,
      plan_name: "Family",
      plan_code: "family",
      billing_interval: "year",
      is_confirming: false,
      on_close: vi.fn(),
      on_confirm: vi.fn(),
      ...overrides,
    };

    await act(async () => {
      root.render(<PlanChangeConfirmModal {...props} />);
    });

    return props;
  };

  const confirm_button = () => {
    const buttons = Array.from(container.querySelectorAll("button"));

    return buttons.find((b) =>
      b.textContent?.includes("plan_change_confirm_button"),
    ) as HTMLButtonElement;
  };

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mocked_preview.mockReset();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("disables confirm while the preview is loading", async () => {
    mocked_preview.mockReturnValue(new Promise(() => {}));

    await render_modal();

    expect(mocked_preview).toHaveBeenCalledWith("family", "year");
    expect(confirm_button().disabled).toBe(true);
    expect(container.textContent).not.toContain("plan_change_due_today");
  });

  it("shows credit and amount due, enabling confirm, when the preview loads", async () => {
    mocked_preview.mockResolvedValue({
      data: { credit_cents: 8000, amount_due_cents: 4399, currency: "usd" },
    });

    const props = await render_modal();

    expect(container.textContent).toContain("plan_change_credit");
    expect(container.textContent).toContain("-$80.00");
    expect(container.textContent).toContain("plan_change_due_today");
    expect(container.textContent).toContain("$43.99");

    const button = confirm_button();

    expect(button.disabled).toBe(false);

    await act(async () => {
      button.click();
    });
    expect(props.on_confirm).toHaveBeenCalledTimes(1);
  });

  it("hides the credit row when there is no credit", async () => {
    mocked_preview.mockResolvedValue({
      data: { credit_cents: 0, amount_due_cents: 4399, currency: "usd" },
    });

    await render_modal();

    expect(container.textContent).not.toContain("plan_change_credit");
    expect(container.textContent).toContain("plan_change_due_today");
    expect(confirm_button().disabled).toBe(false);
  });

  it("shows an error and keeps confirm disabled when the preview fails", async () => {
    mocked_preview.mockResolvedValue({ error: "stripe_error" });

    const props = await render_modal();

    expect(container.textContent).toContain("plan_change_preview_failed");
    expect(container.textContent).not.toContain("plan_change_due_today");

    const button = confirm_button();

    expect(button.disabled).toBe(true);

    await act(async () => {
      button.click();
    });
    expect(props.on_confirm).not.toHaveBeenCalled();
  });

  it("keeps confirm disabled while confirming", async () => {
    mocked_preview.mockResolvedValue({
      data: { credit_cents: 8000, amount_due_cents: 4399, currency: "usd" },
    });

    await render_modal({ is_confirming: true });

    expect(confirm_button()).toBeUndefined();
    const buttons = Array.from(container.querySelectorAll("button"));
    const confirming = buttons.find((b) =>
      b.textContent?.includes("plan_change_confirming"),
    ) as HTMLButtonElement;

    expect(confirming.disabled).toBe(true);
  });

  it("ignores a stale preview after the modal is closed and reopened", async () => {
    let resolve_first:
      | ((value: {
          data: { credit_cents: number; amount_due_cents: number; currency: string };
        }) => void)
      | undefined;

    mocked_preview.mockReturnValueOnce(
      new Promise((resolve) => {
        resolve_first = resolve;
      }),
    );

    await render_modal();
    await render_modal({ open: false });

    mocked_preview.mockResolvedValue({
      data: { credit_cents: 0, amount_due_cents: 4399, currency: "usd" },
    });
    await render_modal();

    await act(async () => {
      resolve_first?.({
        data: { credit_cents: 99999, amount_due_cents: 1, currency: "usd" },
      });
    });

    expect(container.textContent).not.toContain("$999.99");
    expect(container.textContent).toContain("$43.99");
  });
});
