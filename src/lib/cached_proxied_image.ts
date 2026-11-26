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
import type { ProxiedImageResult } from "@/lib/image_proxy_grant";

import { fetch_proxied_image } from "@/lib/image_proxy_grant";
import {
  configure_image_cache,
  create_cached_image_loader,
  type ImageCacheEnvironment,
} from "@/lib/remote_image_cache";

const browser_environment: ImageCacheEnvironment = {
  async get_account_id() {
    const { get_current_account_id } = await import(
      "@/services/account_manager"
    );

    return get_current_account_id().catch(() => null);
  },
  async seal(plain) {
    const { device_encrypt } = await import("@/services/crypto/secure_storage");

    return device_encrypt(plain);
  },
  async unseal(sealed) {
    const { device_decrypt } = await import("@/services/crypto/secure_storage");

    return device_decrypt(sealed);
  },
  async may_persist(account_id) {
    const { get_app_lock_config, is_server_wrapped_config } = await import(
      "@/services/app_lock_store"
    );

    return !is_server_wrapped_config(get_app_lock_config(account_id));
  },
  now: () => Date.now(),
};

let configured = false;

function ensure_configured(): void {
  if (configured) return;
  configured = true;
  configure_image_cache(browser_environment);
}

const cached_loader = create_cached_image_loader((url, options) =>
  fetch_proxied_image(url, options),
);

export function load_proxied_image_cached(
  url: string,
  options: { signal?: AbortSignal },
): Promise<ProxiedImageResult> {
  ensure_configured();

  return cached_loader(url, options);
}
