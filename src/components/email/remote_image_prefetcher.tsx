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
import { useEffect, useRef, useSyncExternalStore } from "react";

import { use_auth } from "@/contexts/auth_context";
import { use_preferences } from "@/contexts/preferences_context";
import { use_lockdown_active } from "@/hooks/use_lockdown_active";
import { MAIL_EVENTS } from "@/hooks/mail_events";
import { effective_remote_image_mode } from "@/lib/remote_content_policy";
import { get_image_proxy_url } from "@/lib/image_proxy";
import { should_defer_proxied_images } from "@/lib/image_proxy_grant";
import { connection_store } from "@/services/routing/connection_store";
import { load_proxied_image_cached } from "@/lib/cached_proxied_image";
import {
  is_image_cache_enabled,
  is_image_prefetch_enabled,
  subscribe_image_cache_settings,
} from "@/lib/remote_image_cache";
import {
  create_image_prefetcher,
  may_prefetch_images,
} from "@/lib/remote_image_prefetch";
import {
  peek_preloaded_email,
  preload_email_detail,
} from "@/components/email/hooks/preload_cache";

function subscribe_connection(listener: () => void): () => void {
  const unsubscribe = connection_store.subscribe(() => listener());

  return () => {
    unsubscribe();
  };
}

function read_settings(): string {
  return `${is_image_cache_enabled() ? 1 : 0}${is_image_prefetch_enabled() ? 1 : 0}`;
}

export function RemoteImagePrefetcher(): null {
  const { is_authenticated, user, current_account_id } = use_auth();
  const { preferences } = use_preferences();
  const lockdown_active = use_lockdown_active();
  const settings = useSyncExternalStore(
    subscribe_image_cache_settings,
    read_settings,
    () => "00",
  );
  const can_defer = useSyncExternalStore(
    subscribe_connection,
    should_defer_proxied_images,
    () => false,
  );
  const allowed =
    is_authenticated &&
    may_prefetch_images({
      cache_enabled: settings[0] === "1",
      prefetch_enabled: settings[1] === "1",
      image_mode: effective_remote_image_mode(preferences),
      lockdown_active,
      can_defer,
      html_blocked:
        preferences.html_rendering_mode === "plain_text" ||
        Boolean(preferences.low_network_mode),
    });
  const allowed_ref = useRef(allowed);

  allowed_ref.current = allowed;

  const user_email = user?.email;
  const grouping = preferences.conversation_grouping !== false;

  useEffect(() => {
    if (!allowed) return;

    const prefetcher = create_image_prefetcher({
      allowed: () => allowed_ref.current,
      proxy_url: get_image_proxy_url,
      load_image: load_proxied_image_cached,
      async load_html(email_id) {
        await preload_email_detail(email_id, user_email, false, grouping);

        const preloaded = peek_preloaded_email(email_id, user_email);

        if (!preloaded) return null;
        if (
          preloaded.mail_item.item_type !== "received" ||
          preloaded.mail_item.is_spam ||
          preloaded.mail_item.is_trashed
        ) {
          return null;
        }

        return preloaded.email.html_content ?? null;
      },
    });

    const handler = (event: Event) => {
      const email_id = (event as CustomEvent).detail?.email_id;

      if (typeof email_id === "string") prefetcher.enqueue(email_id);
    };

    window.addEventListener(MAIL_EVENTS.EMAIL_RECEIVED, handler);

    return () => {
      window.removeEventListener(MAIL_EVENTS.EMAIL_RECEIVED, handler);
      prefetcher.dispose();
    };
  }, [allowed, user_email, grouping, current_account_id]);

  return null;
}
