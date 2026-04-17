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
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

import { is_native_platform } from "./capacitor_bridge";

let _haptic_enabled = true;

export function sync_haptic_state(enabled: boolean): void {
  _haptic_enabled = enabled;
}

export async function haptic_impact(
  style: "light" | "medium" | "heavy" = "medium",
): Promise<void> {
  if (!is_native_platform() || !_haptic_enabled) return;

  const impact_style: ImpactStyle =
    style === "light"
      ? ImpactStyle.Light
      : style === "heavy"
        ? ImpactStyle.Heavy
        : ImpactStyle.Medium;

  try {
    await Haptics.impact({ style: impact_style });
  } catch {}
}

export async function haptic_notification(
  type: "success" | "warning" | "error" = "success",
): Promise<void> {
  if (!is_native_platform() || !_haptic_enabled) return;

  const notification_type: NotificationType =
    type === "warning"
      ? NotificationType.Warning
      : type === "error"
        ? NotificationType.Error
        : NotificationType.Success;

  try {
    await Haptics.notification({ type: notification_type });
  } catch {}
}

export async function haptic_selection(): Promise<void> {
  if (!is_native_platform() || !_haptic_enabled) return;

  try {
    await Haptics.selectionStart();
    await Haptics.selectionEnd();
  } catch {}
}

export async function haptic_selection_changed(): Promise<void> {
  if (!is_native_platform() || !_haptic_enabled) return;

  try {
    await Haptics.selectionChanged();
  } catch {}
}

export async function haptic_vibrate(duration: number = 300): Promise<void> {
  if (!is_native_platform() || !_haptic_enabled) return;

  try {
    await Haptics.vibrate({ duration });
  } catch {}
}

export async function haptic_swipe_threshold(): Promise<void> {
  await haptic_impact("medium");
}

export async function haptic_send_success(): Promise<void> {
  await haptic_notification("success");
}

export async function haptic_error(): Promise<void> {
  await haptic_notification("error");
}

export async function haptic_long_press(): Promise<void> {
  await haptic_impact("heavy");
}

export async function haptic_selection_feedback(): Promise<void> {
  await haptic_impact("light");
}
