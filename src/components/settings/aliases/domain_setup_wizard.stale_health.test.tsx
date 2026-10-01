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
import type { DomainCheckOutcome, DomainHealth } from "@/services/api/domains";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { DomainSetupWizard } from "./domain_setup_wizard";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const stable_i18n = { t: (key: string) => key };

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => stable_i18n,
}));

vi.mock("@/components/ui/modal", () => ({
  Modal: ({
    is_open,
    children,
  }: {
    is_open: boolean;
    children: React.ReactNode;
  }) => (is_open ? <div>{children}</div> : null),
  ModalHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ModalTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ModalBody: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ModalFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

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
  Input: () => <input />,
}));

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  motion: {
    div: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  },
}));

vi.mock("./dns_checklist", () => ({
  DnsChecklist: ({ steps }: { steps: { id: string; status: string }[] }) => (
    <ol>
      {steps.map((step) => (
        <li key={step.id} data-status={step.status} data-step={step.id} />
      ))}
    </ol>
  ),
}));

vi.mock("./dns_step_content", () => ({
  DnsStepContent: () => null,
}));

vi.mock("@/components/auth/turnstile_widget", () => ({
  TurnstileWidget: () => null,
  TURNSTILE_SITE_KEY: "",
}));

vi.mock("@/data/dns_providers", () => ({
  detect_dns_provider: () => Promise.resolve(null),
}));

const get_domain_health = vi.fn();
const trigger_verification = vi.fn();

vi.mock("@/services/api/domains", () => ({
  add_domain: vi.fn(),
  validate_domain_name: () => ({ valid: true }),
  get_domain_health: (id: string) => get_domain_health(id),
  trigger_verification: (id: string) => trigger_verification(id),
}));

const CHECKED_KEYS = ["mx", "spf", "dkim", "dmarc"] as const;

function health(
  outcome: DomainCheckOutcome,
  cached: boolean,
): { data: DomainHealth } {
  return {
    data: {
      domain_id: "domain-1",
      domain_name: "example.com",
      status: "pending",
      health_status: outcome === "pass" ? "healthy" : "unhealthy",
      severity: outcome === "pass" ? "ok" : "critical",
      receiving_mail: outcome === "pass",
      sending_trusted: outcome === "pass",
      checks: CHECKED_KEYS.map((key) => ({ key, outcome })),
      reasons: [],
      checked_at: "2026-10-01T09:00:00Z",
      cached,
    },
  };
}

const ALL_VERIFIED = {
  data: {
    success: true,
    txt_verified: true,
    mx_verified: true,
    spf_verified: true,
    dkim_verified: true,
    dmarc_configured: true,
    status: "verified",
    message: "verified",
  },
};

let container: HTMLDivElement;
let root: Root;

async function flush() {
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function open_wizard() {
  await act(async () => {
    root.render(
      <DomainSetupWizard
        current_count={1}
        dns_records={[]}
        domain_id="domain-1"
        domain_name="example.com"
        is_open={true}
        max_domains={5}
        mode="dns"
        on_close={() => {}}
        on_domain_added={() => {}}
        on_domains_changed={() => {}}
      />,
    );
  });
  await flush();
}

async function click_verify() {
  const button = Array.from(container.querySelectorAll("button")).find(
    (candidate) =>
      candidate.textContent?.includes("settings.verify_all_records"),
  );

  expect(button).toBeDefined();
  await act(async () => {
    button!.click();
  });
  await flush();
}

function status_of(step: string): string | null {
  return (
    container
      .querySelector(`[data-step="${step}"]`)
      ?.getAttribute("data-status") ?? null
  );
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  get_domain_health.mockReset();
  trigger_verification.mockReset();
  trigger_verification.mockResolvedValue(ALL_VERIFIED);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("DomainSetupWizard automatic checks", () => {
  it("shows a cached health result before any manual check", async () => {
    get_domain_health.mockResolvedValue(health("fail", true));

    await open_wizard();

    for (const key of CHECKED_KEYS) expect(status_of(key)).toBe("failed");
  });

  it("does not let a cached health result undo a manual check", async () => {
    get_domain_health.mockResolvedValue(health("fail", true));

    await open_wizard();
    await click_verify();

    expect(get_domain_health.mock.calls.length).toBeGreaterThan(1);
    expect(status_of("verification")).toBe("verified");
    for (const key of CHECKED_KEYS) expect(status_of(key)).toBe("verified");
  });

  it("still applies a fresh health result after a manual check", async () => {
    get_domain_health
      .mockResolvedValueOnce(health("fail", true))
      .mockResolvedValue(health("fail", false));

    await open_wizard();
    await click_verify();

    expect(status_of("verification")).toBe("verified");
    for (const key of CHECKED_KEYS) expect(status_of(key)).toBe("failed");
  });

  it("forgets the manual check when the wizard opens again", async () => {
    get_domain_health.mockResolvedValue(health("fail", true));

    await open_wizard();
    await click_verify();
    await act(async () => {
      root.render(
        <DomainSetupWizard
          current_count={1}
          dns_records={[]}
          domain_id="domain-1"
          domain_name="example.com"
          is_open={false}
          max_domains={5}
          mode="dns"
          on_close={() => {}}
          on_domain_added={() => {}}
          on_domains_changed={() => {}}
        />,
      );
    });
    await open_wizard();

    for (const key of CHECKED_KEYS) expect(status_of(key)).toBe("failed");
  });
});
