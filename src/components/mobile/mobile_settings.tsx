import { useState, useEffect, useCallback } from "react";

import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { use_platform } from "@/hooks/use_platform";
import {
  check_biometric_availability,
  get_biometry_type_name,
  is_biometric_app_lock_enabled,
  set_biometric_app_lock_enabled,
  is_biometric_send_enabled,
  set_biometric_send_enabled,
  type BiometricAvailability,
} from "@/native/biometric_auth";
import {
  is_haptic_enabled,
  set_haptic_enabled,
} from "@/native/haptic_feedback";
import {
  get_push_permission_status,
  request_push_permission,
} from "@/native/push_notifications";
import { get_pending_count, clear_queue } from "@/native/offline_queue";

interface MobileSettingsSectionProps {
  className?: string;
}

export function MobileSettingsSection({
  className,
}: MobileSettingsSectionProps) {
  const { is_native } = use_platform();
  const [biometric_availability, set_biometric_availability] =
    useState<BiometricAvailability | null>(null);
  const [app_lock_enabled, set_app_lock_state] = useState(false);
  const [send_biometric_enabled, set_send_biometric_state] = useState(false);
  const [haptic_state, set_haptic_state] = useState(false);
  const [push_status, set_push_status] = useState<
    "granted" | "denied" | "prompt"
  >("prompt");
  const [pending_actions, set_pending_actions] = useState(0);

  useEffect(() => {
    if (!is_native) return;

    const load_settings = async () => {
      const biometric = await check_biometric_availability();

      set_biometric_availability(biometric);

      set_app_lock_state(is_biometric_app_lock_enabled());
      set_send_biometric_state(is_biometric_send_enabled());
      set_haptic_state(is_haptic_enabled());

      const push = await get_push_permission_status();

      set_push_status(push);

      const pending = await get_pending_count();

      set_pending_actions(pending);
    };

    load_settings();
  }, [is_native]);

  const handle_app_lock_change = useCallback((enabled: boolean) => {
    set_biometric_app_lock_enabled(enabled);
    set_app_lock_state(enabled);
  }, []);

  const handle_send_biometric_change = useCallback((enabled: boolean) => {
    set_biometric_send_enabled(enabled);
    set_send_biometric_state(enabled);
  }, []);

  const handle_haptic_change = useCallback((enabled: boolean) => {
    set_haptic_enabled(enabled);
    set_haptic_state(enabled);
  }, []);

  const handle_enable_push = useCallback(async () => {
    const granted = await request_push_permission();

    if (granted) {
      set_push_status("granted");
    }
  }, []);

  const handle_clear_offline_queue = useCallback(async () => {
    await clear_queue();
    set_pending_actions(0);
  }, []);

  if (!is_native) {
    return null;
  }

  const biometry_name = biometric_availability?.is_available
    ? get_biometry_type_name(biometric_availability.biometry_type)
    : "Biometric";

  return (
    <div className={cn("space-y-6", className)}>
      <div>
        <h3 className="text-lg font-medium">Mobile Settings</h3>
        <p className="text-sm text-muted-foreground">
          Configure mobile-specific features
        </p>
      </div>

      {biometric_availability?.is_available && (
        <div className="space-y-4">
          <h4 className="text-sm font-medium">Security</h4>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">App Lock</p>
              <p className="text-xs text-muted-foreground">
                Require {biometry_name} to open the app
              </p>
            </div>
            <Switch
              checked={app_lock_enabled}
              onCheckedChange={handle_app_lock_change}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Secure Send</p>
              <p className="text-xs text-muted-foreground">
                Require {biometry_name} before sending emails
              </p>
            </div>
            <Switch
              checked={send_biometric_enabled}
              onCheckedChange={handle_send_biometric_change}
            />
          </div>
        </div>
      )}

      <div className="space-y-4">
        <h4 className="text-sm font-medium">Notifications</h4>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Push Notifications</p>
            <p className="text-xs text-muted-foreground">
              {push_status === "granted"
                ? "Enabled"
                : push_status === "denied"
                  ? "Blocked in device settings"
                  : "Not enabled"}
            </p>
          </div>
          {push_status === "prompt" && (
            <button
              className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground"
              onClick={handle_enable_push}
            >
              Enable
            </button>
          )}
          {push_status === "granted" && (
            <span className="text-sm text-green-600">Enabled</span>
          )}
          {push_status === "denied" && (
            <span className="text-sm text-red-600">Blocked</span>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="text-sm font-medium">Feedback</h4>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Haptic Feedback</p>
            <p className="text-xs text-muted-foreground">
              Vibration on swipe actions and interactions
            </p>
          </div>
          <Switch
            checked={haptic_state}
            onCheckedChange={handle_haptic_change}
          />
        </div>
      </div>

      {pending_actions > 0 && (
        <div className="space-y-4">
          <h4 className="text-sm font-medium">Offline Queue</h4>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Pending Actions</p>
              <p className="text-xs text-muted-foreground">
                {pending_actions} action{pending_actions !== 1 ? "s" : ""}{" "}
                waiting to sync
              </p>
            </div>
            <button
              className="rounded-lg border border-destructive px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10"
              onClick={handle_clear_offline_queue}
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
