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
import { api_client } from "./client";

export interface StorageCategory {
  name: string;
  bytes_used: number;
  item_count: number;
  percentage: number;
}

export interface FolderStorageUsage {
  folder_id: string;
  folder_name: string;
  bytes_used: number;
  email_count: number;
  attachment_count: number;
}

export interface StorageOverviewResponse {
  total_used_bytes: number;
  total_limit_bytes: number;
  percentage_used: number;
  categories: StorageCategory[];
  folders: FolderStorageUsage[];
  is_over_limit: boolean;
  addon_bytes: number;
  plan_limit_bytes: number;
  family_allocation_bytes: number | null;
}

export async function get_storage_overview() {
  return api_client.get<StorageOverviewResponse>("/sync/v1/storage/overview");
}
