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

const preferences_value = { low_network_mode: true };

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: preferences_value }),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/provider", () => ({
  use_should_reduce_motion: () => true,
}));

vi.mock("@/services/api/attachments", () => ({
  list_attachments: vi.fn(),
}));

vi.mock("@/services/crypto/attachment_crypto", () => ({
  decrypt_attachment_meta: vi.fn(),
  decrypt_attachment_data: vi.fn(),
  download_decrypted_attachment: vi.fn(),
}));

vi.mock("@/components/common/encryption_info_dropdown", () => ({
  EncryptionInfoDropdown: () => null,
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: vi.fn(),
}));

vi.mock("@/components/email/pdf_preview_modal", () => ({
  PdfPreviewModal: () => null,
}));

import { AttachmentList } from "./attachment_list";

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("AttachmentList low_network_mode collapsed state", () => {
  let container: HTMLDivElement;
  let root: Root;

  const render = async (hint_attachment_count: number) => {
    await act(async () => {
      root.render(
        <AttachmentList
          mail_item_id="m1"
          hint_attachment_count={hint_attachment_count}
        />,
      );
    });
  };

  beforeEach(() => {
    preferences_value.low_network_mode = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("renders nothing when there are 0 attachments", async () => {
    await render(0);

    expect(container.innerHTML).toBe("");
    expect(container.textContent).not.toContain("mail.load_attachments");
    expect(container.querySelector("button")).toBeNull();
  });

  it("renders the load attachments control when the hint count is positive", async () => {
    await render(2);

    const button = container.querySelector("button");

    expect(button).not.toBeNull();
    expect(container.textContent).toContain("mail.load_attachments");
  });
});
