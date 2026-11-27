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
import type { ReactNode } from "react";
import type { GuardStatus } from "@/services/api/guard";

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  GuardSection,
  guard_setup_blocked,
} from "@/components/guard/guard_section";
import { request_guard_setup } from "@/services/guard/guard_setup_request";

const h = vi.hoisted(() => ({
  status: null as GuardStatus | null,
  refresh: vi.fn(async () => undefined),
  wizard_open: false,
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({ user: { id: "user-1" } }),
}));

vi.mock("@/hooks/use_guard_status", () => ({
  use_guard_status: () => ({ status: h.status, refresh: h.refresh }),
}));

vi.mock("@/components/guard/guard_switches_panel", () => ({
  GuardSwitchesPanel: () => null,
  use_guard_device: () => ({ device: null }),
}));

vi.mock("@/components/guard/guard_devices_list", () => ({
  GuardDevicesList: () => null,
}));

vi.mock("@/components/guard/guard_held_changes", () => ({
  GuardHeldChanges: () => null,
}));

vi.mock("@/components/guard/guard_visuals", () => ({
  GuardMarkIcon: () => null,
  GuardPlatformGlyph: () => null,
}));

vi.mock("@/components/guard/guard_setup_wizard", () => ({
  GuardSetupWizard: ({ is_open }: { is_open: boolean }) => {
    h.wizard_open = is_open;

    return is_open ? <div data-testid="guard_wizard" /> : null;
  },
}));

vi.mock("@aster/ui", () => ({
  Button: ({
    children,
    disabled,
    onClick,
    ...rest
  }: {
    children?: ReactNode;
    disabled?: boolean;
    onClick?: () => void;
    "data-testid"?: string;
  }) => (
    <button
      data-testid={rest["data-testid"]}
      disabled={disabled}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  ),
  InfoPopover: () => null,
  IslandSection: ({ children }: { children?: ReactNode }) => (
    <section>{children}</section>
  ),
  IslandSections: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  SettingControlRow: ({
    control,
    description,
    label,
  }: {
    control?: ReactNode;
    description?: ReactNode;
    label?: ReactNode;
  }) => (
    <div>
      {label}
      {description}
      {control}
    </div>
  ),
}));

function make_status(overrides: Partial<GuardStatus> = {}): GuardStatus {
  return {
    switches: 0,
    hold_scopes: 0,
    version: 0,
    enrolled_at: null,
    recovery_wait_effective: false,
    paused_until: null,
    has_rescue_code: false,
    this_device: null,
    devices: [],
    pending_changes: [],
    backup_device_available: true,
    ...overrides,
  } as GuardStatus;
}

let container: HTMLDivElement;
let root: Root;

function render() {
  act(() => {
    root.render(<GuardSection />);
  });
}

function find(id: string) {
  return container.querySelector<HTMLElement>(`[data-testid="${id}"]`);
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  h.status = null;
  h.wizard_open = false;
  h.refresh.mockClear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("guard_setup_blocked", () => {
  it("blocks setup only when Guard is off and no second device is signed in", () => {
    expect(
      guard_setup_blocked({ switches: 0, backup_device_available: false }),
    ).toBe(true);
    expect(
      guard_setup_blocked({ switches: 0, backup_device_available: true }),
    ).toBe(false);
    expect(
      guard_setup_blocked({ switches: 1, backup_device_available: false }),
    ).toBe(false);
    expect(guard_setup_blocked({ switches: 0 })).toBe(false);
  });
});

describe("guard section setup button", () => {
  it("disables setup and explains why without a second device", () => {
    h.status = make_status({ backup_device_available: false });
    render();
    const button = find("guard_set_up") as HTMLButtonElement;

    expect(button.disabled).toBe(true);
    expect(find("guard_setup_needs_backup")?.textContent).toBe(
      "guard.setup_needs_backup_device",
    );
    act(() => button.click());
    expect(find("guard_wizard")).toBeNull();
  });

  it("opens setup when a second device is signed in", () => {
    h.status = make_status();
    render();
    const button = find("guard_set_up") as HTMLButtonElement;

    expect(button.disabled).toBe(false);
    expect(find("guard_setup_needs_backup")).toBeNull();
    act(() => button.click());
    expect(find("guard_wizard")).not.toBeNull();
  });

  it("does not open setup from a request elsewhere without a second device", () => {
    h.status = make_status({ backup_device_available: false });
    render();
    act(() => request_guard_setup());
    expect(h.wizard_open).toBe(false);
  });

  it("checks again when the window regains focus", () => {
    h.status = make_status({ backup_device_available: false });
    render();
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(h.refresh).toHaveBeenCalled();
  });
});
