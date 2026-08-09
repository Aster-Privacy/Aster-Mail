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
import type { } from "@/lib/i18n/types";




export const MAX_ALIAS_WEBSITES = 10;
export const MAX_WEBSITE_URL_LENGTH = 200;

export function normalize_website_url(raw: string): string | null {
  const cleaned = raw.replace(/[\u0000-\u001f\u007f\s]/g, "");

  if (!cleaned) return null;

  const with_scheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(cleaned)
    ? cleaned
    : `https://${cleaned}`;

  if (with_scheme.length > MAX_WEBSITE_URL_LENGTH) return null;

  try {
    const parsed = new URL(with_scheme);

    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }
    if (!parsed.hostname || !parsed.hostname.includes(".")) return null;

    return with_scheme;
  } catch {
    return null;
  }
}

export const KNOWN_LONG_TLDS = new Set([
  "com",
  "net",
  "org",
  "edu",
  "gov",
  "mil",
  "int",
  "info",
  "biz",
  "name",
  "pro",
  "app",
  "dev",
  "art",
  "bar",
  "bet",
  "bid",
  "bio",
  "blog",
  "boo",
  "bot",
  "buy",
  "cab",
  "cafe",
  "cam",
  "camp",
  "car",
  "cards",
  "care",
  "cash",
  "casa",
  "chat",
  "city",
  "click",
  "cloud",
  "club",
  "code",
  "coffee",
  "college",
  "company",
  "computer",
  "cool",
  "coop",
  "credit",
  "data",
  "date",
  "day",
  "deals",
  "design",
  "diet",
  "digital",
  "direct",
  "dog",
  "domains",
  "download",
  "earth",
  "eco",
  "email",
  "energy",
  "eng",
  "events",
  "exchange",
  "expert",
  "family",
  "fan",
  "fans",
  "farm",
  "fashion",
  "film",
  "finance",
  "fish",
  "fit",
  "fitness",
  "flowers",
  "football",
  "forum",
  "foundation",
  "fun",
  "fund",
  "fyi",
  "gallery",
  "game",
  "games",
  "garden",
  "gift",
  "gives",
  "global",
  "gold",
  "golf",
  "graphics",
  "green",
  "group",
  "guide",
  "guru",
  "haus",
  "health",
  "help",
  "here",
  "hockey",
  "holdings",
  "holiday",
  "homes",
  "horse",
  "host",
  "hosting",
  "house",
  "how",
  "icu",
  "ink",
  "institute",
  "insure",
  "irish",
  "jobs",
  "jetzt",
  "kim",
  "kitchen",
  "land",
  "law",
  "lawyer",
  "lease",
  "legal",
  "life",
  "lighting",
  "limited",
  "link",
  "live",
  "loan",
  "loans",
  "lol",
  "love",
  "ltd",
  "luxury",
  "mail",
  "management",
  "market",
  "marketing",
  "media",
  "meet",
  "meme",
  "memorial",
  "men",
  "menu",
  "mobi",
  "moda",
  "moe",
  "money",
  "monster",
  "mortgage",
  "moscow",
  "movie",
  "museum",
  "music",
  "network",
  "new",
  "news",
  "ngo",
  "ninja",
  "now",
  "one",
  "ong",
  "onl",
  "online",
  "ooo",
  "page",
  "partners",
  "parts",
  "party",
  "pet",
  "photo",
  "photography",
  "photos",
  "pics",
  "pictures",
  "pink",
  "pizza",
  "place",
  "plus",
  "poker",
  "porn",
  "post",
  "press",
  "prof",
  "promo",
  "properties",
  "property",
  "pub",
  "quest",
  "racing",
  "radio",
  "recipes",
  "red",
  "rehab",
  "reise",
  "reisen",
  "rent",
  "rentals",
  "repair",
  "report",
  "rest",
  "restaurant",
  "review",
  "reviews",
  "rich",
  "rip",
  "rocks",
  "rodeo",
  "run",
  "sale",
  "salon",
  "school",
  "science",
  "services",
  "sex",
  "sexy",
  "shoes",
  "shop",
  "shopping",
  "show",
  "singles",
  "site",
  "ski",
  "soccer",
  "social",
  "software",
  "solar",
  "solutions",
  "space",
  "sport",
  "store",
  "stream",
  "studio",
  "study",
  "style",
  "sucks",
  "supply",
  "support",
  "surf",
  "systems",
  "tattoo",
  "tax",
  "team",
  "tech",
  "technology",
  "tel",
  "tennis",
  "theater",
  "tickets",
  "tips",
  "tires",
  "today",
  "tools",
  "top",
  "tours",
  "town",
  "toys",
  "trade",
  "trading",
  "training",
  "travel",
  "tube",
  "university",
  "uno",
  "vacations",
  "ventures",
  "vet",
  "video",
  "villas",
  "vin",
  "vip",
  "vision",
  "vodka",
  "vote",
  "voyage",
  "wang",
  "watch",
  "weather",
  "webcam",
  "website",
  "wedding",
  "wiki",
  "win",
  "wine",
  "work",
  "works",
  "world",
  "wtf",
  "xin",
  "xyz",
  "yoga",
  "zone",
]);

export const HOST_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export function is_plausible_website_host(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  const labels = host.split(".");

  if (labels.length < 2) return false;
  if (labels.some((label) => !HOST_LABEL_PATTERN.test(label))) return false;

  const tld = labels[labels.length - 1];

  if (tld.startsWith("xn--")) return tld.length > 4;
  if (!/^[a-z]+$/.test(tld)) return false;
  if (tld.length === 2) return true;

  return KNOWN_LONG_TLDS.has(tld);
}

export function validate_website_input(raw: string): string | null {
  const normalized = normalize_website_url(raw);

  if (!normalized) return null;

  try {
    if (!is_plausible_website_host(new URL(normalized).hostname)) return null;
  } catch {
    return null;
  }

  return normalized;
}

export function parse_websites_payload(payload: string): string[] {
  try {
    const parsed = JSON.parse(payload);

    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => normalize_website_url(entry))
      .filter((entry): entry is string => entry !== null)
      .slice(0, MAX_ALIAS_WEBSITES);
  } catch {
    return [];
  }
}

