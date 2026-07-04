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
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const update_member_storage = vi.fn(async (_user_id: string, _bytes: number) => ({
  data: {},
  error: null,
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key} ${Object.values(params).join(",")}` : key,
  }),
}));

vi.mock("@/services/api/family", () => ({
  update_member_storage: (user_id: string, bytes: number) =>
    update_member_storage(user_id, bytes),
  get_family_group: vi.fn(),
  invite_member: vi.fn(),
  create_invite_link: vi.fn(),
  revoke_invite: vi.fn(),
  remove_family_member: vi.fn(),
  transfer_family_admin: vi.fn(),
  leave_family: vi.fn(),
}));

vi.mock("@/services/api/family_org", () => ({}));
vi.mock("@/services/api/billing", () => ({ change_plan: vi.fn() }));
vi.mock("@/services/api/aliases", () => ({ check_alias_availability: vi.fn() }));
vi.mock("@/components/toast/simple_toast", () => ({ show_toast: vi.fn() }));
vi.mock("./family_kids_addresses", () => ({ KidsContent: () => null }));
vi.mock("@/components/auth/turnstile_widget", () => ({
  TurnstileWidget: () => null,
  TURNSTILE_SITE_KEY: "test",
}));
vi.mock("@/components/ui/profile_avatar", () => ({ ProfileAvatar: () => null }));
vi.mock("@aster/ui", () => ({
  Switch: () => null,
  Button: ({ children, onClick }: { children?: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}));

import { MemberRow } from "./family_section";
import type { FamilyMemberInfo } from "@/services/api/family";

const GiB = 1073741824;
const POOL_3TB = 3 * 1024 * GiB;

const owner: FamilyMemberInfo = {
  user_id: "owner-1",
  username: "mrjarvishere",
  email_domain: "aster.cx",
  role: "owner",
  allocated_storage_bytes: POOL_3TB,
  storage_used_bytes: 2202009,
  status: "active",
  joined_at: "2026-01-01T00:00:00Z",
};

const member: FamilyMemberInfo = {
  ...owner,
  user_id: "member-1",
  username: "kid",
  role: "member",
  allocated_storage_bytes: 100 * GiB,
  storage_used_bytes: 1 * GiB,
};

const EDIT = '[aria-label="settings.family_storage_edit"]';
const TRANSFER = '[aria-label="settings.family_transfer_admin"]';
const REMOVE = '[aria-label="settings.family_remove_member"]';

let host: HTMLDivElement;
let root: Root;

function render(node: React.ReactElement) {
  act(() => {
    root.render(node);
  });
}

function set_range(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  )!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

beforeEach(() => {
  update_member_storage.mockClear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("MemberRow owner self storage management", () => {
  it("shows the storage-edit control on the owner's own row", () => {
    render(
      <MemberRow
        member={owner}
        is_owner_view={true}
        pool_remaining_bytes={0}
        on_remove={() => {}}
        on_transfer={() => {}}
        on_reload={async () => {}}
      />
    );
    expect(host.querySelector(EDIT)).not.toBeNull();
  });

  it("hides transfer and remove on the owner's own row", () => {
    render(
      <MemberRow
        member={owner}
        is_owner_view={true}
        pool_remaining_bytes={0}
        on_remove={() => {}}
        on_transfer={() => {}}
        on_reload={async () => {}}
      />
    );
    expect(host.querySelector(TRANSFER)).toBeNull();
    expect(host.querySelector(REMOVE)).toBeNull();
  });

  it("still shows edit, transfer, and remove for a non-owner member", () => {
    render(
      <MemberRow
        member={member}
        is_owner_view={true}
        pool_remaining_bytes={0}
        on_remove={() => {}}
        on_transfer={() => {}}
        on_reload={async () => {}}
      />
    );
    expect(host.querySelector(EDIT)).not.toBeNull();
    expect(host.querySelector(TRANSFER)).not.toBeNull();
    expect(host.querySelector(REMOVE)).not.toBeNull();
  });

  it("lets the owner drag their allocation down at TB scale, freeing the pool", () => {
    render(
      <MemberRow
        member={owner}
        is_owner_view={true}
        pool_remaining_bytes={0}
        on_remove={() => {}}
        on_transfer={() => {}}
        on_reload={async () => {}}
      />
    );
    act(() => {
      (host.querySelector(EDIT) as HTMLButtonElement).click();
    });
    const slider = host.querySelector('input[type="range"]') as HTMLInputElement;
    expect(slider).not.toBeNull();
    expect(Number(slider.min)).toBe(1);
    expect(Number(slider.max)).toBe(3073);

    set_range(slider, "512");
    expect(host.textContent).toContain("2560");
  });

  it("saves the reduced owner allocation via update_member_storage and reloads", async () => {
    const on_reload = vi.fn(async () => {});
    render(
      <MemberRow
        member={owner}
        is_owner_view={true}
        pool_remaining_bytes={0}
        on_remove={() => {}}
        on_transfer={() => {}}
        on_reload={on_reload}
      />
    );
    act(() => {
      (host.querySelector(EDIT) as HTMLButtonElement).click();
    });
    const slider = host.querySelector('input[type="range"]') as HTMLInputElement;
    set_range(slider, "512");

    const save_btn = Array.from(host.querySelectorAll("button")).find(
      (b) => b.textContent === "settings.fam_org_member_save"
    ) as HTMLButtonElement;
    expect(save_btn).toBeTruthy();

    await act(async () => {
      save_btn.click();
    });
    await act(async () => {});

    expect(update_member_storage).toHaveBeenCalledTimes(1);
    expect(update_member_storage).toHaveBeenCalledWith("owner-1", 512 * GiB);
    expect(on_reload).toHaveBeenCalled();
  });

  it("saves an exact typed allocation via the manual number input", async () => {
    render(
      <MemberRow
        member={owner}
        is_owner_view={true}
        pool_remaining_bytes={0}
        on_remove={() => {}}
        on_transfer={() => {}}
        on_reload={async () => {}}
      />
    );
    act(() => {
      (host.querySelector(EDIT) as HTMLButtonElement).click();
    });
    const box = host.querySelector('input[type="number"]') as HTMLInputElement;
    expect(box).not.toBeNull();
    set_range(box, "1000");

    const save_btn = Array.from(host.querySelectorAll("button")).find(
      (b) => b.textContent === "settings.fam_org_member_save"
    ) as HTMLButtonElement;
    await act(async () => {
      save_btn.click();
    });
    await act(async () => {});

    expect(update_member_storage).toHaveBeenCalledWith("owner-1", 1000 * GiB);
  });

  it("clamps a typed allocation above the pool ceiling on save", async () => {
    render(
      <MemberRow
        member={owner}
        is_owner_view={true}
        pool_remaining_bytes={0}
        on_remove={() => {}}
        on_transfer={() => {}}
        on_reload={async () => {}}
      />
    );
    act(() => {
      (host.querySelector(EDIT) as HTMLButtonElement).click();
    });
    const box = host.querySelector('input[type="number"]') as HTMLInputElement;
    set_range(box, "999999");

    const save_btn = Array.from(host.querySelectorAll("button")).find(
      (b) => b.textContent === "settings.fam_org_member_save"
    ) as HTMLButtonElement;
    await act(async () => {
      save_btn.click();
    });
    await act(async () => {});

    expect(update_member_storage).toHaveBeenCalledWith("owner-1", 3073 * GiB);
  });
});
