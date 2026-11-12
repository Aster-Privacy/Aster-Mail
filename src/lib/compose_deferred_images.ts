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
import {
  COMPOSE_CSS_MARKER_FRAGMENT,
  COMPOSE_DEFERRED_BACKGROUND_ATTRIBUTE,
  COMPOSE_DEFERRED_SRC_ATTRIBUTE,
  COMPOSE_IMAGE_PLACEHOLDER,
  compose_css_placeholders,
  defer_compose_markup,
  hide_compose_css_images,
  show_compose_css_image,
} from "@/lib/compose_deferred_markup";
import {
  create_deferred_image_session,
  proxied_image_target,
  type DeferredImageSession,
} from "@/lib/deferred_proxy_images";
import { get_image_proxy_url } from "@/lib/image_proxy";
import { should_defer_proxied_images } from "@/lib/image_proxy_grant";
import { parse_srcset_candidates } from "@/lib/url_value";

const RETRY_AFTER_MS = 30_000;
const DEFERRED_IMAGE_SELECTOR = `img[${COMPOSE_DEFERRED_SRC_ATTRIBUTE}]`;
const DEFERRED_BACKGROUND_SELECTOR = `[${COMPOSE_DEFERRED_BACKGROUND_ATTRIBUTE}]`;
const MARKED_STYLE_SELECTOR = `[style*="${COMPOSE_CSS_MARKER_FRAGMENT}"]`;

interface PendingSlot {
  value: string;
  show: (url: string) => void;
}

interface Attachment {
  count: number;
  release: () => void;
}

export { restore_deferred_compose_images } from "@/lib/compose_deferred_markup";

export type ComposeImageSessionFactory = (
  proxy_url: string,
) => DeferredImageSession;

const attachments = new WeakMap<HTMLElement, Attachment>();
let create_session: ComposeImageSessionFactory = (proxy_url) =>
  create_deferred_image_session(proxy_url);

export function set_compose_image_session_factory(
  factory: ComposeImageSessionFactory | null,
): void {
  create_session =
    factory ?? ((proxy_url) => create_deferred_image_session(proxy_url));
}

export function defer_compose_images(html: string): string {
  if (!html || !should_defer_proxied_images()) return html;

  const proxy_url = get_image_proxy_url();
  let proxy_path: string;

  try {
    proxy_path = new URL(proxy_url, window.location.href).pathname;
  } catch {
    return html;
  }

  if (!html.includes(proxy_path)) return html;

  return defer_compose_markup(html, (name, value) =>
    name === "srcset"
      ? parse_srcset_candidates(value).some(
          (candidate) => proxied_image_target(candidate.url, proxy_url) !== null,
        )
      : proxied_image_target(value, proxy_url) !== null,
  );
}

function pending_slots(root: HTMLElement): PendingSlot[] {
  const slots: PendingSlot[] = [];

  root.querySelectorAll(DEFERRED_IMAGE_SELECTOR).forEach((image) => {
    const source = image.getAttribute("src");
    const value = image.getAttribute(COMPOSE_DEFERRED_SRC_ATTRIBUTE);

    if (!value) return;
    if (source !== null && source !== COMPOSE_IMAGE_PLACEHOLDER) return;

    slots.push({ value, show: (url) => image.setAttribute("src", url) });
  });

  root.querySelectorAll(DEFERRED_BACKGROUND_SELECTOR).forEach((element) => {
    const value = element.getAttribute(COMPOSE_DEFERRED_BACKGROUND_ATTRIBUTE);

    if (!value || element.hasAttribute("background")) return;

    slots.push({
      value,
      show: (url) => element.setAttribute("background", url),
    });
  });

  root.querySelectorAll(MARKED_STYLE_SELECTOR).forEach((element) => {
    for (const placeholder of compose_css_placeholders(
      element.getAttribute("style") ?? "",
      true,
    )) {
      slots.push({
        value: placeholder.value,
        show: (url) =>
          element.setAttribute(
            "style",
            show_compose_css_image(
              element.getAttribute("style") ?? "",
              placeholder.marker,
              url,
            ),
          ),
      });
    }
  });

  root.querySelectorAll("style").forEach((element) => {
    for (const placeholder of compose_css_placeholders(
      element.textContent ?? "",
      false,
    )) {
      slots.push({
        value: placeholder.value,
        show: (url) => {
          element.textContent = show_compose_css_image(
            element.textContent ?? "",
            placeholder.marker,
            url,
          );
        },
      });
    }
  });

  return slots;
}

function hide_shown_images(root: HTMLElement): void {
  root.querySelectorAll(`${DEFERRED_IMAGE_SELECTOR}[src]`).forEach((image) => {
    image.setAttribute("src", COMPOSE_IMAGE_PLACEHOLDER);
  });

  root
    .querySelectorAll(`${DEFERRED_BACKGROUND_SELECTOR}[background]`)
    .forEach((element) => element.removeAttribute("background"));

  root.querySelectorAll(MARKED_STYLE_SELECTOR).forEach((element) => {
    const css = element.getAttribute("style") ?? "";
    const hidden = hide_compose_css_images(css);

    if (hidden !== css) element.setAttribute("style", hidden);
  });

  root.querySelectorAll("style").forEach((element) => {
    const css = element.textContent ?? "";
    const hidden = hide_compose_css_images(css);

    if (hidden !== css) element.textContent = hidden;
  });
}

function start_hydration(root: HTMLElement): () => void {
  const loading = new Set<string>();
  const failed_at = new Map<string, number>();
  let session: DeferredImageSession | null = null;
  let stopped = false;

  const finish = (value: string, url: string | null) => {
    loading.delete(value);

    if (stopped) return;

    if (url === null) {
      failed_at.set(value, Date.now());

      return;
    }

    failed_at.delete(value);

    for (const slot of pending_slots(root)) {
      if (slot.value === value) slot.show(url);
    }
  };

  const request = (value: string) => {
    if (loading.has(value)) return;

    const failed = failed_at.get(value);

    if (failed !== undefined && Date.now() - failed < RETRY_AFTER_MS) return;

    session ??= create_session(get_image_proxy_url());
    loading.add(value);
    session.resolve(value).then(
      (url) => finish(value, url),
      () => finish(value, null),
    );
  };

  const scan = () => {
    if (stopped) return;

    for (const slot of pending_slots(root)) request(slot.value);
  };

  const observer = new MutationObserver(scan);

  observer.observe(root, { childList: true, subtree: true });
  scan();

  return () => {
    stopped = true;
    observer.disconnect();
    hide_shown_images(root);
    session?.dispose();
    session = null;
  };
}

export function attach_compose_image_hydration(root: HTMLElement): () => void {
  if (typeof MutationObserver === "undefined") return () => undefined;

  const attachment = attachments.get(root) ?? {
    count: 0,
    release: start_hydration(root),
  };

  attachments.set(root, attachment);
  attachment.count += 1;

  let released = false;

  return () => {
    if (released) return;

    released = true;
    attachment.count -= 1;

    if (attachment.count > 0) return;

    attachments.delete(root);
    attachment.release();
  };
}
