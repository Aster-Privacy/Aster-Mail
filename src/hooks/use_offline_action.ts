import { useCallback, useEffect, useState } from "react";

import { get_network_status, add_network_listener } from "@/native/capacitor_bridge";
import {
  enqueue_action,
  type OfflineActionType,
} from "@/native/offline_queue";
import { show_toast } from "@/components/toast/simple_toast";

interface UseOfflineActionOptions {
  show_offline_toast?: boolean;
}

interface UseOfflineActionReturn {
  is_offline: boolean;
  execute_with_offline_support: <T>(
    action_type: OfflineActionType,
    payload: unknown,
    online_action: () => Promise<T>,
    options?: {
      offline_message?: string;
      optimistic_update?: () => void;
      on_queued?: (action_id: string) => void;
    },
  ) => Promise<{ queued: boolean; result?: T; error?: Error }>;
  check_network_status: () => Promise<boolean>;
}

export function use_offline_action(
  options: UseOfflineActionOptions = {},
): UseOfflineActionReturn {
  const { show_offline_toast = true } = options;
  const [is_offline, set_is_offline] = useState(false);

  useEffect(() => {
    const check_initial_status = async () => {
      const status = await get_network_status();

      set_is_offline(!status.connected);
    };

    check_initial_status();

    const unsubscribe = add_network_listener((status) => {
      set_is_offline(!status.connected);
    });

    const handle_online = () => set_is_offline(false);
    const handle_offline = () => set_is_offline(true);

    window.addEventListener("online", handle_online);
    window.addEventListener("offline", handle_offline);

    return () => {
      unsubscribe();
      window.removeEventListener("online", handle_online);
      window.removeEventListener("offline", handle_offline);
    };
  }, []);

  const check_network_status = useCallback(async (): Promise<boolean> => {
    const status = await get_network_status();

    set_is_offline(!status.connected);

    return status.connected;
  }, []);

  const execute_with_offline_support = useCallback(
    async <T>(
      action_type: OfflineActionType,
      payload: unknown,
      online_action: () => Promise<T>,
      action_options?: {
        offline_message?: string;
        optimistic_update?: () => void;
        on_queued?: (action_id: string) => void;
      },
    ): Promise<{ queued: boolean; result?: T; error?: Error }> => {
      const {
        offline_message = "You're offline. Action queued for when you reconnect.",
        optimistic_update,
        on_queued,
      } = action_options || {};

      const status = await get_network_status();

      if (!status.connected) {
        optimistic_update?.();

        try {
          const action_id = await enqueue_action(action_type, payload);

          on_queued?.(action_id);

          if (show_offline_toast) {
            show_toast(offline_message, "info");
          }

          return { queued: true };
        } catch (error) {
          return {
            queued: false,
            error: error instanceof Error ? error : new Error("Failed to queue action"),
          };
        }
      }

      try {
        const result = await online_action();

        return { queued: false, result };
      } catch (error) {
        return {
          queued: false,
          error: error instanceof Error ? error : new Error("Action failed"),
        };
      }
    },
    [show_offline_toast],
  );

  return {
    is_offline,
    execute_with_offline_support,
    check_network_status,
  };
}

export async function is_currently_offline(): Promise<boolean> {
  const status = await get_network_status();

  return !status.connected;
}

export async function enqueue_if_offline(
  action_type: OfflineActionType,
  payload: unknown,
): Promise<{ is_offline: boolean; action_id?: string }> {
  const status = await get_network_status();

  if (!status.connected) {
    const action_id = await enqueue_action(action_type, payload);

    return { is_offline: true, action_id };
  }

  return { is_offline: false };
}
