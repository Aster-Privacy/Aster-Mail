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

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import type { FamilyGroupResponse } from "@/services/api/family";

const get_family_group = vi.fn();

vi.mock("@/services/api/family", () => ({
  get_family_group: () => get_family_group(),
  invite_member: vi.fn(),
  create_invite_link: vi.fn(),
  revoke_invite: vi.fn(),
  remove_family_member: vi.fn(),
  transfer_family_admin: vi.fn(),
  leave_family: vi.fn(),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({ user: { username: "mrjarvishere" } }),
}));

vi.mock("@/lib/utils", () => ({
  format_bytes: (n: number) => `${n}B`,
}));

vi.mock("@/components/ui/alert_dialog", () => ({
  AlertDialog: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogAction: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogCancel: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogContent: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogDescription: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogFooter: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogHeader: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogTitle: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/components/auth/turnstile_widget", () => ({
  TurnstileWidget: () => null,
  TURNSTILE_SITE_KEY: "",
}));

vi.mock("@/components/ui/profile_avatar", () => ({
  ProfileAvatar: () => null,
}));

vi.mock("@/components/ui/spinner", () => ({
  Spinner: () => null,
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: vi.fn(),
}));

vi.mock("./shared", () => ({
  SettingsHeader: () => null,
  SettingsGroup: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

import { FamilySection } from "./family_section";

const owner = {
  user_id: "owner-1",
  username: "mrjarvishere",
  email_domain: "aster.cx",
  role: "owner" as const,
  allocated_storage_bytes: 3 * 1024 * 1073741824,
  storage_used_bytes: 2202009,
  status: "active" as const,
  joined_at: "2026-01-01T00:00:00Z",
};

const removed_member = {
  user_id: "removed-1",
  username: "ex_friend",
  email_domain: "aster.cx",
  role: "member" as const,
  allocated_storage_bytes: 500 * 1073741824,
  storage_used_bytes: 100,
  status: "grace" as const,
  joined_at: "2026-06-01T00:00:00Z",
};

const group: FamilyGroupResponse = {
  id: "group-1",
  plan_code: "family",
  plan_name: "Family",
  storage_pool_bytes: 3 * 1024 * 1073741824 * 6,
  storage_used_bytes: 2202109,
  status: "active",
  grace_period_end: null,
  members: [owner, removed_member],
  pending_invites: [],
  max_members: 6,
  viewer_role: "owner",
};

let host: HTMLDivElement;
let root: Root;

function render(node: React.ReactElement) {
  act(() => {
    root.render(node);
  });
}

beforeEach(() => {
  get_family_group.mockReset();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("mobile FamilySection excludes grace-period (removed) members", () => {
  it("counts only active members, not grace-status ones, in the header ratio", async () => {
    get_family_group.mockResolvedValue({ data: group, error: null });

    render(<FamilySection on_back={() => {}} on_close={() => {}} />);
    await act(async () => {});

    expect(host.textContent).toContain("1/6");
    expect(host.textContent).not.toContain("2/6");
  });

  it("does not render the removed (grace-status) member in the roster", async () => {
    get_family_group.mockResolvedValue({ data: group, error: null });

    render(<FamilySection on_back={() => {}} on_close={() => {}} />);
    await act(async () => {});

    expect(host.textContent).toContain("mrjarvishere");
    expect(host.textContent).not.toContain("ex_friend");
  });

  it("still renders both members if both are active (control case)", async () => {
    const both_active: FamilyGroupResponse = {
      ...group,
      members: [owner, { ...removed_member, status: "active" }],
    };

    get_family_group.mockResolvedValue({ data: both_active, error: null });

    render(<FamilySection on_back={() => {}} on_close={() => {}} />);
    await act(async () => {});

    expect(host.textContent).toContain("2/6");
    expect(host.textContent).toContain("ex_friend");
  });
});

describe("mobile FamilySection load failure", () => {
  it("offers a retry instead of pretending the family does not exist", async () => {
    get_family_group.mockResolvedValue({ data: null, error: "network" });

    render(<FamilySection on_back={() => {}} on_close={() => {}} />);
    await act(async () => {});

    expect(host.textContent).toContain("common.something_went_wrong_try_again");
    expect(host.textContent).toContain("common.retry");
    expect(host.textContent).not.toContain("settings.family_plan_subtitle");
  });

  it("reloads the family when the retry is pressed", async () => {
    get_family_group.mockResolvedValue({ data: null, error: "network" });

    render(<FamilySection on_back={() => {}} on_close={() => {}} />);
    await act(async () => {});

    get_family_group.mockResolvedValue({ data: group, error: null });

    const retry = Array.from(host.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("common.retry"),
    );

    await act(async () => {
      retry?.click();
    });
    await act(async () => {});

    expect(host.textContent).toContain("1/6");
  });

  it("keeps the upsell copy when the account simply has no family", async () => {
    get_family_group.mockResolvedValue({ data: null, error: null });

    render(<FamilySection on_back={() => {}} on_close={() => {}} />);
    await act(async () => {});

    expect(host.textContent).toContain("settings.family_plan_subtitle");
    expect(host.textContent).not.toContain("common.retry");
  });
});
