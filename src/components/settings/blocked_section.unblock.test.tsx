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

import { BlockedSection } from "./blocked_section";
import {
  list_blocked_senders,
  unblock_sender_by_token,
  type DecryptedBlockedSender,
} from "@/services/api/blocked_senders";
import { show_toast } from "@/components/toast/simple_toast";

vi.mock("@/services/api/blocked_senders", () => ({
  list_blocked_senders: vi.fn(),
  unblock_sender_by_token: vi.fn(),
  bulk_unblock_senders_by_tokens: vi.fn(),
  block_sender: vi.fn(),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, vars?: Record<string, string>) =>
      vars ? `${key}:${Object.values(vars).join(",")}` : key,
  }),
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: vi.fn(),
}));

vi.mock("@/components/ui/profile_avatar", () => ({
  ProfileAvatar: () => null,
}));

vi.mock("@aster/ui", () => ({
  Button: ({ children, ...props }: React.ComponentProps<"button">) => (
    <button {...props}>{children}</button>
  ),
  Checkbox: () => <input type="checkbox" />,
  Radio: () => <input type="radio" />,
}));

const mocked_list = vi.mocked(list_blocked_senders);
const mocked_unblock = vi.mocked(unblock_sender_by_token);
const mocked_toast = vi.mocked(show_toast);

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const SENDER: DecryptedBlockedSender = {
  id: "b1",
  sender_token: "tok_1",
  email: "spam@example.com",
  blocked_at: "2026-01-01T00:00:00.000Z",
  is_domain: false,
  action: "spam",
  created_at: "2026-01-01T00:00:00.000Z",
};

describe("BlockedSection handle_unblock", () => {
  let container: HTMLDivElement;
  let root: Root;

  const render_section = async () => {
    await act(async () => {
      root.render(<BlockedSection />);
    });
  };

  const find_unblock_button = () =>
    Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("mail.unblock_sender"),
    ) as HTMLButtonElement | undefined;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mocked_list.mockReset();
    mocked_unblock.mockReset();
    mocked_toast.mockReset();
    mocked_list.mockResolvedValue({ data: [SENDER] });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  it("keeps the row and shows an error when the unblock API fails", async () => {
    mocked_unblock.mockResolvedValue({ data: { success: false } });

    await render_section();

    await act(async () => {
      find_unblock_button()!.click();
    });

    expect(container.textContent).toContain("spam@example.com");
    expect(mocked_toast).toHaveBeenCalledWith(
      expect.stringContaining("common.unblock_failed"),
      "error",
    );
    expect(mocked_toast).not.toHaveBeenCalledWith(
      expect.anything(),
      "success",
    );
  });

  it("removes the row and shows success only after a real success", async () => {
    mocked_unblock.mockResolvedValue({ data: { success: true } });

    await render_section();

    await act(async () => {
      find_unblock_button()!.click();
    });

    expect(container.textContent).not.toContain("spam@example.com");
    expect(mocked_toast).toHaveBeenCalledWith(
      expect.stringContaining("common.unblocked_email"),
      "success",
    );
  });
});
