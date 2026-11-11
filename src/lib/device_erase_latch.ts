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
export type DeviceEraseSignal = "begin" | "end";

const ERASE_CHANNEL_NAME = "aster_device_erase";
const ERASE_SIGNAL_KEY = "aster_device_erase_signal";

let traces_erased = false;
let erasing_here = false;
let channel: BroadcastChannel | null = null;

export function mark_device_traces_erased(): void {
  traces_erased = true;
}

export function device_traces_erased(): boolean {
  return traces_erased;
}

function is_signal(value: unknown): value is DeviceEraseSignal {
  return value === "begin" || value === "end";
}

function erase_channel(): BroadcastChannel | null {
  if (channel) return channel;
  if (typeof BroadcastChannel === "undefined") return null;

  try {
    channel = new BroadcastChannel(ERASE_CHANNEL_NAME);
  } catch {
    channel = null;
  }

  return channel;
}

function signal_through_storage(signal: DeviceEraseSignal): void {
  try {
    window.localStorage.setItem(ERASE_SIGNAL_KEY, signal);
  } catch {
    return;
  }

  try {
    window.localStorage.removeItem(ERASE_SIGNAL_KEY);
  } catch {
    return;
  }
}

export function announce_device_erase(signal: DeviceEraseSignal): void {
  erasing_here = true;
  traces_erased = true;

  try {
    erase_channel()?.postMessage(signal);
  } catch {
    channel = null;
  }

  signal_through_storage(signal);
}

export function watch_device_erase(
  on_signal: (signal: DeviceEraseSignal) => void,
): () => void {
  const receive = (value: unknown): void => {
    if (erasing_here || !is_signal(value)) return;
    traces_erased = true;
    on_signal(value);
  };
  const on_message = (event: MessageEvent): void => receive(event.data);
  const on_storage = (event: StorageEvent): void => {
    if (event.key === ERASE_SIGNAL_KEY) receive(event.newValue);
  };
  const listening = erase_channel();

  listening?.addEventListener("message", on_message);
  window.addEventListener("storage", on_storage);

  return () => {
    listening?.removeEventListener("message", on_message);
    window.removeEventListener("storage", on_storage);
  };
}
