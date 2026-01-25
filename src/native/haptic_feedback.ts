import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

import { is_native_platform } from "./capacitor_bridge";

const HAPTIC_ENABLED_KEY = "aster_haptic_enabled";

export function is_haptic_enabled(): boolean {
  const stored = localStorage.getItem(HAPTIC_ENABLED_KEY);

  return stored === "true";
}

export function set_haptic_enabled(enabled: boolean): void {
  localStorage.setItem(HAPTIC_ENABLED_KEY, enabled ? "true" : "false");
}

export async function haptic_impact(
  style: "light" | "medium" | "heavy" = "medium",
): Promise<void> {
  if (!is_native_platform() || !is_haptic_enabled()) return;

  const impact_style: ImpactStyle =
    style === "light"
      ? ImpactStyle.Light
      : style === "heavy"
        ? ImpactStyle.Heavy
        : ImpactStyle.Medium;

  try {
    await Haptics.impact({ style: impact_style });
  } catch {
    // Haptics may not be available on all devices
  }
}

export async function haptic_notification(
  type: "success" | "warning" | "error" = "success",
): Promise<void> {
  if (!is_native_platform() || !is_haptic_enabled()) return;

  const notification_type: NotificationType =
    type === "warning"
      ? NotificationType.Warning
      : type === "error"
        ? NotificationType.Error
        : NotificationType.Success;

  try {
    await Haptics.notification({ type: notification_type });
  } catch {
    // Haptics may not be available on all devices
  }
}

export async function haptic_selection(): Promise<void> {
  if (!is_native_platform() || !is_haptic_enabled()) return;

  try {
    await Haptics.selectionStart();
    await Haptics.selectionEnd();
  } catch {
    // Haptics may not be available on all devices
  }
}

export async function haptic_selection_changed(): Promise<void> {
  if (!is_native_platform() || !is_haptic_enabled()) return;

  try {
    await Haptics.selectionChanged();
  } catch {
    // Haptics may not be available on all devices
  }
}

export async function haptic_vibrate(duration: number = 300): Promise<void> {
  if (!is_native_platform() || !is_haptic_enabled()) return;

  try {
    await Haptics.vibrate({ duration });
  } catch {
    // Haptics may not be available on all devices
  }
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
