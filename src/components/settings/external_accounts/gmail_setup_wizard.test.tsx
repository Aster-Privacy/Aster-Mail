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
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@aster/ui", () => ({
  Button: ({
    children,
    disabled,
    onClick,
  }: {
    children: React.ReactNode;
    disabled?: boolean;
    onClick?: () => void;
  }) => (
    <button disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/modal", () => ({
  Modal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ModalTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: Record<string, unknown>) => <input {...props} />,
}));

vi.mock("@/components/ui/spinner", () => ({
  Spinner: () => <span>spinner</span>,
}));

vi.mock("@/components/settings/external_accounts/test_result_banner", () => ({
  TestResultBanner: ({ result }: { result: { message: string } }) => (
    <div>{result.message}</div>
  ),
}));

const { GmailSetupWizard } = await import("./gmail_setup_wizard");

let container: HTMLDivElement;
let root: Root;

const default_props = {
  form_email: "",
  form_password: "",
  handle_email_change: vi.fn(),
  handle_password_change: vi.fn(),
  handle_test_connection: vi.fn(),
  handle_submit: vi.fn(),
  close_form: vi.fn(),
  is_testing: false,
  is_submitting: false,
  is_form_busy: false,
  test_result: null as { success: boolean; message: string } | null,
  t: (key: string) => key,
};

type WizardProps = typeof default_props;

async function render_wizard(overrides: Partial<WizardProps> = {}) {
  const props: WizardProps = { ...default_props, ...overrides };

  await act(async () => {
    root.render(<GmailSetupWizard {...props} />);
  });

  return props;
}

function buttons() {
  return Array.from(container.querySelectorAll("button"));
}

function find_button(label: string) {
  return buttons().find((b) => b.textContent?.includes(label));
}

async function click(label: string) {
  const button = find_button(label);

  expect(button).toBeTruthy();

  await act(async () => {
    button?.click();
  });
}

describe("GmailSetupWizard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("opens on the first step with its progress shown", async () => {
    await render_wizard();

    expect(container.textContent).toContain("settings.gmail_wizard_title");
    expect(container.textContent).toContain("settings.gmail_wizard_progress");
    expect(container.textContent).toContain(
      "settings.gmail_wizard_step_1_title",
    );
    expect(find_button("common.cancel")).toBeTruthy();
  });

  it("links to Google 2-Step Verification in a safe new tab", async () => {
    await render_wizard();

    const link = container.querySelector("a");

    expect(link?.getAttribute("href")).toBe(
      "https://myaccount.google.com/signinoptions/two-step-verification",
    );
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toContain("noopener");
    expect(link?.getAttribute("rel")).toContain("noreferrer");
  });

  it("links to app passwords and names the accounts that cannot use one", async () => {
    await render_wizard();

    await click("common.next");

    expect(container.textContent).toContain(
      "settings.gmail_wizard_step_2_title",
    );
    expect(container.textContent).toContain(
      "settings.gmail_sync_note_unavailable",
    );
    expect(container.querySelector("a")?.getAttribute("href")).toBe(
      "https://myaccount.google.com/apppasswords",
    );
  });

  it("closes the form from the first step and goes back from later ones", async () => {
    const props = await render_wizard();

    await click("common.next");

    expect(container.textContent).toContain(
      "settings.gmail_wizard_step_2_title",
    );

    await click("common.back");

    expect(container.textContent).toContain(
      "settings.gmail_wizard_step_1_title",
    );
    expect(props.close_form).not.toHaveBeenCalled();

    await click("common.cancel");

    expect(props.close_form).toHaveBeenCalled();
  });

  it("blocks the address step until the address looks like an email", async () => {
    await render_wizard({ form_email: "not-an-address" });

    await click("common.next");
    await click("common.next");

    expect(container.textContent).toContain(
      "settings.gmail_wizard_step_3_title",
    );
    expect(find_button("common.next")?.disabled).toBe(true);
  });

  it("reaches the password step once the address is valid", async () => {
    const props = await render_wizard({ form_email: "you@gmail.com" });

    await click("common.next");
    await click("common.next");

    const email_input = container.querySelector(
      "#gmail-wizard-email",
    ) as HTMLInputElement | null;

    expect(email_input?.value).toBe("you@gmail.com");

    await click("common.next");

    expect(container.textContent).toContain(
      "settings.gmail_wizard_step_4_title",
    );
    expect(props.handle_submit).not.toHaveBeenCalled();
  });

  it("keeps the app password hidden until the user reveals it", async () => {
    await render_wizard({
      form_email: "you@gmail.com",
      form_password: "abcdefghijklmnop",
    });

    await click("common.next");
    await click("common.next");
    await click("common.next");

    const password_input = () =>
      container.querySelector("#gmail-wizard-password") as HTMLInputElement;

    expect(password_input().getAttribute("type")).toBe("password");

    const reveal = buttons().find(
      (b) =>
        b.getAttribute("aria-label") ===
        "settings.gmail_wizard_reveal_password",
    );

    await act(async () => {
      reveal?.click();
    });

    expect(password_input().getAttribute("type")).toBe("text");
  });

  it("only offers a connection test on the last step, and blocks it while empty", async () => {
    await render_wizard({ form_email: "you@gmail.com" });

    expect(find_button("settings.test_connection")).toBeFalsy();

    await click("common.next");
    await click("common.next");
    await click("common.next");

    expect(find_button("settings.test_connection")?.disabled).toBe(true);
    expect(find_button("settings.gmail_wizard_connect")?.disabled).toBe(true);
  });

  it("tests and submits once the app password is filled in", async () => {
    const props = await render_wizard({
      form_email: "you@gmail.com",
      form_password: "abcdefghijklmnop",
    });

    await click("common.next");
    await click("common.next");
    await click("common.next");

    await click("settings.test_connection");

    expect(props.handle_test_connection).toHaveBeenCalled();

    await click("settings.gmail_wizard_connect");

    expect(props.handle_submit).toHaveBeenCalled();
  });

  it("shows the result of a connection test", async () => {
    await render_wizard({
      form_email: "you@gmail.com",
      form_password: "abcdefghijklmnop",
      test_result: { success: false, message: "auth failed" },
    });

    await click("common.next");
    await click("common.next");
    await click("common.next");

    expect(container.textContent).toContain("auth failed");
  });

  it("locks every action while the form is busy", async () => {
    await render_wizard({ is_form_busy: true, is_submitting: true });

    for (const button of buttons()) {
      if (button.getAttribute("aria-label")) continue;
      expect(button.disabled).toBe(true);
    }
  });
});
