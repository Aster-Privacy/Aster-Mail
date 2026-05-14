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
import { App, type URLOpenListenerEvent } from "@capacitor/app";
import { Share, type ShareResult } from "@capacitor/share";

import { is_native_platform } from "./capacitor_bridge";

export interface SharedContent {
  title?: string;
  text?: string;
  url?: string;
  files?: SharedFile[];
}

export interface SharedFile {
  path: string;
  name: string;
  type: string;
}

type ShareReceivedCallback = (content: SharedContent) => void;
const share_listeners: ShareReceivedCallback[] = [];

export async function initialize_share_receiver(): Promise<void> {
  if (!is_native_platform()) return;

  App.addListener("appUrlOpen", (event: URLOpenListenerEvent) => {
    const content = parse_share_url(event.url);

    if (content) {
      notify_share_listeners(content);
    }
  });

  check_launch_share();
}

function parse_share_url(url: string): SharedContent | null {
  try {
    if (url.startsWith("astermail://share")) {
      const params = new URL(url.replace("astermail://", "https://dummy/"))
        .searchParams;

      return {
        title: params.get("title") || undefined,
        text: params.get("text") || undefined,
        url: params.get("url") || undefined,
      };
    }

    if (url.startsWith("mailto:")) {
      return parse_mailto_url(url);
    }

    return null;
  } catch {
    return null;
  }
}

function parse_mailto_url(url: string): SharedContent {
  const mailto_regex = /^mailto:([^?]*)\??(.*)$/;
  const match = url.match(mailto_regex);

  const content: SharedContent = {};

  if (match) {
    const email = decodeURIComponent(match[1]);
    const params = new URLSearchParams(match[2]);

    if (email) {
      content.text = `To: ${email}`;
    }

    const subject = params.get("subject");

    if (subject) {
      content.title = decodeURIComponent(subject);
    }

    const body = params.get("body");

    if (body) {
      content.text =
        (content.text ? content.text + "\n\n" : "") + decodeURIComponent(body);
    }
  }

  return content;
}

async function check_launch_share(): Promise<void> {
  try {
    const launch_url = await App.getLaunchUrl();

    if (launch_url?.url) {
      const content = parse_share_url(launch_url.url);

      if (content) {
        setTimeout(() => notify_share_listeners(content), 500);
      }
    }
  } catch {}
}

const SHARE_SUBJECT_MAX = 998;
const SHARE_BODY_MAX = 65536;

function clamp_share_text(input: string, max: number): string {
  return input.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "").slice(0, max);
}

function notify_share_listeners(content: SharedContent): void {
  share_listeners.forEach((callback) => callback(content));

  const compose_url = new URL("/", window.location.origin);

  compose_url.searchParams.set("compose", "true");

  if (content.title) {
    compose_url.searchParams.set(
      "subject",
      clamp_share_text(content.title, SHARE_SUBJECT_MAX),
    );
  }

  let body = "";

  if (content.text) {
    body += content.text;
  }
  if (content.url) {
    body += (body ? "\n\n" : "") + content.url;
  }
  if (body) {
    compose_url.searchParams.set(
      "body",
      clamp_share_text(body, SHARE_BODY_MAX),
    );
  }

  if (compose_url.origin !== window.location.origin) {
    return;
  }
  window.location.href = compose_url.toString();
}

export function add_share_listener(
  callback: ShareReceivedCallback,
): () => void {
  share_listeners.push(callback);

  return () => {
    const index = share_listeners.indexOf(callback);

    if (index > -1) {
      share_listeners.splice(index, 1);
    }
  };
}

export async function share_email(options: {
  subject?: string;
  body?: string;
  url?: string;
}): Promise<ShareResult | null> {
  if (!is_native_platform()) {
    if (navigator.share) {
      try {
        await navigator.share({
          title: options.subject,
          text: options.body,
          url: options.url,
        });

        return { activityType: "native" };
      } catch {
        return null;
      }
    }

    return null;
  }

  try {
    return await Share.share({
      title: options.subject,
      text: options.body,
      url: options.url,
      dialogTitle: "Share via",
    });
  } catch {
    return null;
  }
}

export async function can_share(): Promise<boolean> {
  if (!is_native_platform()) {
    return !!navigator.share;
  }

  return true;
}
