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

import {
  commit_pending_recipients,
  resolve_attachment_name,
  is_duplicate_attachment,
  decide_draft_close_action,
  has_meaningful_compose_content,
  is_valid_email,
} from "@/components/compose/compose_shared";
import { is_valid_email as is_valid_email_utils } from "@/lib/utils";

describe("commit_pending_recipients", () => {
  it("appends a valid typed to-recipient that was never committed", () => {
    const result = commit_pending_recipients(
      { to: [], cc: [], bcc: [] },
      { to: "alice@example.com", cc: "", bcc: "" },
    );

    expect(result.to).toEqual(["alice@example.com"]);
  });

  it("trims whitespace around the typed recipient", () => {
    const result = commit_pending_recipients(
      { to: [], cc: [], bcc: [] },
      { to: "  bob@example.com  ", cc: "", bcc: "" },
    );

    expect(result.to).toEqual(["bob@example.com"]);
  });

  it("keeps already-committed recipients and adds the pending one", () => {
    const result = commit_pending_recipients(
      { to: ["a@example.com"], cc: [], bcc: [] },
      { to: "b@example.com", cc: "", bcc: "" },
    );

    expect(result.to).toEqual(["a@example.com", "b@example.com"]);
  });

  it("ignores an invalid typed value", () => {
    const result = commit_pending_recipients(
      { to: ["a@example.com"], cc: [], bcc: [] },
      { to: "not-an-email", cc: "", bcc: "" },
    );

    expect(result.to).toEqual(["a@example.com"]);
  });

  it("does not duplicate a recipient already present", () => {
    const result = commit_pending_recipients(
      { to: ["a@example.com"], cc: [], bcc: [] },
      { to: "a@example.com", cc: "", bcc: "" },
    );

    expect(result.to).toEqual(["a@example.com"]);
  });

  it("commits pending cc and bcc independently", () => {
    const result = commit_pending_recipients(
      { to: ["a@example.com"], cc: [], bcc: [] },
      { to: "", cc: "c@example.com", bcc: "d@example.com" },
    );

    expect(result.cc).toEqual(["c@example.com"]);
    expect(result.bcc).toEqual(["d@example.com"]);
  });
});

describe("resolve_attachment_name", () => {
  it("returns the original name when unused", () => {
    expect(resolve_attachment_name("report.pdf", ["other.pdf"])).toBe(
      "report.pdf",
    );
  });

  it("auto-renames a colliding name preserving the extension", () => {
    expect(resolve_attachment_name("report.pdf", ["report.pdf"])).toBe(
      "report (1).pdf",
    );
  });

  it("increments the counter until a free name is found", () => {
    expect(
      resolve_attachment_name("report.pdf", [
        "report.pdf",
        "report (1).pdf",
        "report (2).pdf",
      ]),
    ).toBe("report (3).pdf");
  });

  it("handles names without an extension", () => {
    expect(resolve_attachment_name("README", ["README"])).toBe("README (1)");
  });

  it("handles dotfiles without treating the leading dot as an extension", () => {
    expect(resolve_attachment_name(".env", [".env"])).toBe(".env (1)");
  });
});

describe("is_duplicate_attachment", () => {
  it("treats same name and size as a duplicate", () => {
    expect(
      is_duplicate_attachment([{ name: "a.pdf", size_bytes: 100 }], {
        name: "a.pdf",
        size: 100,
      }),
    ).toBe(true);
  });

  it("treats same name but different size as distinct", () => {
    expect(
      is_duplicate_attachment([{ name: "a.pdf", size_bytes: 100 }], {
        name: "a.pdf",
        size: 200,
      }),
    ).toBe(false);
  });
});

describe("is_valid_email shared predicate", () => {
  it("is the same predicate used by send acceptance and chip commit", () => {
    expect(is_valid_email).toBe(is_valid_email_utils);
  });

  it("accepts an address that both send and Enter should agree on", () => {
    expect(is_valid_email("a@b.c")).toBe(true);
    expect(is_valid_email("alice@example.com")).toBe(true);
  });

  it("rejects malformed addresses", () => {
    expect(is_valid_email("not-an-email")).toBe(false);
    expect(is_valid_email("a@b")).toBe(false);
    expect(is_valid_email("a b@c.d")).toBe(false);
  });
});

describe("decide_draft_close_action", () => {
  it("keeps an already-saved draft when closing with an empty body in low-network mode", () => {
    expect(
      decide_draft_close_action({
        has_content: true,
        body_empty: true,
        is_edit_draft: false,
        user_modified: true,
        low_network_mode: true,
      }),
    ).toBe("keep");
  });

  it("saves a modified draft with a body", () => {
    expect(
      decide_draft_close_action({
        has_content: true,
        body_empty: false,
        is_edit_draft: false,
        user_modified: true,
        low_network_mode: true,
      }),
    ).toBe("save");
  });

  it("deletes when there is genuinely no content", () => {
    expect(
      decide_draft_close_action({
        has_content: false,
        body_empty: true,
        is_edit_draft: false,
        user_modified: true,
        low_network_mode: false,
      }),
    ).toBe("delete");
  });

  it("saves an edited draft even when the body is empty outside low-network mode", () => {
    expect(
      decide_draft_close_action({
        has_content: true,
        body_empty: true,
        is_edit_draft: true,
        user_modified: false,
        low_network_mode: false,
      }),
    ).toBe("save");
  });
});
