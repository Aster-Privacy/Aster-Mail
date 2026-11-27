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
import {
  DEFERRED_IMAGE_PLACEHOLDER,
  DEFERRED_SRC_ATTRIBUTE,
} from "@/lib/deferred_proxy_images";

export const VIEWER_MIN_RENDERED_SIZE = 48;
export const VIEWER_MIN_EDGE_SIZE = 16;

const VIEWER_DATA_IMAGE_PATTERN =
  /^data:image\/(?:png|apng|jpeg|jpg|gif|webp|avif|bmp|x-icon|vnd\.microsoft\.icon|tiff|heic|svg\+xml)[;,]/i;
const NAVIGATION_CONTAINER_SELECTOR = "button, [role='button'], [role='link']";

export interface ViewerImage {
  src: string;
  alt: string;
}

export interface ViewerImageHit extends ViewerImage {
  img: HTMLImageElement;
  link: HTMLAnchorElement | HTMLAreaElement | null;
}

function resolve_url(value: string, base: string): URL | null {
  try {
    return new URL(value, base);
  } catch {
    return null;
  }
}

function app_origin(): string {
  return typeof window === "undefined" ? "" : window.location.origin;
}

export function is_safe_viewer_src(src: string, proxy_url: string): boolean {
  const value = src.trim();

  if (!value || value !== src) return false;
  if (value === DEFERRED_IMAGE_PLACEHOLDER) return false;

  const lower = value.slice(0, 16).toLowerCase();

  if (lower.startsWith("data:")) return VIEWER_DATA_IMAGE_PATTERN.test(value);

  if (lower.startsWith("blob:")) {
    const origin = app_origin();
    const prefix = `blob:${origin}/`;

    if (!origin || origin === "null") return false;

    return value.startsWith(prefix) && value.length > prefix.length;
  }

  const base =
    typeof window === "undefined" ? "http://invalid" : window.location.href;
  const parsed = resolve_url(value, base);
  const proxy = resolve_url(proxy_url, base);

  if (!parsed || !proxy) return false;
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;

  return parsed.origin === proxy.origin && parsed.pathname === proxy.pathname;
}

function link_of(
  img: HTMLImageElement,
): HTMLAnchorElement | HTMLAreaElement | null {
  return img.closest("a, area") as HTMLAnchorElement | HTMLAreaElement | null;
}

function has_visible_text(link: Element): boolean {
  return (link.textContent ?? "").replace(/[\s ​-‍]/g, "").length > 0;
}

export function is_navigation_image(img: HTMLImageElement): boolean {
  if (img.closest(NAVIGATION_CONTAINER_SELECTOR)) return true;

  const link = link_of(img);

  if (!link) return false;

  const href = (link.getAttribute("href") ?? "").trim();

  if (href.startsWith("#") || href.toLowerCase().startsWith("aster:")) {
    return true;
  }

  return has_visible_text(link);
}

function rendered_size(img: HTMLImageElement): {
  width: number;
  height: number;
} {
  const rect = img.getBoundingClientRect();

  return {
    width: rect.width || img.width || 0,
    height: rect.height || img.height || 0,
  };
}

export function is_large_enough(img: HTMLImageElement): boolean {
  if (
    img.naturalWidth < VIEWER_MIN_EDGE_SIZE ||
    img.naturalHeight < VIEWER_MIN_EDGE_SIZE
  ) {
    return false;
  }

  const { width, height } = rendered_size(img);

  return (
    Math.max(width, height) >= VIEWER_MIN_RENDERED_SIZE &&
    Math.min(width, height) >= VIEWER_MIN_EDGE_SIZE
  );
}

function is_pending_or_blocked(img: HTMLImageElement): boolean {
  return (
    img.getAttribute("data-blocked") === "true" ||
    img.classList.contains("blocked-remote-image") ||
    img.hasAttribute(DEFERRED_SRC_ATTRIBUTE) ||
    img.getAttribute("data-load-failed") === "true" ||
    !img.complete ||
    img.naturalWidth === 0
  );
}

export function viewer_image_from(
  img: HTMLImageElement,
  proxy_url: string,
): ViewerImageHit | null {
  if (is_pending_or_blocked(img)) return null;
  if (!is_large_enough(img)) return null;
  if (is_navigation_image(img)) return null;

  const src = img.currentSrc || img.src;

  if (!is_safe_viewer_src(src, proxy_url)) return null;

  return {
    img,
    src,
    alt: (img.getAttribute("alt") ?? "").trim(),
    link: link_of(img),
  };
}

function image_target(target: EventTarget | null): HTMLImageElement | null {
  if (!target || typeof (target as Element).closest !== "function") {
    return null;
  }

  const element = target as Element;

  if (element.tagName === "IMG") return element as HTMLImageElement;

  if (element.tagName !== "A" && element.tagName !== "AREA") return null;
  if (has_visible_text(element)) return null;

  const images = element.querySelectorAll("img");

  return images.length === 1 ? images[0] : null;
}

export function find_viewer_image(
  target: EventTarget | null,
  proxy_url: string,
): ViewerImageHit | null {
  const img = image_target(target);

  return img ? viewer_image_from(img, proxy_url) : null;
}

export function collect_viewer_images(
  root: ParentNode,
  proxy_url: string,
): ViewerImageHit[] {
  const seen = new Set<string>();
  const hits: ViewerImageHit[] = [];

  root.querySelectorAll("img").forEach((img) => {
    const hit = viewer_image_from(img, proxy_url);

    if (!hit || seen.has(hit.src)) return;
    seen.add(hit.src);
    hits.push(hit);
  });

  return hits;
}

export function viewer_gallery_for(
  hit: ViewerImageHit,
  root: ParentNode,
  proxy_url: string,
): { images: ViewerImageHit[]; index: number } {
  const images = collect_viewer_images(root, proxy_url);
  const index = images.findIndex((image) => image.src === hit.src);

  if (index === -1) return { images: [hit], index: 0 };

  images[index] = hit;

  return { images, index };
}

export interface ImageViewerItem extends ViewerImage {
  open_link?: () => void;
}

export interface ImageViewerRequest {
  items: ImageViewerItem[];
  index: number;
}
