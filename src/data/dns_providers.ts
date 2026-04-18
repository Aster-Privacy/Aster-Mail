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
export interface DnsProvider {
  id: string;
  name: string;
  ns_patterns: RegExp[];
  instructions_key: string;
}

export const DNS_PROVIDERS: DnsProvider[] = [
  {
    id: "cloudflare",
    name: "Cloudflare",
    ns_patterns: [/\.ns\.cloudflare\.com$/i],
    instructions_key: "cloudflare",
  },
  {
    id: "godaddy",
    name: "GoDaddy",
    ns_patterns: [/\.domaincontrol\.com$/i],
    instructions_key: "godaddy",
  },
  {
    id: "namecheap",
    name: "Namecheap",
    ns_patterns: [/\.registrar-servers\.com$/i],
    instructions_key: "namecheap",
  },
  {
    id: "google",
    name: "Google Domains / Squarespace",
    ns_patterns: [/\.googledomains\.com$/i, /\.google\.com$/i],
    instructions_key: "google",
  },
  {
    id: "route53",
    name: "Amazon Route 53",
    ns_patterns: [/\.awsdns-\d+\./i],
    instructions_key: "route53",
  },
  {
    id: "hover",
    name: "Hover",
    ns_patterns: [/\.hover\.com$/i],
    instructions_key: "hover",
  },
  {
    id: "porkbun",
    name: "Porkbun",
    ns_patterns: [/\.porkbun\.com$/i],
    instructions_key: "porkbun",
  },
  {
    id: "gandi",
    name: "Gandi",
    ns_patterns: [/\.gandi\.net$/i],
    instructions_key: "gandi",
  },
  {
    id: "ovh",
    name: "OVH",
    ns_patterns: [/\.ovh\.net$/i],
    instructions_key: "ovh",
  },
  {
    id: "digitalocean",
    name: "DigitalOcean",
    ns_patterns: [/\.digitalocean\.com$/i],
    instructions_key: "digitalocean",
  },
  {
    id: "hetzner",
    name: "Hetzner",
    ns_patterns: [/\.hetzner\.com$/i],
    instructions_key: "hetzner",
  },
  {
    id: "vercel",
    name: "Vercel",
    ns_patterns: [/\.vercel-dns\.com$/i],
    instructions_key: "vercel",
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
