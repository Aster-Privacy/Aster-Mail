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
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { evaluate_sender_trust } from "@/lib/sender_trust";

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, values?: Record<string, string>) =>
      values ? `${key} ${Object.values(values).join(" ")}` : key,
    language: "en",
  }),
}));

const { SenderTrustBanner } = await import("./sender_trust_banner");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function render(element: React.ReactElement): HTMLDivElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(element);
  });

  return container;
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

const external = {
  spf_result: "pass",
  dkim_result: "pass",
  dmarc_result: "pass",
  sender_aligned: true,
  own_addresses: ["me@astermail.org"],
  contacts: [],
};

describe("SenderTrustBanner", () => {
  it("renders nothing without a trust result or for an ordinary sender", () => {
    expect(render(<SenderTrustBanner trust={null} />).innerHTML).toBe("");
    act(() => {
      root!.render(
        <SenderTrustBanner
          trust={evaluate_sender_trust({
            ...external,
            name: "Dana Whitfield",
            email: "dana@whitfield.example",
          })}
        />,
      );
    });
    expect(container!.innerHTML).toBe("");
  });

  it("warns with the real address when the name shows a different address", () => {
    const trust = evaluate_sender_trust({
      ...external,
      name: "billing@bank.example",
      email: "x9@mailer.example",
    });
    const node = render(<SenderTrustBanner trust={trust} />);
    const alert = node.querySelector('[role="alert"]');

    expect(trust.warning?.kind).toBe("address_in_name");
    expect(alert?.getAttribute("data-warning")).toBe("address_in_name");
    expect(alert?.textContent).toContain("mail.sender_warning_title");
    expect(
      Array.from(alert!.querySelectorAll("bdi")).map((b) => b.textContent),
    ).toContain("x9@mailer.example");
  });

  it("renders hostile values as text, never as markup", () => {
    const trust = evaluate_sender_trust({
      ...external,
      name: "<img src=x onerror=alert(1)> billing@bank.example",
      email: "x9@mailer.example",
      reply_to: '"><script>1</script>@elsewhere.example',
    });
    const node = render(<SenderTrustBanner trust={trust} />);

    expect(node.querySelector("img")).toBeNull();
    expect(node.querySelector("script")).toBeNull();
  });

  it("shows a quiet note when replies go to another domain", () => {
    const trust = evaluate_sender_trust({
      ...external,
      name: "Dana Whitfield",
      email: "dana@whitfield.example",
      reply_to: "collect@elsewhere.example",
    });
    const node = render(<SenderTrustBanner trust={trust} />);

    expect(node.querySelector('[role="alert"]')).toBeNull();
    expect(
      Array.from(node.querySelectorAll('[role="note"] bdi')).map(
        (b) => b.textContent,
      ),
    ).toContain("collect@elsewhere.example");
  });
});
