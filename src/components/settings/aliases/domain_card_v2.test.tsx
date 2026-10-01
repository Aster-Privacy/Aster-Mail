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

import type { CustomDomain } from "@/services/api/domains";

const stable_i18n = {
  t: (key: string, params?: Record<string, string>) =>
    params?.domain ? `${key}|${params.domain}` : key,
};

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => stable_i18n,
}));

const show_toast = vi.fn();

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: (...args: unknown[]) => show_toast(...args),
}));

vi.mock("@/components/modals/confirmation_modal", () => ({
  ConfirmationModal: ({
    is_open,
    on_confirm,
    on_cancel,
    message,
    title,
    variant,
  }: {
    is_open: boolean;
    on_confirm: () => void;
    on_cancel: () => void;
    message: string;
    title: string;
    variant?: string;
  }) =>
    is_open ? (
      <div data-testid="confirm-modal" data-variant={variant}>
        <p data-testid="confirm-title">{title}</p>
        <p data-testid="confirm-message">{message}</p>
        <button data-testid="confirm-cancel" onClick={on_cancel}>
          cancel
        </button>
        <button data-testid="confirm-ok" onClick={on_confirm}>
          ok
        </button>
      </div>
    ) : null,
}));

vi.mock("@/components/ui/spinner", () => ({
  Spinner: () => null,
}));

vi.mock("./dns_record_card", () => ({
  DnsRecordCard: ({ record }: { record: { host: string } }) => (
    <div data-testid="dns-record">{record.host}</div>
  ),
}));

vi.mock("./bimi/bimi_row", () => ({
  BimiRow: () => null,
}));

vi.mock("@aster/ui", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    "aria-label": aria_label,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    "aria-label"?: string;
  }) => (
    <button aria-label={aria_label} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
  Island: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  Switch: () => null,
}));

const rotate_dkim = vi.fn();
const get_dns_records = vi.fn();

vi.mock("@/services/api/domains", () => ({
  get_grace_days_remaining: () => 0,
  get_status_color: () => "",
  get_status_label: () => "",
  update_domain: vi.fn(),
  trigger_verification: vi.fn(),
  rotate_dkim: (id: string) => rotate_dkim(id),
  get_dns_records: (id: string) => get_dns_records(id),
}));

import { DomainCardV2 } from "./domain_card_v2";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const base_domain: CustomDomain = {
  id: "d1",
  domain_name: "example.com",
  status: "active",
  txt_verified: true,
  mx_verified: true,
  spf_verified: true,
  dkim_verified: true,
  dmarc_configured: true,
  catch_all_enabled: false,
  is_primary: false,
  health_status: "healthy",
  verification_token: "token",
  created_at: "2026-01-01T00:00:00Z",
};

const rotation_response = (dns_auto_published?: boolean) => ({
  data: {
    success: true,
    new_selector: "aster2",
    public_key: "AAAA",
    dns_record: {
      record_type: "TXT",
      host: "aster2._domainkey",
      value: "v=DKIM1; k=rsa; p=AAAA",
      purpose: "dkim",
      is_verified: false,
      priority: null,
      required: true,
    },
    ...(dns_auto_published === undefined ? {} : { dns_auto_published }),
  },
});

describe("DomainCardV2 DKIM rotation", () => {
  let container: HTMLDivElement;
  let root: Root;
  let on_domains_changed: ReturnType<typeof vi.fn<() => void>>;

  const flush = async () => {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  const click = async (element: Element | null) => {
    expect(element).not.toBeNull();
    await act(async () => {
      (element as HTMLElement).click();
    });
    await flush();
  };

  const find_button = (text: string) =>
    Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === text,
    ) ?? null;

  const render_card = async (domain: CustomDomain) => {
    await act(async () => {
      root.render(
        <DomainCardV2
          deleting={false}
          domain={domain}
          on_delete={vi.fn()}
          on_domains_changed={on_domains_changed}
          on_setup={vi.fn()}
        />,
      );
    });
    await click(container.querySelector('button[aria-label="example.com"]'));
    await click(find_button("settings.advanced_settings"));
  };

  beforeEach(() => {
    rotate_dkim.mockReset();
    get_dns_records.mockReset();
    show_toast.mockReset();
    on_domains_changed = vi.fn<() => void>();
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

  it("asks for confirmation before rotating", async () => {
    await render_card(base_domain);
    await click(find_button("settings.rotate_label"));

    expect(rotate_dkim).not.toHaveBeenCalled();
    expect(
      container.querySelector('[data-testid="confirm-message"]')?.textContent,
    ).toBe("settings.rotate_dkim_confirm_manual|example.com");
    expect(
      container
        .querySelector('[data-testid="confirm-modal"]')
        ?.getAttribute("data-variant"),
    ).toBe("warning");

    await click(container.querySelector('[data-testid="confirm-cancel"]'));

    expect(rotate_dkim).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="confirm-modal"]')).toBeNull();
  });

  it("uses the managed copy for purchased domains", async () => {
    await render_card({ ...base_domain, is_purchased: true });
    await click(find_button("settings.rotate_label"));

    expect(
      container.querySelector('[data-testid="confirm-message"]')?.textContent,
    ).toBe("settings.rotate_dkim_confirm_managed|example.com");
  });

  it("shows the manual record banner when DNS was not published", async () => {
    rotate_dkim.mockResolvedValue(rotation_response());
    await render_card(base_domain);
    await click(find_button("settings.rotate_label"));
    await click(container.querySelector('[data-testid="confirm-ok"]'));

    expect(rotate_dkim).toHaveBeenCalledWith("d1");
    expect(
      container.querySelector('[data-testid="dkim_rotated_banner"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="dns-record"]')?.textContent,
    ).toBe("aster2._domainkey");
    expect(show_toast).toHaveBeenCalledWith("settings.dkim_rotated", "success");
    expect(on_domains_changed).toHaveBeenCalled();
  });

  it("hides the manual record banner when DNS was published automatically", async () => {
    rotate_dkim.mockResolvedValue(rotation_response(true));
    await render_card({ ...base_domain, is_purchased: true });
    await click(find_button("settings.rotate_label"));
    await click(container.querySelector('[data-testid="confirm-ok"]'));

    expect(
      container.querySelector('[data-testid="dkim_rotated_banner"]'),
    ).toBeNull();
    expect(container.querySelector('[data-testid="dns-record"]')).toBeNull();
    expect(show_toast).toHaveBeenCalledWith(
      "settings.dkim_rotated_auto_published",
      "success",
    );
    expect(on_domains_changed).toHaveBeenCalled();
  });

  it("shows an error toast and no banner when rotation fails", async () => {
    rotate_dkim.mockResolvedValue({ error: "service unavailable" });
    await render_card({ ...base_domain, is_purchased: true });
    await click(find_button("settings.rotate_label"));
    await click(container.querySelector('[data-testid="confirm-ok"]'));

    expect(
      container.querySelector('[data-testid="dkim_rotated_banner"]'),
    ).toBeNull();
    expect(show_toast).toHaveBeenCalledWith(
      "common.something_went_wrong",
      "error",
    );
    expect(on_domains_changed).not.toHaveBeenCalled();
  });
});
