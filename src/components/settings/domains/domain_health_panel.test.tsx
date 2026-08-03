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

import { en } from "@/lib/i18n/translations/en";
import type { DnsProvider } from "@/data/dns_providers";
import type { DomainCheck, DomainHealth } from "@/services/api/domains";

function translate(key: string, params?: Record<string, string | number>) {
  const text = key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === "object"
          ? (node as Record<string, unknown>)[part]
          : undefined,
      en,
    );

  if (typeof text !== "string") return key;
  if (!params) return text;

  return Object.entries(params).reduce(
    (result, [name, value]) =>
      result.replace(new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`, "g"), String(value)),
    text,
  );
}

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: translate, language: "en" }),
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: vi.fn(),
}));

const get_domain_health = vi.fn();
const get_dns_records = vi.fn();

vi.mock("@/services/api/domains", () => ({
  get_domain_health: (...args: unknown[]) => get_domain_health(...args),
  get_dns_records: (...args: unknown[]) => get_dns_records(...args),
}));

const detect_dns_provider = vi.fn();

vi.mock("@/data/dns_providers", async (import_original) => {
  const actual =
    await import_original<typeof import("@/data/dns_providers")>();

  return {
    ...actual,
    detect_dns_provider: (...args: unknown[]) => detect_dns_provider(...args),
  };
});

const { DomainHealthPanel } = await import("./domain_health_panel");

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function render(): Promise<HTMLDivElement> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <DomainHealthPanel domain_id="d1" domain_name="example.com" />,
    );
  });

  return container;
}

function health(
  severity: DomainHealth["severity"],
  checks: DomainCheck[],
  overrides: Partial<DomainHealth> = {},
): DomainHealth {
  return {
    domain_id: "d1",
    domain_name: "example.com",
    status: "active",
    health_status: severity === "ok" ? "healthy" : "degraded",
    severity,
    receiving_mail: severity !== "critical",
    sending_trusted: severity === "ok",
    checks,
    reasons: [],
    checked_at: "2026-08-03T12:00:00Z",
    cached: false,
    ...overrides,
  };
}

const ALL_PASSING: DomainCheck[] = [
  { key: "mx", outcome: "pass" },
  { key: "spf", outcome: "pass" },
  { key: "dkim", outcome: "pass" },
  { key: "dmarc", outcome: "pass" },
];

const CLOUDFLARE: DnsProvider = {
  id: "cloudflare",
  name: "Cloudflare",
  ns_patterns: [],
  instructions_key: "cloudflare",
  root_host_style: "at",
  needs_fqdn_host: false,
  dashboard_url: "https://dash.cloudflare.com/?to=/:account/{domain}/dns",
};

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  get_domain_health.mockReset();
  get_dns_records.mockReset();
  detect_dns_provider.mockReset();
  get_dns_records.mockResolvedValue({ data: { records: [] } });
  detect_dns_provider.mockResolvedValue(null);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
  vi.useRealTimers();
});

describe("DomainHealthPanel", () => {
  it("tells the user mail is not arriving when MX is broken", async () => {
    get_domain_health.mockResolvedValue({
      data: health("critical", [
        { key: "mx", outcome: "fail", reason: "mx_missing" },
        { key: "spf", outcome: "pass" },
        { key: "dkim", outcome: "pass" },
        { key: "dmarc", outcome: "pass" },
      ]),
    });

    const el = await render();

    expect(el.textContent).toContain("You are not receiving email");
    expect(el.textContent).toContain("Nobody can email you yet");
  });

  it("does not cry wolf when only DMARC is missing", async () => {
    get_domain_health.mockResolvedValue({
      data: health("warning", [
        { key: "mx", outcome: "pass" },
        { key: "spf", outcome: "pass" },
        { key: "dkim", outcome: "pass" },
        { key: "dmarc", outcome: "fail", reason: "dmarc_missing" },
      ]),
    });

    const el = await render();

    expect(el.textContent).toContain("Mail works, but it may land in spam");
    expect(el.textContent).not.toContain("You are not receiving email");
  });

  it("names the domain and stops polling once everything passes", async () => {
    get_domain_health.mockResolvedValue({
      data: health("ok", ALL_PASSING),
    });

    const el = await render();

    expect(el.textContent).toContain("example.com is working");
    expect(get_domain_health).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });

    expect(get_domain_health).toHaveBeenCalledTimes(1);
  });

  it("keeps rechecking on its own while the domain is unhealthy", async () => {
    get_domain_health.mockResolvedValue({
      data: health("warning", [
        { key: "mx", outcome: "pass" },
        { key: "spf", outcome: "fail", reason: "spf_missing" },
        { key: "dkim", outcome: "pass" },
        { key: "dmarc", outcome: "pass" },
      ]),
    });

    const el = await render();

    expect(el.textContent).toContain("Checking again automatically");
    expect(get_domain_health).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });

    expect(get_domain_health).toHaveBeenCalledTimes(2);
  });

  it("shows failing checks before passing ones", async () => {
    get_domain_health.mockResolvedValue({
      data: health("warning", [
        { key: "mx", outcome: "pass" },
        { key: "spf", outcome: "pass" },
        { key: "dkim", outcome: "fail", reason: "dkim_missing_or_stale" },
        { key: "dmarc", outcome: "pass" },
      ]),
    });

    const el = await render();
    const body = el.textContent ?? "";

    expect(body.indexOf("Message signing")).toBeLessThan(
      body.indexOf("Receiving mail"),
    );
  });

  it("rechecks immediately when the user asks", async () => {
    get_domain_health.mockResolvedValue({
      data: health("ok", ALL_PASSING),
    });

    const el = await render();

    expect(get_domain_health).toHaveBeenCalledTimes(1);

    const recheck = Array.from(el.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Check now"),
    );

    expect(recheck).toBeTruthy();

    await act(async () => {
      recheck!.click();
    });

    expect(get_domain_health).toHaveBeenCalledTimes(2);
  });

  it("reveals the exact record to add for a failing check", async () => {
    get_domain_health.mockResolvedValue({
      data: health("critical", [
        { key: "mx", outcome: "fail", reason: "mx_missing" },
        { key: "spf", outcome: "pass" },
        { key: "dkim", outcome: "pass" },
        { key: "dmarc", outcome: "pass" },
      ]),
    });
    get_dns_records.mockResolvedValue({
      data: {
        records: [
          {
            record_type: "MX",
            host: "@",
            value: "mx.astermail.org",
            purpose: "mx",
            is_verified: false,
            priority: 10,
          },
        ],
      },
    });

    const el = await render();

    expect(el.textContent).not.toContain("mx.astermail.org");

    const reveal = Array.from(el.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Show me the record"),
    );

    expect(reveal).toBeTruthy();

    await act(async () => {
      reveal!.click();
    });

    expect(el.textContent).toContain("mx.astermail.org");
  });

  it("renders the host in the format the detected provider expects", async () => {
    detect_dns_provider.mockResolvedValue({
      ...CLOUDFLARE,
      id: "route53",
      name: "Amazon Route 53",
      root_host_style: "blank",
      needs_fqdn_host: true,
    });
    get_domain_health.mockResolvedValue({
      data: health("critical", [
        { key: "mx", outcome: "fail", reason: "mx_missing" },
        { key: "spf", outcome: "pass" },
        { key: "dkim", outcome: "pass" },
        { key: "dmarc", outcome: "pass" },
      ]),
    });
    get_dns_records.mockResolvedValue({
      data: {
        records: [
          {
            record_type: "MX",
            host: "@",
            value: "mx.astermail.org",
            purpose: "mx",
            is_verified: false,
          },
        ],
      },
    });

    const el = await render();
    const reveal = Array.from(el.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Show me the record"),
    );

    await act(async () => {
      reveal!.click();
    });

    const code = Array.from(el.querySelectorAll("code")).map(
      (c) => c.textContent,
    );

    expect(code).toContain("example.com");
    expect(code).not.toContain("@");
  });

  it("links the user straight to their DNS dashboard", async () => {
    detect_dns_provider.mockResolvedValue(CLOUDFLARE);
    get_domain_health.mockResolvedValue({
      data: health("warning", [
        { key: "mx", outcome: "pass" },
        { key: "spf", outcome: "pass" },
        { key: "dkim", outcome: "pass" },
        { key: "dmarc", outcome: "fail", reason: "dmarc_missing" },
      ]),
    });

    const el = await render();
    const link = el.querySelector("a");

    expect(el.textContent).toContain("Your DNS is managed by Cloudflare");
    expect(link?.getAttribute("href")).toBe(
      "https://dash.cloudflare.com/?to=/:account/example.com/dns",
    );
    expect(link?.getAttribute("rel")).toContain("noopener");
  });

  it("says it could not read DNS rather than claiming the domain is broken", async () => {
    get_domain_health.mockResolvedValue({
      data: health("critical", [{ key: "mx", outcome: "unknown" }], {
        health_status: "unknown",
      }),
    });

    const el = await render();

    expect(el.textContent).toContain("We could not read your DNS");
    expect(el.textContent).not.toContain("You are not receiving email");
  });

  it("degrades to the unknown state when the request fails", async () => {
    get_domain_health.mockRejectedValue(new Error("network down"));

    const el = await render();

    expect(el.textContent).toContain("We could not read your DNS");
  });
});
