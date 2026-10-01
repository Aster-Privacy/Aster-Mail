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
import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/hooks/use_tags", () => ({
  use_tags: () => ({ get_tag_by_token: () => undefined }),
}));
vi.mock("@/components/ui/profile_avatar", () => ({
  ProfileAvatar: () => null,
}));
vi.mock("@/components/common/encryption_info_dropdown", () => ({
  EncryptionInfoDropdown: () => null,
}));

const { PopupEmailHeader } = await import("./popup_email_header");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

function render(is_spam: boolean | undefined) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <PopupEmailHeader
        email={
          {
            id: "1",
            subject: "YOU GOT RECORDED!",
            sender: "me",
            sender_email: "me@example.com",
            to: [],
            cc: [],
            timestamp: "2026-10-01T09:16:00Z",
          } as never
        }
        format_email_popup={() => "Today"}
        is_fullscreen={false}
        mail_item={{ id: "1", is_spam } as never}
        on_close={() => {}}
        t={(key) => key}
        thread_messages={[]}
        timestamp_date={{ current: null }}
      />,
    );
  });
}

describe("PopupEmailHeader spam tag", () => {
  it("tags a message that is in spam, as the message list does", () => {
    render(true);
    expect(container!.textContent).toContain("mail.spam_label");
  });

  it("shows no spam tag for other messages", () => {
    render(false);
    expect(container!.textContent).not.toContain("mail.spam_label");
  });
});
