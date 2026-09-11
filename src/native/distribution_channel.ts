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
import { useEffect, useState } from "react";

export type DistributionChannel =
  | "web"
  | "direct"
  | "mas"
  | "msstore"
  | "flatpak"
  | "snap";

const NATIVE_CHANNELS: ReadonlySet<string> = new Set([
  "direct",
  "mas",
  "msstore",
  "flatpak",
  "snap",
]);

let cached_channel: DistributionChannel | null = null;
let pending_channel: Promise<DistributionChannel> | null = null;

function is_tauri_runtime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function resolve_channel(): Promise<DistributionChannel> {
  if (!is_tauri_runtime()) return "web";
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const value = await invoke<string>("get_distribution_channel");

    return NATIVE_CHANNELS.has(value) ? (value as DistributionChannel) : "direct";
  } catch {
    return "direct";
  }
}

export function get_distribution_channel(): Promise<DistributionChannel> {
  if (cached_channel) return Promise.resolve(cached_channel);
  if (!pending_channel) {
    pending_channel = resolve_channel().then((channel) => {
      cached_channel = channel;

      return channel;
    });
  }

  return pending_channel;
}

export function get_cached_distribution_channel(): DistributionChannel | null {
  if (!cached_channel && !is_tauri_runtime()) cached_channel = "web";

  return cached_channel;
}

export async function is_mas_channel(): Promise<boolean> {
  return (await get_distribution_channel()) === "mas";
}

export async function is_direct_channel(): Promise<boolean> {
  return (await get_distribution_channel()) === "direct";
}

export function use_distribution_channel(): DistributionChannel | null {
  const [channel, set_channel] = useState<DistributionChannel | null>(() =>
    get_cached_distribution_channel(),
  );

  useEffect(() => {
    if (channel) return;
    let active = true;

    void get_distribution_channel().then((value) => {
      if (active) set_channel(value);
    });

    return () => {
      active = false;
    };
  }, [channel]);

  return channel;
}

export function reset_distribution_channel_for_tests(): void {
  cached_channel = null;
  pending_channel = null;
}
