import { api_client, type ApiResponse } from "./client";

export interface SyncState {
  device_id: string;
  device_name: string;
  last_sync_version: number;
  last_sync_at: string;
  is_primary: boolean;
}

export interface SyncChange {
  id: string;
  version: number;
  change_type: "create" | "update" | "delete";
  entity_type:
    | "mail"
    | "folder"
    | "custom_folder"
    | "label"
    | "rule"
    | "contact";
  entity_id: string;
  encrypted_data?: string;
  data_nonce?: string;
  created_at: string;
}

export interface RegisterDeviceRequest {
  device_name: string;
  device_type: "web" | "desktop" | "mobile";
  public_key: string;
}

export interface SyncChangesResponse {
  changes: SyncChange[];
  current_version: number;
  has_more: boolean;
}

export interface PushSyncChangeRequest {
  change_type: "create" | "update" | "delete";
  entity_type:
    | "mail"
    | "folder"
    | "custom_folder"
    | "label"
    | "rule"
    | "contact";
  entity_id: string;
  encrypted_data?: string;
  data_nonce?: string;
}

export async function register_device(
  data: RegisterDeviceRequest,
): Promise<ApiResponse<SyncState>> {
  return api_client.post<SyncState>("/sync/devices", data);
}

export async function get_sync_state(): Promise<ApiResponse<SyncState>> {
  return api_client.get<SyncState>("/sync/state");
}

export async function get_sync_changes(
  since_version: number,
): Promise<ApiResponse<SyncChangesResponse>> {
  return api_client.get<SyncChangesResponse>(
    `/sync/changes?since=${since_version}`,
  );
}

export async function push_sync_change(
  data: PushSyncChangeRequest,
): Promise<ApiResponse<SyncChange>> {
  return api_client.post<SyncChange>("/sync/changes", data);
}
