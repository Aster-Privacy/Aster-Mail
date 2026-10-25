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
import type {} from "@/types/thread";
import type {} from "@/services/api/mail";
import type {} from "@/services/api/multi_drafts";
import type {} from "@/lib/html_sanitizer";
import type { SanitizeOptions } from "@/lib/html_sanitizer";
import type {} from "@/components/email/use_email_viewer";
import type {} from "@/components/email/hooks/preload_cache";

import { useEffect } from "react";

import { resolve_sanitize_blocking } from "@/lib/html_sanitizer";

export let loaded_content_email_id: string | null = null;

export function get_external_content_mode(
  email_id: string,
): "loaded" | undefined {
  return loaded_content_email_id === email_id ? "loaded" : undefined;
}

export function set_external_content_mode(email_id: string): void {
  loaded_content_email_id = email_id;
}

export interface DisplayedImageBlocking {
  block_remote_images: boolean;
  block_tracking_pixels: boolean;
}

export interface DisplayedContentSettings {
  lockdown_active: boolean;
  block_external_content: boolean;
  block_remote_images: boolean;
  block_tracking_pixels: boolean;
  load_remote_images: string;
}

const MAX_DISPLAYED_IMAGE_BLOCKING = 50;

const displayed_image_blocking = new Map<
  string,
  { settings_key: string; blocking: DisplayedImageBlocking }
>();

function displayed_settings_key(settings: DisplayedContentSettings): string {
  return [
    settings.lockdown_active,
    settings.block_external_content,
    settings.block_remote_images,
    settings.block_tracking_pixels,
    settings.load_remote_images,
  ].join("|");
}

function store_displayed_image_blocking(
  email_id: string,
  settings_key: string,
  blocking: DisplayedImageBlocking,
): void {
  displayed_image_blocking.delete(email_id);
  displayed_image_blocking.set(email_id, {
    settings_key,
    blocking: {
      block_remote_images: blocking.block_remote_images,
      block_tracking_pixels: blocking.block_tracking_pixels,
    },
  });

  if (displayed_image_blocking.size > MAX_DISPLAYED_IMAGE_BLOCKING) {
    const oldest = displayed_image_blocking.keys().next().value;

    if (oldest !== undefined) displayed_image_blocking.delete(oldest);
  }
}

export function record_displayed_image_blocking(
  email_id: string,
  settings: DisplayedContentSettings,
  blocking: DisplayedImageBlocking,
): void {
  store_displayed_image_blocking(
    email_id,
    displayed_settings_key(settings),
    blocking,
  );
}

export function clear_displayed_image_blocking(email_id: string): void {
  displayed_image_blocking.delete(email_id);
}

export function get_displayed_image_blocking(
  email_id: string,
  settings: DisplayedContentSettings,
): DisplayedImageBlocking | undefined {
  const entry = displayed_image_blocking.get(email_id);

  if (!entry || entry.settings_key !== displayed_settings_key(settings)) {
    return undefined;
  }

  return { ...entry.blocking };
}

export function displayed_image_blocking_from_options(
  options: Pick<
    SanitizeOptions,
    "external_content_mode" | "content_blocking" | "lockdown_mode"
  >,
): DisplayedImageBlocking {
  const blocking = resolve_sanitize_blocking(options);

  return {
    block_remote_images: blocking.block_images,
    block_tracking_pixels: blocking.block_pixels || blocking.block_images,
  };
}

export function use_record_displayed_image_blocking(
  email_id: string,
  settings: DisplayedContentSettings,
  blocking: DisplayedImageBlocking | null,
): void {
  const settings_key = displayed_settings_key(settings);
  const block_remote_images = blocking?.block_remote_images;
  const block_tracking_pixels = blocking?.block_tracking_pixels;

  useEffect(() => {
    if (
      block_remote_images === undefined ||
      block_tracking_pixels === undefined
    ) {
      return;
    }

    store_displayed_image_blocking(email_id, settings_key, {
      block_remote_images,
      block_tracking_pixels,
    });

    return () => clear_displayed_image_blocking(email_id);
  }, [email_id, settings_key, block_remote_images, block_tracking_pixels]);
}
