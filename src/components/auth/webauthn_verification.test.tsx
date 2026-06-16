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

import { WebauthnVerification } from "./webauthn_verification";
import {
  initiate_webauthn_assertion,
  perform_webauthn_assertion,
} from "@/services/api/webauthn";

vi.mock("@/services/api/webauthn", () => ({
  initiate_webauthn_assertion: vi.fn(),
  perform_webauthn_assertion: vi.fn(),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
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

const mocked_initiate = vi.mocked(initiate_webauthn_assertion);
const mocked_perform = vi.mocked(perform_webauthn_assertion);

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const assertion_options = {
  challenge: "c",
  challenge_token: "ct",
  rpId: "aster.cx",
  allowCredentials: [],
  timeout: 60000,
  userVerification: "preferred",
};

const success_response = {
  data: {
    user_id: "u1",
    username: "fate",
    email: "fate@aster.cx",
    csrf_token: "c",
    encrypted_vault: "v",
    vault_nonce: "n",
  },
};

describe("WebauthnVerification", () => {
  let container: HTMLDivElement;
  let root: Root;

  const props = () => ({
    pending_login_token: "pending-token",
    on_success: vi.fn(),
    on_use_other_method: vi.fn(),
    on_cancel: vi.fn(),
  });

  const button_by_text = (text: string) =>
    Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes(text),
    ) as HTMLButtonElement | undefined;

  const render = async (overrides = {}) => {
    const p = { ...props(), ...overrides };

    await act(async () => {
      root.render(<WebauthnVerification {...p} />);
    });

    return p;
  };

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mocked_initiate.mockReset();
    mocked_perform.mockReset();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("auto-starts the assertion exactly once on mount", async () => {
    mocked_initiate.mockResolvedValue({ data: assertion_options });
    mocked_perform.mockResolvedValue(success_response);

    const p = await render();

    expect(mocked_initiate).toHaveBeenCalledTimes(1);
    expect(mocked_perform).toHaveBeenCalledTimes(1);
    expect(p.on_success).toHaveBeenCalledTimes(1);
  });

  it("does not re-fire the assertion on re-render", async () => {
    mocked_initiate.mockResolvedValue({ data: assertion_options });
    mocked_perform.mockReturnValue(new Promise(() => {}));

    const p = await render();
    await act(async () => {
      root.render(<WebauthnVerification {...p} />);
    });

    expect(mocked_initiate).toHaveBeenCalledTimes(1);
  });

  it("shows an error with a retry that re-runs the assertion", async () => {
    mocked_initiate.mockResolvedValue({ data: assertion_options });
    mocked_perform.mockResolvedValueOnce({
      data: undefined,
      error: "authentication_cancelled",
    });

    await render();

    expect(container.textContent).toContain("authentication_cancelled");
    const retry = button_by_text("common.try_again");

    expect(retry).toBeTruthy();

    mocked_perform.mockResolvedValueOnce(success_response);
    await act(async () => {
      retry!.click();
    });

    expect(mocked_initiate).toHaveBeenCalledTimes(2);
  });
});
