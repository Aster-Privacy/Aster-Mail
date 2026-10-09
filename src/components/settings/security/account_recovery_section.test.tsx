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

import { AccountRecoverySection } from "./account_recovery_section";

import {
  get_codes_status,
  get_recovery_methods,
} from "@/services/api/recovery";

vi.mock("@/services/api/recovery", () => ({
  get_codes_status: vi.fn(),
  get_recovery_methods: vi.fn(),
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({ user: { id: "account-1" } }),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/components/settings/security/recovery_codes_modal", () => ({
  RecoveryCodesModal: () => null,
}));

vi.mock("@/components/common/recover_data_modal", () => ({
  RecoverDataModal: ({
    account_id,
    is_open,
  }: {
    account_id: string;
    is_open: boolean;
  }) =>
    is_open ? <div data-testid="recover-data-modal">{account_id}</div> : null,
}));

function methods(inactive_key_sets: number) {
  return {
    data: {
      has_phrase: false,
      has_codes: true,
      codes_remaining: 10,
      recovery_email_set: true,
      recovery_email_verified: true,
      inactive_key_sets,
    },
  };
}

describe("AccountRecoverySection", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.mocked(get_codes_status).mockResolvedValue({
      data: {
        created_at: "2026-10-07T00:00:00Z",
        remaining: 10,
        total: 10,
      },
    } as never);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  async function render() {
    await act(async () => {
      root.render(<AccountRecoverySection />);
    });
  }

  function recover_button() {
    return Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "common.locked_data_banner_action",
    );
  }

  it("offers to recover data while older key sets are locked", async () => {
    vi.mocked(get_recovery_methods).mockResolvedValue(methods(1) as never);
    await render();

    expect(container.textContent).toContain("common.recover_data_title");
    const button = recover_button();

    expect(button).toBeDefined();

    await act(async () => {
      button!.click();
    });

    expect(
      container.querySelector('[data-testid="recover-data-modal"]')
        ?.textContent,
    ).toBe("account-1");
  });

  it("hides the row when no older key sets are locked", async () => {
    vi.mocked(get_recovery_methods).mockResolvedValue(methods(0) as never);
    await render();

    expect(container.textContent).not.toContain("common.recover_data_title");
    expect(recover_button()).toBeUndefined();
  });
});
