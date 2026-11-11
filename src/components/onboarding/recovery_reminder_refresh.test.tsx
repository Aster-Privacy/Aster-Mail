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
import type { RecoveryStatusValues } from "@/hooks/use_recovery_status";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const state = vi.hoisted(() => ({
  codes: [] as string[],
  has_codes: true,
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/provider", () => ({ use_should_reduce_motion: () => true }));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_vault_from_memory: () => ({ recovery_codes: state.codes }),
}));

vi.mock("@/hooks/use_recovery_status", () => ({
  load_recovery_status: async (): Promise<Partial<RecoveryStatusValues>> => ({
    has_codes: state.has_codes,
    codes_remaining: 10,
  }),
  recovery_nudge: () => null,
}));

vi.mock("@/components/settings/security/recovery_codes_modal", () => ({
  RecoveryCodesModal: (props: { is_open: boolean; mode: string }) =>
    props.is_open ? <div data-testid="replace-modal">{props.mode}</div> : null,
}));

import { RecoveryReminder } from "./recovery_reminder";

import { reset_recovery_code_refresh } from "@/services/crypto/recovery_code_refresh";

const OUTDATED = ["ASTER-AAAA-BBBB-CCCC", "ASTER-EEEE-FFFF-GGGG"];
const CURRENT = ["ASTER-AAAA-BBBB-CCCC-DDDD"];
const TITLE = "common.recovery_codes_refresh_title";

let container: HTMLDivElement;
let root: Root;

async function mount(): Promise<void> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root.render(<RecoveryReminder />);
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function unmount(): void {
  act(() => {
    root.unmount();
  });
  container.remove();
}

function button(label: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll("button")).find(
    (node) => node.textContent === label,
  );

  if (!found) throw new Error(`no button ${label}`);

  return found;
}

describe("recovery code refresh prompt", () => {
  beforeEach(() => {
    localStorage.clear();
    reset_recovery_code_refresh();
    state.codes = OUTDATED;
    state.has_codes = true;
  });

  afterEach(() => {
    unmount();
  });

  it("appears on a device with no first run record", async () => {
    await mount();

    expect(container.textContent).toContain(TITLE);
  });

  it("stays away when the saved codes are current", async () => {
    state.codes = CURRENT;

    await mount();

    expect(container.textContent).not.toContain(TITLE);
  });

  it("stays away when the account has no active codes", async () => {
    state.has_codes = false;

    await mount();

    expect(container.textContent).not.toContain(TITLE);
  });

  it("returns in the next session after Later", async () => {
    await mount();

    await act(async () => {
      button("common.recovery_reminder_later").click();
    });

    expect(container.textContent).not.toContain(TITLE);
    expect(localStorage.length).toBe(0);

    unmount();
    await mount();

    expect(container.textContent).not.toContain(TITLE);

    unmount();
    reset_recovery_code_refresh();
    await mount();

    expect(container.textContent).toContain(TITLE);
  });

  it("opens the replacement flow from the prompt", async () => {
    await mount();

    await act(async () => {
      button("common.recovery_codes_low_reminder_action").click();
    });

    const modal = container.querySelector('[data-testid="replace-modal"]');

    expect(modal?.textContent).toBe("regenerate");
    expect(container.textContent).not.toContain(TITLE);
  });
});
