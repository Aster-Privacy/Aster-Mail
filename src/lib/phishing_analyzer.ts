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
import { detect_homoglyph } from "@/lib/homoglyph_detector";
import {
  check_url_blocklist,
  verify_url_with_server,
} from "@/lib/phishing_blocklist";

export type PhishingLevel = "safe" | "suspicious" | "dangerous";

export interface PhishingSignal {
  name: string;
  category: string;
  description?: string;
}

export interface PhishingAnalysisResult {
  level: PhishingLevel;
  score: number;
  signals: PhishingSignal[];
  categories: Set<string>;
}

export interface CombinedPhishingResult {
  level: PhishingLevel;
  combined_score: number;
  server_score: number;
  client_score: number;
  all_signals: PhishingSignal[];
  all_categories: Set<string>;
}

interface ServerPhishingData {
  phishing_level?: string;
  phishing_score?: number;
  phishing_signals?: PhishingSignal[];
}

const URGENCY_PHRASES = [
  "your account will be suspended",
  "your account has been compromised",
  "verify your identity immediately",
  "confirm your payment information",
  "unauthorized login attempt",
  "your account will be closed",
  "action required within 24 hours",
  "failure to respond will result in",
  "click here to avoid account suspension",
  "your password has expired",
  "unusual sign-in activity",
  "verify your account now",
  "immediate action required",
  "your account is at risk",
  "security alert: unauthorized access",
  "update your billing information",
  "your package could not be delivered",
  "claim your prize now",
  "you have been selected",
  "act now or lose access",
];

const BRAND_DISPLAY_NAMES: Record<string, string[]> = {
  google: ["google.com", "gmail.com"],
  apple: ["apple.com", "icloud.com"],
  microsoft: ["microsoft.com", "outlook.com", "hotmail.com"],
  amazon: ["amazon.com"],
  paypal: ["paypal.com"],
  netflix: ["netflix.com"],
  facebook: ["facebook.com", "meta.com"],
  instagram: ["instagram.com"],
  linkedin: ["linkedin.com"],
  twitter: ["twitter.com", "x.com"],
  chase: ["chase.com"],
  "wells fargo": ["wellsfargo.com"],
  "bank of america": ["bankofamerica.com"],
  dropbox: ["dropbox.com"],
  github: ["github.com"],
  stripe: ["stripe.com"],
  coinbase: ["coinbase.com"],
  discord: ["discord.com"],
};

function extract_urls_from_html(html: string): string[] {
  const urls: string[] = [];
  const href_regex = /href\s*=\s*["']([^"']+)["']/gi;
  let match;

  while ((match = href_regex.exec(html)) !== null) {
    const url = match[1];

    if (url.startsWith("http://") || url.startsWith("https://")) {
      urls.push(url);
    }
  }

  return [...new Set(urls)];
}

function extract_domain(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function check_display_name_spoofing(
  sender_name: string,
  sender_email: string,
): PhishingSignal[] {
  const signals: PhishingSignal[] = [];
  const lower_name = sender_name.toLowerCase().trim();
  const sender_domain = sender_email.split("@")[1]?.toLowerCase() || "";

  for (const [brand, legit_domains] of Object.entries(BRAND_DISPLAY_NAMES)) {
    if (lower_name.includes(brand)) {
      const is_legit = legit_domains.some(
        (d) => sender_domain === d || sender_domain.endsWith("." + d),
      );

      if (!is_legit) {
        signals.push({
          name: "display_name_brand_spoof",
          category: "display_name",
          description: `Display name contains "${brand}" but email is from ${sender_domain}`,
        });
        break;
      }
    }
  }

  const email_in_name = lower_name.match(
    /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/,
  );

  if (email_in_name) {
    const name_email = email_in_name[0];

    if (name_email !== sender_email.toLowerCase()) {
      signals.push({
        name: "display_name_email_mismatch",
        category: "display_name",
        description: `Display name contains email "${name_email}" but actual sender is ${sender_email}`,
      });
    }
  }

  return signals;
}

async function check_url_blocklists(urls: string[]): Promise<PhishingSignal[]> {
  const signals: PhishingSignal[] = [];
  const suspicious_urls: string[] = [];

  for (const url of urls) {
    const is_blocked = await check_url_blocklist(url);

    if (is_blocked) {
      suspicious_urls.push(url);
    }
  }

  if (suspicious_urls.length > 0) {
    const verified = await verify_url_with_server(suspicious_urls);

    for (const url of verified) {
      signals.push({
        name: "url_on_blocklist",
        category: "url_blocklist",
        description: `Link to ${extract_domain(url)} is on a known phishing blocklist`,
      });
    }
  }

  return signals;
}

function check_homoglyphs(urls: string[]): PhishingSignal[] {
  const signals: PhishingSignal[] = [];
  const checked = new Set<string>();

  for (const url of urls) {
    const domain = extract_domain(url);

    if (!domain || checked.has(domain)) continue;
    checked.add(domain);

    const result = detect_homoglyph(domain);

    if (result.is_suspicious) {
      signals.push({
        name: "homoglyph_domain",
        category: "homoglyph",
        description: result.matched_brand
          ? `Link domain "${domain}" impersonates ${result.matched_brand} (${result.matched_domain})`
          : `Link domain "${domain}" uses mixed character scripts`,
      });
    }
  }

  return signals;
}

function check_urgency_language(
  text: string,
  has_other_signals: boolean,
): PhishingSignal[] {
  if (!has_other_signals) return [];

  const signals: PhishingSignal[] = [];
  const lower_text = text.toLowerCase();

  for (const phrase of URGENCY_PHRASES) {
    if (lower_text.includes(phrase)) {
      signals.push({
        name: "urgency_language",
        category: "urgency",
        description: `Contains urgency phrase: "${phrase}"`,
      });
      break;
    }
  }

  return signals;
}

export async function analyze_email_content(
  html_content: string,
  text_content: string,
  sender_name: string,
  sender_email: string,
  is_external: boolean,
): Promise<PhishingAnalysisResult> {
  if (!is_external) {
    return { level: "safe", score: 0, signals: [], categories: new Set() };
  }

  const signals: PhishingSignal[] = [];

  const display_name_signals = check_display_name_spoofing(
    sender_name,
    sender_email,
  );

  signals.push(...display_name_signals);

  const urls = extract_urls_from_html(html_content || text_content);

  const [blocklist_signals, homoglyph_signals] = await Promise.all([
    check_url_blocklists(urls),
    Promise.resolve(check_homoglyphs(urls)),
  ]);

  signals.push(...blocklist_signals);
  signals.push(...homoglyph_signals);

  const has_primary_signal = signals.length > 0;
  const urgency_signals = check_urgency_language(
    text_content || html_content,
    has_primary_signal,
  );

  signals.push(...urgency_signals);

  const categories = new Set(signals.map((s) => s.category));

  const weights: Record<string, number> = {
    url_on_blocklist: 5.0,
    homoglyph_domain: 5.0,
    display_name_brand_spoof: 3.0,
    display_name_email_mismatch: 2.0,
    urgency_language: 0.5,
  };

  let score = 0;

  for (const signal of signals) {
    score += weights[signal.name] || 1.0;
  }

  let level: PhishingLevel = "safe";

  if (score >= 12.0 && categories.size >= 3) {
    level = "dangerous";
  } else if (score >= 6.0 && categories.size >= 2) {
    level = "suspicious";
  }

  return { level, score, signals, categories };
}

export function combine_phishing_results(
  server_data: ServerPhishingData,
  client_result: PhishingAnalysisResult,
): CombinedPhishingResult {
  const server_score = server_data.phishing_score || 0;
  const server_signals = server_data.phishing_signals || [];
  const server_categories = new Set(server_signals.map((s) => s.category));

  const combined_score = server_score + client_result.score;
  const all_signals = [...server_signals, ...client_result.signals];
  const all_categories = new Set([
    ...server_categories,
    ...client_result.categories,
  ]);

  let level: PhishingLevel = "safe";

  if (combined_score >= 12.0 && all_categories.size >= 3) {
    level = "dangerous";
  } else if (combined_score >= 6.0 && all_categories.size >= 2) {
    level = "suspicious";
  }

  if (
    server_data.phishing_level === "dangerous" &&
    client_result.signals.length === 0
  ) {
    level = "suspicious";
  }

  return {
    level,
    combined_score,
    server_score,
    client_score: client_result.score,
    all_signals,
    all_categories,
  };
}
