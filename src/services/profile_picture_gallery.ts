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
const GALLERY_BASE = "https://aster-wallpapers.pages.dev";
const MANIFEST_TIMEOUT_MS = 15000;
const MAX_ITEMS = 2000;
const SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]{0,80}$/;

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
}

let manifest_promise: Promise<GalleryItem[]> | null = null;

function is_gallery_category(value: unknown): value is GalleryCategory {
  return (
    typeof value === "string" &&
    (GALLERY_CATEGORIES as readonly string[]).includes(value)
  );
}

export function parse_gallery_manifest(payload: unknown): GalleryItem[] {
  if (!payload || typeof payload !== "object") return [];

  const raw = (payload as { items?: unknown }).items;

  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const items: GalleryItem[] = [];

  for (const entry of raw.slice(0, MAX_ITEMS)) {
    if (!entry || typeof entry !== "object") continue;

    const { slug, category } = entry as { slug?: unknown; category?: unknown };

    if (typeof slug !== "string" || !SLUG_PATTERN.test(slug)) continue;
    if (!is_gallery_category(category) || seen.has(slug)) continue;

    seen.add(slug);
    items.push({ slug, category });
  }

  return items;
}

export function gallery_thumb_url(slug: string): string {
  return `${GALLERY_BASE}/thumb/${slug}.webp`;
}

async function request_manifest(): Promise<GalleryItem[]> {
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

    const items = parse_gallery_manifest(await response.json());

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

  const response = await fetch(gallery_thumb_url(slug), {
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });

  if (!response.ok) throw new Error("gallery image unavailable");

  const blob = await response.blob();

  return new File([blob], `${slug}.webp`, { type: "image/webp" });
}
