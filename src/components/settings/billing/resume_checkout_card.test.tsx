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
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const change_plan_mock = vi.fn();
const clear_target_mock = vi.fn();
const read_target_mock = vi.fn();
const toast_mock = vi.fn();

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key, language: "en" }),
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: toast_mock,
}));

vi.mock("@/services/api/billing", () => ({
  change_plan: change_plan_mock,
  clear_checkout_target: clear_target_mock,
  read_checkout_target: read_target_mock,
}));

const { ResumeCheckoutCard } = await import("./resume_checkout_card");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function render_card(current_plan_code: string | null) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<ResumeCheckoutCard current_plan_code={current_plan_code} />);
  });

  return container;
}

function button_by_text(text: string): HTMLButtonElement {
  const match = Array.from(container!.querySelectorAll("button")).find(
    (node) => node.textContent === text,
  );

  if (!match) throw new Error("button not found: " + text);

  return match;
}

describe("ResumeCheckoutCard", () => {
  beforeEach(async () => {
    change_plan_mock.mockReset();
    clear_target_mock.mockReset();
    read_target_mock.mockReset();
    toast_mock.mockReset();
    change_plan_mock.mockResolvedValue({ ok: true, requires_checkout: true });

    if (root) await act(async () => root!.unmount());

    root = null;
    container?.remove();
    container = null;
  });

  it("prompts to finish a checkout that was abandoned", async () => {
    read_target_mock.mockReturnValue({
      plan_code: "nova",
      billing_interval: "year",
    });

    const node = await render_card("free");

    expect(node.textContent).toContain("settings.finish_plan_setup_title");
    expect(node.textContent).toContain("settings.finish_plan_setup_message");
  });

  it("stays hidden when nothing was abandoned", async () => {
    read_target_mock.mockReturnValue(null);

    const node = await render_card("free");

    expect(node.textContent).toBe("");
  });

  it("clears the target once the plan is live", async () => {
    read_target_mock.mockReturnValue({
      plan_code: "nova",
      billing_interval: "month",
    });

    const node = await render_card("nova");

    expect(node.textContent).toBe("");
    expect(clear_target_mock).toHaveBeenCalled();
  });

  it("reopens checkout for the stored plan and interval", async () => {
    read_target_mock.mockReturnValue({
      plan_code: "star",
      billing_interval: "year",
    });

    await render_card("free");

    await act(async () => {
      button_by_text("settings.finish_plan_setup_action").click();
    });

    expect(change_plan_mock).toHaveBeenCalledWith("star", "year");
    expect(toast_mock).not.toHaveBeenCalled();
  });

  it("reports a checkout that could not be reopened", async () => {
    read_target_mock.mockReturnValue({
      plan_code: "star",
      billing_interval: "month",
    });
    change_plan_mock.mockResolvedValue({ ok: false, requires_checkout: false });

    await render_card("free");

    await act(async () => {
      button_by_text("settings.finish_plan_setup_action").click();
    });

    expect(toast_mock).toHaveBeenCalledWith(
      "settings.failed_checkout",
      "error",
    );
  });

  it("dismisses without reopening checkout", async () => {
    read_target_mock.mockReturnValue({
      plan_code: "star",
      billing_interval: "month",
    });

    const node = await render_card("free");

    await act(async () => {
      button_by_text("common.not_now").click();
    });

    expect(clear_target_mock).toHaveBeenCalled();
    expect(change_plan_mock).not.toHaveBeenCalled();
    expect(node.textContent).toBe("");
  });
});
