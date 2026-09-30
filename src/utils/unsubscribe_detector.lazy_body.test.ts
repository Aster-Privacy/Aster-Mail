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
import { describe, it, expect } from "vitest";

import { detect_unsubscribe_info } from "@/utils/unsubscribe_detector";

const BODY_WITH_LINK =
  '<p>Bye</p><a href="https://sender.example.com/page/unsubscribe">Unsubscribe</a>';

describe("unsubscribe detection with headers present", () => {
  it("keeps the body link as the landing page for one-click senders", () => {
    const info = detect_unsubscribe_info(BODY_WITH_LINK, "", {
      list_unsubscribe: "<https://sender.example.com/oc?t=abc>",
      list_unsubscribe_post: "List-Unsubscribe=One-Click",
    });

    expect(info.method).toBe("one-click");
    expect(info.unsubscribe_link).toBe("https://sender.example.com/oc?t=abc");
    expect(info.unsubscribe_page_url).toBe(
      "https://sender.example.com/page/unsubscribe",
    );
  });

  it("prefers the header link over the body link", () => {
    const info = detect_unsubscribe_info(BODY_WITH_LINK, "", {
      list_unsubscribe: "<https://sender.example.com/header>",
    });

    expect(info.method).toBe("link");
    expect(info.unsubscribe_link).toBe("https://sender.example.com/header");
    expect(info.unsubscribe_page_url).toBe("https://sender.example.com/header");
  });

  it("uses a mailto header without consulting the body", () => {
    const info = detect_unsubscribe_info(BODY_WITH_LINK, "", {
      list_unsubscribe: "<mailto:stop@sender.example.com>",
    });

    expect(info.method).toBe("mailto");
    expect(info.unsubscribe_mailto).toBe("stop@sender.example.com");
    expect(info.unsubscribe_page_url).toBeUndefined();
  });

  it("falls back to the body when no header resolves", () => {
    const info = detect_unsubscribe_info(BODY_WITH_LINK, "", {});

    expect(info.method).toBe("link");
    expect(info.unsubscribe_link).toBe(
      "https://sender.example.com/page/unsubscribe",
    );
  });

  it("reports no unsubscribe when neither header nor body has one", () => {
    const info = detect_unsubscribe_info("<p>Hello</p>", "Hello", {});

    expect(info.has_unsubscribe).toBe(false);
    expect(info.method).toBe("none");
  });
});
