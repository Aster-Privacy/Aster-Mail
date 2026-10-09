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
import { is_onion_host } from "@/lib/onion_host";
import { curate_gallery_items } from "@/services/profile_picture_curation";
import { connection_store } from "@/services/routing/connection_store";

const GALLERY_BASE = "https://aster-wallpapers.pages.dev";
const MANIFEST_TIMEOUT_MS = 15000;
const MAX_ITEMS = 2000;
const SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]{0,80}$/;
const MAX_CREDIT_LENGTH = 200;
const CONTROL_CHARACTERS =
  /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

export const GALLERY_CATEGORIES = [
  "space",
  "night_sky",
  "water",
  "planets",
  "landscapes",
  "forest",
  "cities",
  "aurora",
  "mountains",
  "ocean",
  "desert",
] as const;

export type GalleryCategory = (typeof GALLERY_CATEGORIES)[number];

export interface GalleryItem {
  slug: string;
  category: GalleryCategory;
  credit: string | null;
}

let manifest_promise: Promise<GalleryItem[]> | null = null;

function is_gallery_category(value: unknown): value is GalleryCategory {
  return (
    typeof value === "string" &&
    (GALLERY_CATEGORIES as readonly string[]).includes(value)
  );
}

function parse_credit(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const credit = value
    .replace(CONTROL_CHARACTERS, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_CREDIT_LENGTH)
    .trim();

  return credit.length > 0 ? credit : null;
}

export function parse_gallery_manifest(payload: unknown): GalleryItem[] {
  if (!payload || typeof payload !== "object") return [];

  const raw = (payload as { items?: unknown }).items;

  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const items: GalleryItem[] = [];

  for (const entry of raw.slice(0, MAX_ITEMS)) {
    if (!entry || typeof entry !== "object") continue;

    const { slug, category, credit } = entry as {
      slug?: unknown;
      category?: unknown;
      credit?: unknown;
    };

    if (typeof slug !== "string" || !SLUG_PATTERN.test(slug)) continue;
    if (!is_gallery_category(category) || seen.has(slug)) continue;

    seen.add(slug);
    items.push({ slug, category, credit: parse_credit(credit) });
  }

  return items;
}

export function is_gallery_available(): boolean {
  return connection_store.get_method() === "direct" && !is_onion_host();
}

function assert_gallery_available(): void {
  if (!is_gallery_available()) {
    throw new Error("gallery unavailable on a routed connection");
  }
}

export function gallery_thumb_url(slug: string): string {
  return `${GALLERY_BASE}/thumb/${slug}.webp`;
}

export function gallery_full_url(slug: string): string {
  return `${GALLERY_BASE}/full/${slug}.webp`;
}

async function request_manifest(): Promise<GalleryItem[]> {
  assert_gallery_available();

  const controller = new AbortController();
  const timer = window.setTimeout(
    () => controller.abort(),
    MANIFEST_TIMEOUT_MS,
  );

  try {
    const response = await fetch(`${GALLERY_BASE}/manifest.json`, {
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });

    if (!response.ok) throw new Error("gallery manifest unavailable");

    const items = curate_gallery_items(
      parse_gallery_manifest(await response.json()),
    );

    if (items.length === 0) throw new Error("gallery manifest empty");

    return items;
  } finally {
    window.clearTimeout(timer);
  }
}

export function load_gallery_manifest(): Promise<GalleryItem[]> {
  if (!manifest_promise) {
    manifest_promise = request_manifest().catch((error) => {
      manifest_promise = null;
      throw error;
    });
  }

  return manifest_promise;
}

export async function fetch_gallery_image(slug: string): Promise<File> {
  if (!SLUG_PATTERN.test(slug)) throw new Error("gallery image not allowed");

  assert_gallery_available();

  const response = await fetch(gallery_full_url(slug), {
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });

  if (!response.ok) throw new Error("gallery image unavailable");

  const blob = await response.blob();

  return new File([blob], `${slug}.webp`, { type: "image/webp" });
}
