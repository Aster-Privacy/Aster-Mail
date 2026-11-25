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
import type { CustomDomain } from "@/services/api/domains";
import type { MtaStsView } from "@/services/api/mta_sts";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const stable = vi.hoisted(() => ({
  i18n: {
    t: (key: string, params?: Record<string, string>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  },
}));

const prompt_upgrade = vi.fn();
const modal_props = vi.fn();

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => stable.i18n,
}));

vi.mock("@/components/settings/aliases/feature_lock", () => ({
  prompt_upgrade: (...args: unknown[]) => prompt_upgrade(...args),
}));

vi.mock("./mta_sts_modal", () => ({
  MtaStsModal: (props: { is_open: boolean }) => {
    modal_props(props);

    return props.is_open ? <div data-testid="mta-sts-modal-open" /> : null;
  },
}));

const { MtaStsRow } = await import("./mta_sts_row");
const { mta_sts_action_error, mta_sts_attention_message, mta_sts_row_message } =
  await import("./mta_sts_copy");

let container: HTMLDivElement;
let root: Root;

function make_domain(overrides: Partial<CustomDomain> = {}): CustomDomain {
  return {
    id: "d1",
    domain_name: "example.com",
    status: "active",
    mta_sts_available: true,
    mta_sts_state: "off",
    ...overrides,
  } as CustomDomain;
}

function render(domain: CustomDomain) {
  act(() => {
    root.render(<MtaStsRow domain={domain} on_changed={() => undefined} />);
  });
}

function button(): HTMLButtonElement {
  const found = container.querySelector("button");

  if (!found) throw new Error("no button");

  return found as HTMLButtonElement;
}

beforeEach(() => {
  (
    globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  prompt_upgrade.mockReset();
  modal_props.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("MtaStsRow", () => {
  it("offers setup on a verified domain and opens the modal", () => {
    render(make_domain());

    expect(container.textContent).toContain("settings.mta_sts_row_off");
    expect(button().textContent).toBe("settings.mta_sts_set_up");
    expect(button().disabled).toBe(false);
    act(() => button().click());
    expect(
      container.querySelector('[data-testid="mta-sts-modal-open"]'),
    ).not.toBeNull();
  });

  it("shows the upgrade prompt when the plan lacks the feature", () => {
    render(make_domain({ mta_sts_state: "locked" }));

    expect(container.textContent).toContain("settings.mta_sts_state_locked");
    expect(container.textContent).toContain("settings.mta_sts_row_locked");
    act(() => button().click());
    expect(prompt_upgrade).toHaveBeenCalledWith(
      "settings.mta_sts_locked_description",
      undefined,
      "has_mta_sts_hosting",
    );
    expect(modal_props).not.toHaveBeenCalled();
  });

  it("disables setup until the domain is verified", () => {
    render(make_domain({ status: "pending" }));

    expect(container.textContent).toContain("settings.mta_sts_row_inactive");
    expect(button().disabled).toBe(true);
    expect(modal_props).not.toHaveBeenCalled();
  });

  it("keeps a retiring policy manageable on an unverified domain", () => {
    render(make_domain({ status: "pending", mta_sts_state: "retiring" }));

    expect(button().disabled).toBe(false);
    expect(button().textContent).toBe("common.manage");
    expect(container.textContent).toContain("settings.mta_sts_row_retiring");
  });

  it("shows the live chip", () => {
    render(make_domain({ mta_sts_state: "live" }));

    expect(container.textContent).toContain("settings.mta_sts_state_live");
    expect(container.textContent).toContain("settings.mta_sts_row_live");
  });

  it("treats an unknown state as off", () => {
    render(make_domain({ mta_sts_state: "surprise" }));

    expect(button().textContent).toBe("settings.mta_sts_set_up");
  });
});

describe("mta_sts copy", () => {
  it("picks the managed DNS message for registrar domains", () => {
    expect(mta_sts_row_message("pending_dns", true)).toBe(
      "settings.mta_sts_row_pending_dns_managed",
    );
    expect(mta_sts_row_message("pending_dns", false)).toBe(
      "settings.mta_sts_row_pending_dns",
    );
  });

  it("explains why a policy needs attention", () => {
    const base = {
      entitled: true,
      domain_active: true,
      hostname_status: "active",
    } as MtaStsView;

    expect(mta_sts_attention_message({ ...base, entitled: false })).toBe(
      "settings.mta_sts_attention_plan",
    );
    expect(mta_sts_attention_message({ ...base, domain_active: false })).toBe(
      "settings.mta_sts_attention_domain",
    );
    expect(
      mta_sts_attention_message({ ...base, hostname_status: "failed" }),
    ).toBe("settings.mta_sts_attention_certificate");
    expect(mta_sts_attention_message(base)).toBe(
      "settings.mta_sts_attention_records",
    );
  });

  it("maps server codes to messages", () => {
    expect(mta_sts_action_error({ server_code: "MTA_STS_CAPACITY" })).toBe(
      "settings.mta_sts_error_capacity",
    );
    expect(mta_sts_action_error({ server_code: "PLAN_LIMIT_EXCEEDED" })).toBe(
      "settings.mta_sts_row_locked",
    );
    expect(mta_sts_action_error({ code: "RATE_LIMIT_EXCEEDED" })).toBe(
      "settings.mta_sts_error_throttled",
    );
    expect(mta_sts_action_error({ error: "x" })).toBe(
      "common.something_went_wrong_try_again",
    );
  });
});
