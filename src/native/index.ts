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
export {
  initialize_capacitor,
  is_native_platform,
  get_platform,
  update_status_bar_theme,
  add_app_state_listener,
  add_network_listener,
  get_network_status,
} from "./capacitor_bridge";

export {
  register_push_notifications,
  add_notification_received_listener,
  add_notification_action_listener,
  get_push_permission_status,
  request_push_permission,
  unregister_push_notifications,
} from "./push_notifications";

export {
  check_biometric_availability,
  authenticate_biometric,
  store_biometric_credentials,
  get_biometric_credentials,
  delete_biometric_credentials,
  get_biometry_type_name,
  type BiometricAvailability,
} from "./biometric_auth";

export {
  sync_haptic_state,
  haptic_impact,
  haptic_notification,
  haptic_selection,
  haptic_selection_changed,
  haptic_vibrate,
  haptic_swipe_threshold,
  haptic_send_success,
  haptic_error,
  haptic_long_press,
  haptic_selection_feedback,
} from "./haptic_feedback";

export {
  handle_deep_link,
  register_deep_link_route,
  create_deep_link,
  create_universal_link,
} from "./deep_link_handler";

export {
  initialize_share_receiver,
  add_share_listener,
  share_email,
  can_share,
  type SharedContent,
  type SharedFile,
} from "./share_receiver";

export {
  initialize_offline_queue,
  enqueue_action,
  get_queue,
  remove_from_queue,
  process_offline_queue,
  add_queue_status_listener,
  get_pending_count,
  clear_queue,
  retry_failed_actions,
  type QueuedAction,
} from "./offline_queue";

export { sync_widget_data, get_widget_data } from "./widget_bridge";

export { update_pwa_badge } from "./pwa_badge";

export { update_tray_badge } from "./tauri_tray";
