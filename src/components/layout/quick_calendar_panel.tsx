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
import { useCallback, useEffect, useRef, useState } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { Button, Skeleton, Tooltip } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { use_escape_layer } from "@/lib/overlay_layer_stack";
import { use_panel_inset } from "@/hooks/use_panel_inset";
import { use_panel_transition } from "@/components/layout/use_panel_transition";
import {
  use_host_appearance,
  type HostAppearance,
} from "@/components/layout/use_host_appearance";
import { is_tauri } from "@/native/desktop_device_auth";
import { open_external } from "@/utils/open_link";
import {
  CALENDAR_WEB_ORIGIN,
  MAIL_WEB_ORIGIN,
} from "@/lib/session_handoff/session_handoff_protocol";
import {
  HANDOFF_GRANT_HASH_PREFIX,
  mint_panel_handoff_grant,
  sibling_app_launch_url,
} from "@/contexts/auth/sibling_session_handoff";

export const CALENDAR_PANEL_PATH = "/mail-panel";
export const CALENDAR_PANEL_SOURCE = "aster-calendar-panel";
export const MAIL_HOST_SOURCE = "aster-mail";

export const FIRST_READY_TIMEOUT_MS = 10_000;
export const LOAD_READY_TIMEOUT_MS = 5_000;
const PANEL_MESSAGE_TYPES = new Set(["ready", "close", "status"]);
const FRAME_SANDBOX =
  "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms";

export type CalendarPanelMessageType = "ready" | "close" | "status";

type FrameState = "loading" | "ready" | "failed" | "setup";

interface PanelOriginContext {
  is_desktop: boolean;
  is_dev: boolean;
  dev_origin: string | undefined;
  location_origin: string;
}

export function resolve_calendar_panel_origin(
  context: PanelOriginContext,
): string | null {
  if (context.is_desktop) return null;

  if (context.is_dev) {
    const candidate = context.dev_origin?.trim();

    if (!candidate) return null;

    try {
      const parsed = new URL(candidate);

      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return null;
      }

      return parsed.origin;
    } catch {
      return null;
    }
  }

  return context.location_origin === MAIL_WEB_ORIGIN
    ? CALENDAR_WEB_ORIGIN
    : null;
}

export function get_calendar_panel_origin(): string | null {
  if (typeof window === "undefined") return null;

  return resolve_calendar_panel_origin({
    is_desktop: is_tauri(),
    is_dev: import.meta.env.DEV,
    dev_origin: import.meta.env.VITE_CALENDAR_PANEL_ORIGIN as
      string | undefined,
    location_origin: window.location.origin,
  });
}

interface PanelMessageEvent {
  origin: string;
  source: unknown;
  data: unknown;
}

export function read_panel_message(
  event: PanelMessageEvent,
  frame_window: Window | null | undefined,
  origin: string,
): CalendarPanelMessageType | null {
  if (!frame_window || event.source !== frame_window) return null;
  if (event.origin !== origin) return null;

  const data = event.data;

  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return null;
  }

  const record = data as Record<string, unknown>;

  if (record.source !== CALENDAR_PANEL_SOURCE) return null;
  if (typeof record.type !== "string") return null;
  if (!PANEL_MESSAGE_TYPES.has(record.type)) return null;

  return record.type as CalendarPanelMessageType;
}

export function is_signed_out_status(data: unknown): boolean {
  if (typeof data !== "object" || data === null) return false;

  const record = data as Record<string, unknown>;

  return record.type === "status" && record.status === "signed_out";
}

export function open_calendar_externally(): void {
  open_external(sibling_app_launch_url(CALENDAR_WEB_ORIGIN));
}

interface QuickCalendarPanelProps {
  origin: string;
  is_open: boolean;
  is_swapping: boolean;
  on_close: () => void;
}

function PanelSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-1 flex-col overflow-hidden">
      <div className="flex h-12 flex-shrink-0 items-center gap-2 ps-4 pe-2">
        <Skeleton className="h-4 w-24 rounded-md" />
        <Skeleton className="h-4 w-10 rounded-full" />
      </div>
      <div className="px-4 pt-2">
        <Skeleton className="h-5 w-32 rounded-md" />
        <div className="mt-3 grid grid-cols-7 gap-1.5">
          {Array.from({ length: 35 }, (_, index) => (
            <Skeleton key={index} className="h-6 rounded-md" />
          ))}
        </div>
      </div>
      <div className="mt-5 flex flex-col gap-2.5 px-4">
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-3 w-16 rounded-md" />
        <Skeleton className="h-10 rounded-lg" />
        <Skeleton className="h-10 rounded-lg" />
        <Skeleton className="h-3 w-20 rounded-md" />
        <Skeleton className="h-10 rounded-lg" />
      </div>
    </div>
  );
}

interface PanelNoticeProps {
  body: string;
  is_setup?: boolean;
  on_close: () => void;
  on_retry: () => void;
}

function PanelNotice({
  body,
  is_setup = false,
  on_close,
  on_retry,
}: PanelNoticeProps) {
  const { t } = use_i18n();
  const retry_button = (
    <Button
      key="retry"
      size="md"
      variant={is_setup ? "ghost" : "outline"}
      onClick={on_retry}
    >
      {t("calendar.panel_try_again")}
    </Button>
  );
  const open_button = (
    <Button
      key="open"
      size="md"
      variant={is_setup ? "outline" : "ghost"}
      onClick={open_calendar_externally}
    >
      {t("calendar.panel_open_calendar")}
    </Button>
  );

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex h-12 flex-shrink-0 items-center gap-1 ps-4 pe-2">
        <h2 className="min-w-0 flex-1 truncate text-[15px] font-medium text-txt-primary">
          {t("common.app_name_calendar")}
        </h2>
        <Tooltip position="bottom" tip={t("common.close")}>
          <Button
            aria-label={t("common.close")}
            className="h-8 w-8 flex-shrink-0 text-txt-secondary"
            size="icon"
            variant="ghost"
            onClick={on_close}
          >
            <XMarkIcon className="h-4 w-4" />
          </Button>
        </Tooltip>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 pb-12 text-center">
        <p
          className="text-[13px] text-txt-secondary"
          role={is_setup ? "status" : "alert"}
        >
          {body}
        </p>
        <div className="flex w-full max-w-[240px] flex-col gap-2">
          {is_setup ? [open_button, retry_button] : [retry_button, open_button]}
        </div>
      </div>
    </div>
  );
}

export function QuickCalendarPanel({
  origin,
  is_open,
  is_swapping,
  on_close,
}: QuickCalendarPanelProps) {
  const { t } = use_i18n();
  const appearance = use_host_appearance();
  const panel_ref = useRef<HTMLElement | null>(null);
  const frame_ref = useRef<HTMLIFrameElement | null>(null);
  const on_close_ref = useRef(on_close);
  const appearance_ref = useRef(appearance);
  const timer_ref = useRef<number | null>(null);
  const deadline_ref = useRef(0);
  const [has_opened, set_has_opened] = useState(is_open);
  const [frame_state, set_frame_state] = useState<FrameState>("loading");
  const [frame_key, set_frame_key] = useState(0);
  const [frame_src, set_frame_src] = useState<string | null>(null);

  const frame_state_ref = useRef<FrameState>(frame_state);
  const grant_refreshed_ref = useRef(false);
  const signed_out_ref = useRef(false);

  on_close_ref.current = on_close;
  appearance_ref.current = appearance;
  frame_state_ref.current = frame_state;

  const { is_visible, is_closing } = use_panel_transition(is_open, is_swapping);

  use_escape_layer(is_open, on_close, "quick_calendar_panel", false);
  use_panel_inset(is_visible, panel_ref);

  useEffect(() => {
    if (is_open) set_has_opened(true);
  }, [is_open]);

  const reload_with_fresh_grant = useCallback(() => {
    grant_refreshed_ref.current = true;
    signed_out_ref.current = false;
    set_frame_key((key) => key + 1);
  }, []);

  useEffect(() => {
    if (is_open) return;

    grant_refreshed_ref.current = false;
  }, [is_open]);

  useEffect(() => {
    if (is_open && signed_out_ref.current && !grant_refreshed_ref.current) {
      reload_with_fresh_grant();
    }
  }, [is_open, reload_with_fresh_grant]);

  const clear_timer = useCallback(() => {
    if (timer_ref.current !== null) {
      window.clearTimeout(timer_ref.current);
      timer_ref.current = null;
    }
  }, []);

  const arm_timer = useCallback(
    (delay: number) => {
      clear_timer();
      const remaining = Math.max(0, deadline_ref.current - Date.now());

      timer_ref.current = window.setTimeout(
        () => {
          timer_ref.current = null;
          set_frame_state((current) =>
            current === "ready" ? current : "failed",
          );
        },
        Math.min(delay, remaining),
      );
    },
    [clear_timer],
  );

  useEffect(() => {
    if (!has_opened) return;

    deadline_ref.current = Date.now() + FIRST_READY_TIMEOUT_MS;

    try {
      const src = new URL(CALENDAR_PANEL_PATH, origin);

      src.searchParams.set("theme", appearance_ref.current.theme);
      src.searchParams.set("palette", appearance_ref.current.palette);

      if (appearance_ref.current.accent) {
        src.searchParams.set("accent", appearance_ref.current.accent);
      }

      if (frame_key > 0) {
        src.searchParams.set("attempt", String(frame_key));
      }

      const grant = mint_panel_handoff_grant(src.origin);

      if (grant) src.hash = HANDOFF_GRANT_HASH_PREFIX + grant;

      set_frame_src(src.href);
    } catch {
      clear_timer();
      set_frame_src(null);
      set_frame_state("failed");

      return clear_timer;
    }

    set_frame_state("loading");
    arm_timer(FIRST_READY_TIMEOUT_MS);

    return clear_timer;
  }, [has_opened, frame_key, origin, arm_timer, clear_timer]);

  const post_theme = useCallback(
    (next: HostAppearance) => {
      const target = frame_ref.current?.contentWindow;

      if (!target) return;

      target.postMessage(
        {
          source: MAIL_HOST_SOURCE,
          type: "theme",
          theme: next.theme,
          palette: next.palette,
          accent: next.accent,
        },
        origin,
      );
    },
    [origin],
  );

  useEffect(() => {
    if (!has_opened) return;

    const handle_message = (event: MessageEvent) => {
      const type = read_panel_message(
        event,
        frame_ref.current?.contentWindow,
        origin,
      );

      if (!type) return;

      if (type === "close") {
        on_close_ref.current();

        return;
      }

      if (type === "status") {
        signed_out_ref.current = is_signed_out_status(event.data);

        if (signed_out_ref.current) {
          if (!grant_refreshed_ref.current) {
            reload_with_fresh_grant();

            return;
          }

          clear_timer();
          set_frame_state("setup");

          return;
        }
      }

      clear_timer();
      set_frame_state("ready");
    };

    window.addEventListener("message", handle_message);

    return () => window.removeEventListener("message", handle_message);
  }, [has_opened, origin, clear_timer, reload_with_fresh_grant]);

  useEffect(() => {
    if (frame_state === "ready") post_theme(appearance);
  }, [frame_state, appearance, post_theme]);

  useEffect(() => {
    if (frame_state !== "ready") return;

    const target = frame_ref.current?.contentWindow;

    if (!target) return;

    target.postMessage(
      { source: MAIL_HOST_SOURCE, type: "visibility", visible: is_open },
      origin,
    );
  }, [frame_state, is_open, origin]);

  const handle_frame_load = useCallback(() => {
    if (frame_state_ref.current === "loading") {
      arm_timer(LOAD_READY_TIMEOUT_MS);
    }
  }, [arm_timer]);

  const retry = useCallback(() => {
    grant_refreshed_ref.current = false;
    signed_out_ref.current = false;
    set_frame_key((key) => key + 1);
  }, []);

  return (
    <aside
      ref={panel_ref}
      aria-label={t("common.app_name_calendar")}
      className={`quick_calendar_panel absolute inset-y-0 start-0 end-1.5 flex-col overflow-hidden rounded-lg bg-surf-primary md:end-2.5 md:rounded-xl ${
        is_visible ? "flex" : "hidden"
      } ${is_closing ? "quick_panel_closing" : "z-10"}`}
    >
      {frame_src && (frame_state === "loading" || frame_state === "ready") && (
        <iframe
          key={frame_key}
          ref={frame_ref}
          allow="clipboard-write"
          className={`absolute inset-0 h-full w-full border-0 bg-transparent transition-opacity duration-150 ${
            frame_state === "ready" ? "opacity-100" : "opacity-0"
          }`}
          referrerPolicy="strict-origin"
          sandbox={FRAME_SANDBOX}
          src={frame_src}
          style={{ colorScheme: appearance.theme }}
          tabIndex={frame_state === "ready" ? 0 : -1}
          title={t("common.app_name_calendar")}
          onLoad={handle_frame_load}
        />
      )}
      {frame_state === "loading" && (
        <div className="absolute inset-0 flex flex-col bg-surf-primary">
          <PanelSkeleton />
        </div>
      )}
      {frame_state === "failed" && (
        <PanelNotice
          body={t("calendar.panel_load_failed")}
          on_close={on_close}
          on_retry={retry}
        />
      )}
      {frame_state === "setup" && (
        <PanelNotice
          body={t("calendar.panel_set_up")}
          is_setup
          on_close={on_close}
          on_retry={retry}
        />
      )}
    </aside>
  );
}
