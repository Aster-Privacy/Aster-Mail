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
import { api_client } from "@/services/api/client";

const PRODUCT_UPDATES_PATH = "/settings/v1/preferences/product-updates";

export async function get_product_updates_subscription(): Promise<boolean> {
  const response = await api_client.get<{ subscribed: boolean }>(
    PRODUCT_UPDATES_PATH,
  );

  return response.data?.subscribed ?? true;
}

export async function set_product_updates_subscription(
  subscribed: boolean,
): Promise<void> {
  const response = await api_client.put(PRODUCT_UPDATES_PATH, { subscribed });

  if (response.error) throw new Error(response.error);
}
