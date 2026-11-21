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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const start_oauth_authorize = vi.fn();
const show_toast = vi.fn();
const invoke = vi.fn();

vi.mock("@/services/api/external_accounts", () => ({
  start_oauth_authorize: (...args: unknown[]) => start_oauth_authorize(...args),
}));
vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: (...args: unknown[]) => show_toast(...args),
}));
vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, params?: Record<string, string>) =>
      params?.reason ? `${key}:${params.reason}` : key,
  }),
}));
vi.mock("@/components/ui/modal", () => ({
  Modal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ModalBody: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("@/components/ui/spinner", () => ({ ButtonSpinner: () => <span /> }));
vi.mock("@aster/ui", () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
}));
vi.mock("@/native/desktop_oauth_bridge", () => ({
  DESKTOP_OAUTH_CALLBACK_EVENT: "aster_desktop_oauth_callback",
  DESKTOP_OAUTH_RETURN_TO: "desktop",
  expect_oauth_state: () => true,
}));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

const { ConnectProviderModal } = await import("./connect_provider_modal");

type Provider = "google" | "microsoft" | "yahoo";

const real_sign_in_urls: [Provider, string][] = [
  [
    "google",
    "https://accounts.google.com/o/oauth2/v2/auth?client_id=c&state=s1",
  ],
  [
    "microsoft",
    "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?state=s2",
  ],
  ["yahoo", "https://api.login.yahoo.com/oauth2/request_auth?state=s3"],
];

const refused_sign_in_urls: [Provider, string][] = [
  ["google", "https://accounts-login.example/o/oauth2/auth?state=s1"],
  ["google", "https://accounts.google.com.evil.example/o/oauth2/v2/auth"],
  ["google", "https://accounts-google.com/o/oauth2/v2/auth"],
  ["google", "https://accounts.google.com:8443/o/oauth2/v2/auth"],
  ["google", "https://user@accounts.google.com/o/oauth2/v2/auth"],
  ["google", "http://accounts.google.com/o/oauth2/v2/auth"],
  ["google", "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"],
  ["microsoft", "https://login.microsoftonline.com.evil.example/authorize"],
  ["microsoft", "https://login-microsoftonline.com/common/oauth2/authorize"],
  ["yahoo", "https://api.login.yahoo.com.evil.example/oauth2/request_auth"],
  ["yahoo", "https://accounts.google.com/o/oauth2/v2/auth"],
];

const refusal_toast =
  "settings.oauth_import_error:settings.oauth_reason_unknown";

let container: HTMLDivElement;
let root: Root;
let open_spy: ReturnType<typeof vi.spyOn>;

function set_desktop(on: boolean) {
  const target = window as unknown as Record<string, unknown>;

  if (on) target.__TAURI__ = {};
  else delete target.__TAURI__;
}

async function render_and_connect(provider: Provider, authorize_url: string) {
  start_oauth_authorize.mockResolvedValue({ data: { authorize_url } });
  await act(async () => {
    root.render(
      <ConnectProviderModal on_close={() => {}} provider={provider} />,
    );
  });
  const button = Array.from(container.querySelectorAll("button")).find(
    (node) => node.textContent === `settings.connect_sign_in_${provider}`,
  );

  expect(button).toBeTruthy();
  await act(async () => {
    button?.click();
  });
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  start_oauth_authorize.mockReset();
  show_toast.mockReset();
  invoke.mockReset();
  invoke.mockResolvedValue(undefined);
  open_spy = vi
    .spyOn(window, "open")
    .mockReturnValue({ closed: false } as unknown as Window);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  open_spy.mockRestore();
  set_desktop(false);
});

describe("connect provider sign-in link", () => {
  it.each(real_sign_in_urls)(
    "opens the %s sign-in page",
    async (provider, url) => {
      await render_and_connect(provider, url);

      expect(open_spy).toHaveBeenCalledTimes(1);
      expect(open_spy.mock.calls[0][0]).toBe(new URL(url).toString());
      expect(show_toast).not.toHaveBeenCalled();
    },
  );

  it.each(refused_sign_in_urls)(
    "refuses a %s sign-in link to %s",
    async (provider, url) => {
      await render_and_connect(provider, url);

      expect(open_spy).not.toHaveBeenCalled();
      expect(show_toast).toHaveBeenCalledWith(refusal_toast, "error");
    },
  );

  it.each(real_sign_in_urls)(
    "opens the %s sign-in page from the desktop app",
    async (provider, url) => {
      set_desktop(true);
      await render_and_connect(provider, url);

      expect(invoke).toHaveBeenCalledWith("open_external_url", {
        url: new URL(url).toString(),
      });
      expect(show_toast).not.toHaveBeenCalled();
    },
  );

  it("refuses a look-alike sign-in link in the desktop app", async () => {
    set_desktop(true);
    await render_and_connect(
      "google",
      "https://accounts-login.example/o/oauth2/auth?state=s1",
    );

    expect(invoke).not.toHaveBeenCalled();
    expect(show_toast).toHaveBeenCalledWith(refusal_toast, "error");
  });
});
