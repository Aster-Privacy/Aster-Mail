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
// GNU Affero General Public License for more details.
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

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/components/ui/dropdown_menu", () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  );

  return {
    DropdownMenu: Pass,
    DropdownMenuTrigger: Pass,
    DropdownMenuContent: Pass,
    DropdownMenuLabel: Pass,
    DropdownMenuSeparator: () => null,
    DropdownMenuItem: ({
      children,
      onSelect,
    }: {
      children: React.ReactNode;
      onSelect?: () => void;
    }) => (
      <button data-menu-item="" type="button" onClick={() => onSelect?.()}>
        {children}
      </button>
    ),
  };
});

import { AddConditionChip } from "@/components/mail_rules/add_condition_chip";
import { ConditionChip } from "@/components/mail_rules/condition_chip";
import { default_condition_for_field } from "@/components/mail_rules/field_kind";

const ALL_FIELDS = [
  "from",
  "reply_to",
  "to",
  "cc",
  "bcc",
  "any_recipient",
  "subject",
  "body",
  "header",
  "list_id",
  "has_attachment",
  "attachment_name",
  "attachment_size",
  "has_list_id",
  "is_reply",
  "is_forward",
  "is_auto_submitted",
  "has_calendar_invite",
  "recipient_count",
  "total_size",
  "date_received",
  "spam_score",
  "dkim_result",
  "spf_result",
  "dmarc_result",
];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function offered_fields(): string[] {
  return Array.from(container.querySelectorAll("[data-menu-item]"))
    .map((el) => el.textContent ?? "")
    .filter((text) => text.startsWith("mail_rules.field_"))
    .map((text) => text.slice("mail_rules.field_".length));
}

describe("mail rules field picker", () => {
  it("offers every field when adding a condition", () => {
    act(() => {
      root.render(<AddConditionChip on_pick={() => {}} />);
    });

    expect(offered_fields()).toEqual(ALL_FIELDS);
  });

  it("offers every field when changing a condition's field", () => {
    act(() => {
      root.render(
        <ConditionChip
          condition={default_condition_for_field("from")}
          on_change={() => {}}
          on_remove={() => {}}
        />,
      );
    });

    expect(offered_fields()).toEqual(ALL_FIELDS);
  });

  it("limits the picker to the allowed fields, keeping their order", () => {
    act(() => {
      root.render(
        <AddConditionChip
          allowed_fields={["subject", "from"]}
          on_pick={() => {}}
        />,
      );
    });

    expect(offered_fields()).toEqual(["from", "subject"]);
  });
});
