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
import { EngineUnavailableError, type LanguageCode } from "./engine_types";

import {
  fetch_translation_asset,
  uses_native_translation_assets,
} from "@/native/desktop_translation_assets";
import { TRANSLATION_MODEL_CACHE } from "@/lib/app_update_caches";

export interface ModelFileEntry {
  name: string;
  size: number;
  expectedSha256Hash: string;
}

export type ModelRegistry = Record<string, Record<string, ModelFileEntry>>;

export const MODEL_REGISTRY_REVISION = "3";

export const MODEL_CACHE_NAME = TRANSLATION_MODEL_CACHE;

const DEFAULT_MODEL_BASE = "/bergamot/models/v1";

export function model_base(): string {
  const configured =
    typeof import.meta !== "undefined"
      ? (import.meta.env?.VITE_TRANSLATION_MODEL_URL as string | undefined)
      : undefined;

  const base = (configured ?? DEFAULT_MODEL_BASE).replace(/\/+$/, "");

  if (/^https?:\/\//i.test(base) && !/^https:\/\//i.test(base)) {
    return DEFAULT_MODEL_BASE;
  }

  return base;
}

export function join_url(base: string, name: string): string {
  const origin_ref =
    typeof location !== "undefined"
      ? location.href
      : "https://app.astermail.org/";
  const root = new URL(base, origin_ref);
  const root_dir = root.href.endsWith("/") ? root.href : `${root.href}/`;
  const resolved = new URL(name, root_dir);

  if (resolved.origin !== root.origin) {
    throw new EngineUnavailableError("translation model url origin mismatch");
  }

  return resolved.href;
}

export function registry_url(base: string = model_base()): string {
  return `${base}/registry.json?r=${MODEL_REGISTRY_REVISION}`;
}

export function asset_name(
  url: string,
  base: string = model_base(),
): string | null {
  const root = join_url(base, "");

  if (!url.startsWith(root)) return null;

  const name = url.slice(root.length).split(/[?#]/)[0];

  return name ? name : null;
}

async function read_registry_body(): Promise<unknown> {
  if (uses_native_translation_assets()) {
    const buffer = await fetch_translation_asset("registry.json");

    return JSON.parse(new TextDecoder().decode(buffer));
  }

  const response = await fetch(registry_url(), { credentials: "omit" });

  if (!response.ok) {
    throw new EngineUnavailableError(
      `translation registry returned ${response.status}`,
    );
  }

  return response.json();
}

export function pair_id(from: LanguageCode, to: LanguageCode): string {
  return `${from}${to}`;
}

export function pair_files(
  registry: ModelRegistry,
  pair: string,
): ModelFileEntry[] {
  const entry = registry[pair];

  if (!entry) return [];

  return Object.values(entry).filter(
    (file): file is ModelFileEntry =>
      !!file && typeof file.name === "string" && typeof file.size === "number",
  );
}

export function pair_bytes(registry: ModelRegistry, pair: string): number {
  return pair_files(registry, pair).reduce(
    (total, file) => total + file.size,
    0,
  );
}

let registry_cache: Promise<ModelRegistry> | null = null;

export async function load_registry(): Promise<ModelRegistry> {
  if (!registry_cache) {
    registry_cache = (async () => {
      const body: unknown = await read_registry_body();

      if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new EngineUnavailableError("translation registry is malformed");
      }

      return body as ModelRegistry;
    })().catch((error: unknown) => {
      registry_cache = null;

      throw error;
    });
  }

  return registry_cache;
}

export function reset_registry_cache(): void {
  registry_cache = null;
}
