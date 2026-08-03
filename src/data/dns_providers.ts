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
export type RootHostStyle = "at" | "blank";

export interface DnsProvider {
  id: string;
  name: string;
  ns_patterns: RegExp[];
  instructions_key: string;
  root_host_style: RootHostStyle;
  needs_fqdn_host: boolean;
  dashboard_url?: string;
}

export const DEFAULT_ROOT_HOST_STYLE: RootHostStyle = "at";

export function format_root_host(provider: DnsProvider | null): string {
  if (provider?.root_host_style === "blank") return "";

  return "@";
}

export function format_record_host(
  host: string,
  domain: string,
  provider: DnsProvider | null,
): string {
  if (host === "@") {
    if (provider?.needs_fqdn_host) return domain;

    return format_root_host(provider);
  }

  if (provider?.needs_fqdn_host) return `${host}.${domain}`;

  return host;
}

export function provider_dashboard_url(
  provider: DnsProvider | null,
  domain: string,
): string | null {
  if (!provider?.dashboard_url) return null;

  return provider.dashboard_url.replace("{domain}", encodeURIComponent(domain));
}

export const DNS_PROVIDERS: DnsProvider[] = [
  {
    id: "cloudflare",
    name: "Cloudflare",
    ns_patterns: [/\.ns\.cloudflare\.com$/i],
    instructions_key: "cloudflare",
    root_host_style: "at",
    needs_fqdn_host: false,
    dashboard_url: "https://dash.cloudflare.com/?to=/:account/{domain}/dns",
  },
  {
    id: "godaddy",
    name: "GoDaddy",
    ns_patterns: [/\.domaincontrol\.com$/i],
    instructions_key: "godaddy",
    root_host_style: "at",
    needs_fqdn_host: false,
    dashboard_url: "https://dcc.godaddy.com/control/{domain}/dns",
  },
  {
    id: "namecheap",
    name: "Namecheap",
    ns_patterns: [/\.registrar-servers\.com$/i],
    instructions_key: "namecheap",
    root_host_style: "at",
    needs_fqdn_host: false,
    dashboard_url:
      "https://ap.www.namecheap.com/domains/domaincontrolpanel/{domain}/advancedns",
  },
  {
    id: "google",
    name: "Google Domains / Squarespace",
    ns_patterns: [/\.googledomains\.com$/i, /\.google\.com$/i],
    instructions_key: "google",
    root_host_style: "at",
    needs_fqdn_host: false,
    dashboard_url: "https://account.squarespace.com/domains",
  },
  {
    id: "route53",
    name: "Amazon Route 53",
    ns_patterns: [/\.awsdns-\d+\./i],
    instructions_key: "route53",
    root_host_style: "blank",
    needs_fqdn_host: true,
    dashboard_url: "https://console.aws.amazon.com/route53/v2/hostedzones",
  },
  {
    id: "hover",
    name: "Hover",
    ns_patterns: [/\.hover\.com$/i],
    instructions_key: "hover",
    root_host_style: "at",
    needs_fqdn_host: false,
    dashboard_url: "https://www.hover.com/control_panel/domain/{domain}/dns",
  },
  {
    id: "porkbun",
    name: "Porkbun",
    ns_patterns: [/\.porkbun\.com$/i],
    instructions_key: "porkbun",
    root_host_style: "blank",
    needs_fqdn_host: false,
    dashboard_url: "https://porkbun.com/account/dns/{domain}",
  },
  {
    id: "namesilo",
    name: "NameSilo",
    ns_patterns: [/\.namesilo\.com$/i, /\.dnsowl\.com$/i],
    instructions_key: "namesilo",
    root_host_style: "blank",
    needs_fqdn_host: false,
    dashboard_url: "https://www.namesilo.com/account_domains.php",
  },
  {
    id: "gandi",
    name: "Gandi",
    ns_patterns: [/\.gandi\.net$/i],
    instructions_key: "gandi",
    root_host_style: "at",
    needs_fqdn_host: false,
    dashboard_url: "https://admin.gandi.net/domain/{domain}/records",
  },
  {
    id: "ovh",
    name: "OVH",
    ns_patterns: [/\.ovh\.net$/i],
    instructions_key: "ovh",
    root_host_style: "blank",
    needs_fqdn_host: false,
    dashboard_url: "https://www.ovh.com/manager/#/web/domain/{domain}/zone",
  },
  {
    id: "digitalocean",
    name: "DigitalOcean",
    ns_patterns: [/\.digitalocean\.com$/i],
    instructions_key: "digitalocean",
    root_host_style: "at",
    needs_fqdn_host: false,
    dashboard_url: "https://cloud.digitalocean.com/networking/domains/{domain}",
  },
  {
    id: "hetzner",
    name: "Hetzner",
    ns_patterns: [/\.hetzner\.com$/i],
    instructions_key: "hetzner",
    root_host_style: "at",
    needs_fqdn_host: false,
    dashboard_url: "https://dns.hetzner.com/",
  },
  {
    id: "vercel",
    name: "Vercel",
    ns_patterns: [/\.vercel-dns\.com$/i],
    instructions_key: "vercel",
    root_host_style: "blank",
    needs_fqdn_host: false,
    dashboard_url: "https://vercel.com/dashboard/domains",
  },
];

interface DohAnswer {
  name: string;
  type: number;
  data: string;
}

interface DohResponse {
  Status: number;
  Answer?: DohAnswer[];
}

export async function detect_dns_provider(
  domain: string,
): Promise<DnsProvider | null> {
  try {
    const { connection_store } = await import(
      "@/services/routing/connection_store"
    );
    const method = connection_store.get_method();

    if (method === "tor" || method === "tor_snowflake") {
      return null;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    const response = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=NS`,
      {
        headers: { Accept: "application/dns-json" },
        signal: controller.signal,
      },
    );

    clearTimeout(timeout);

    if (!response.ok) return null;

    const data: DohResponse = await response.json();

    if (!data.Answer || data.Answer.length === 0) return null;

    const ns_records = data.Answer.filter((a) => a.type === 2).map((a) =>
      a.data.replace(/\.$/, ""),
    );

    for (const provider of DNS_PROVIDERS) {
      for (const ns of ns_records) {
        if (provider.ns_patterns.some((pattern) => pattern.test(ns))) {
          return provider;
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}
