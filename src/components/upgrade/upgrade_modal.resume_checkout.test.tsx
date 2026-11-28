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
import { MemoryRouter } from "react-router-dom";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const review_props = vi.fn();
let checkout_target: { plan_code: string; billing_interval: string } | null =
  null;

vi.mock("@/provider", () => ({
  use_should_reduce_motion: () => true,
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key, language: "en" }),
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({ is_authenticated: true, user: { id: "user_1" } }),
}));

const refresh_limits = vi.fn();

vi.mock("@/hooks/use_plan_limits", () => ({
  use_plan_limits: () => ({
    limits: null,
    plan_code: "free",
    is_loading: false,
    load_failed: false,
    refresh: refresh_limits,
  }),
}));

vi.mock("@/services/api/billing", () => ({
  change_plan: vi.fn(),
  format_price: (cents: number) => String(cents),
  start_hosted_checkout: vi.fn(),
  get_currency_rates: vi.fn(async () => ({ data: null })),
  read_checkout_target: () => checkout_target,
  clear_checkout_target: vi.fn(),
}));

vi.mock("@/stores/special_offer_status", () => ({
  use_special_offer_status: () => ({ status: null, is_loaded: true }),
}));

vi.mock("@/components/settings/billing/plan_features_modal", () => ({
  PlanFeaturesModal: () => null,
}));

vi.mock("@/components/settings/billing/plan_payment_method_modal", () => ({
  PlanPaymentMethodModal: (props: {
    open: boolean;
    plan_name: string;
    selected_term: string;
    on_close: () => void;
  }) => {
    review_props(props);

    if (!props.open) return null;

    return (
      <div role="dialog">
        <span>review:{props.plan_name}</span>
        <button type="button" onClick={props.on_close}>
          close_review
        </button>
      </div>
    );
  },
}));

vi.mock("@/components/settings/billing/crypto_term_modal", () => ({
  CryptoTermModal: () => null,
}));

vi.mock("@/components/settings/billing/plan_change_confirm_modal", () => ({
  PlanChangeConfirmModal: () => null,
}));

import { UpgradeModal } from "./upgrade_modal";

import { ResumeCheckoutCard } from "@/components/settings/billing/resume_checkout_card";
import {
  close_upgrade_modal,
  get_upgrade_snapshot,
} from "@/stores/upgrade_store";

const PICKER_TITLE = "settings.upgrade_resume_title";

let container: HTMLDivElement;
let root: Root;
let observer: MutationObserver;
let picker_seen = false;
let max_dialogs = 0;

function dialogs(): Element[] {
  return Array.from(document.body.querySelectorAll("[role=dialog]"));
}

function track_dialogs() {
  const dialog_count = dialogs().length;

  max_dialogs = Math.max(max_dialogs, dialog_count);
  if (document.body.textContent?.includes(PICKER_TITLE)) picker_seen = true;
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function mount_billing_page() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={["/settings/billing"]}>
        <ResumeCheckoutCard current_plan_code="free" />
        <UpgradeModal />
      </MemoryRouter>,
    );
  });
  await flush();
}

function click_text(text: string) {
  const button = Array.from(document.body.querySelectorAll("button")).find(
    (node) => node.textContent === text,
  );

  if (!button) throw new Error("button not found: " + text);

  return act(async () => {
    button.click();
  });
}

describe("resuming an abandoned checkout", () => {
  beforeEach(() => {
    review_props.mockReset();
    refresh_limits.mockReset();
    picker_seen = false;
    max_dialogs = 0;
    observer = new MutationObserver(track_dialogs);
    observer.observe(document.body, { childList: true, subtree: true });
  });

  afterEach(async () => {
    observer.disconnect();
    await act(async () => {
      root.unmount();
    });
    container.remove();
    close_upgrade_modal();
    checkout_target = null;
  });

  it("opens one checkout dialog for the abandoned plan and term", async () => {
    checkout_target = { plan_code: "star", billing_interval: "month" };
    await mount_billing_page();

    await click_text("settings.finish_plan_setup_action");
    await flush();
    track_dialogs();

    expect(dialogs()).toHaveLength(1);
    expect(max_dialogs).toBe(1);
    expect(picker_seen).toBe(false);
    expect(document.body.textContent).toContain("review:Star");

    const last_open = review_props.mock.calls
      .map(([props]) => props)
      .filter((props) => props.open)
      .at(-1);

    expect(last_open?.selected_term).toBe("monthly");
    expect(refresh_limits).toHaveBeenCalledTimes(1);
  });

  it("keeps one dialog when the button is pressed twice", async () => {
    checkout_target = { plan_code: "star", billing_interval: "year" };
    await mount_billing_page();

    await click_text("settings.finish_plan_setup_action");
    await click_text("settings.finish_plan_setup_action");
    await flush();
    track_dialogs();

    expect(dialogs()).toHaveLength(1);
    expect(max_dialogs).toBe(1);
    expect(picker_seen).toBe(false);
  });

  it("closes everything when the checkout dialog is closed", async () => {
    checkout_target = { plan_code: "star", billing_interval: "year" };
    await mount_billing_page();

    await click_text("settings.finish_plan_setup_action");
    await flush();
    await click_text("close_review");
    await flush();
    track_dialogs();

    expect(dialogs()).toHaveLength(0);
    expect(picker_seen).toBe(false);
    expect(get_upgrade_snapshot().is_open).toBe(false);
  });
});
