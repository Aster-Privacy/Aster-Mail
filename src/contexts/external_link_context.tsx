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
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
  useMemo,
} from "react";
import { useNavigate } from "react-router-dom";

import { ExternalLinkWarningModal } from "@/components/modals/external_link_warning_modal";
import { use_preferences } from "@/contexts/preferences_context";
import { open_external } from "@/utils/open_link";
import {
  is_any_lockdown_active,
  LOCKDOWN_CHANGED_EVENT,
} from "@/services/lockdown_store";
import { is_trusted_link } from "@/lib/trusted_link_domains";
import { describe_link } from "@/lib/link_destination";
import { in_app_route_for } from "@/lib/in_app_link";
import { PUBLIC_WEB_APP_ORIGIN } from "@/lib/public_origin";
import {
  EXTERNAL_LINK_EVENT,
  type ExternalLinkKind,
  type ExternalLinkRequestDetail,
} from "@/utils/external_link_request";

interface ExternalLinkContextType {
  handle_external_link: (
    url: string,
    on_result?: (opened: boolean) => void,
    link_text?: string | null,
    trigger?: HTMLElement | null,
    kind?: ExternalLinkKind,
  ) => void;
}

const ExternalLinkContext = createContext<ExternalLinkContextType | undefined>(
  undefined,
);

type ExternalLinkClickEvent = CustomEvent<
  Partial<ExternalLinkRequestDetail> | undefined
>;

export function ExternalLinkProvider({ children }: { children: ReactNode }) {
  const { preferences, update_preference } = use_preferences();
  const navigate = useNavigate();
  const [is_modal_open, set_is_modal_open] = useState(false);
  const [pending_url, set_pending_url] = useState<string>("");
  const [pending_text, set_pending_text] = useState<string>("");
  const [pending_kind, set_pending_kind] = useState<ExternalLinkKind>("link");
  const [pending_trigger, set_pending_trigger] = useState<HTMLElement | null>(
    null,
  );
  const pending_result_ref = useRef<((opened: boolean) => void) | null>(null);
  const [lockdown_active, set_lockdown_active] = useState(() =>
    is_any_lockdown_active(),
  );

  useEffect(() => {
    const update = () => set_lockdown_active(is_any_lockdown_active());

    window.addEventListener(LOCKDOWN_CHANGED_EVENT, update);
    window.addEventListener("storage", update);

    return () => {
      window.removeEventListener(LOCKDOWN_CHANGED_EVENT, update);
      window.removeEventListener("storage", update);
    };
  }, []);
  const warmup_ref = useRef(false);

  useEffect(() => {
    if (warmup_ref.current) return;
    warmup_ref.current = true;
    const el = document.createElement("div");

    el.setAttribute("aria-hidden", "true");
    el.style.cssText =
      "position:fixed;inset:0;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);pointer-events:none;opacity:0.01;z-index:-1";
    document.body.appendChild(el);
    void el.offsetHeight;
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.remove();
      });
    });

    return () => {
      cancelAnimationFrame(frame);
      el.remove();
    };
  }, []);

  const open_url = useCallback((url: string) => {
    open_external(url);
  }, []);

  const settle_pending_result = useCallback((opened: boolean) => {
    const on_result = pending_result_ref.current;

    pending_result_ref.current = null;
    on_result?.(opened);
  }, []);

  useEffect(() => () => settle_pending_result(false), [settle_pending_result]);

  const handle_external_link = useCallback(
    (
      url: string,
      on_result?: (opened: boolean) => void,
      link_text?: string | null,
      trigger?: HTMLElement | null,
      kind: ExternalLinkKind = "link",
    ) => {
      const in_app_route = in_app_route_for(url, [
        window.location.origin,
        PUBLIC_WEB_APP_ORIGIN,
      ]);

      if (in_app_route) {
        navigate(in_app_route);
        on_result?.(true);

        return;
      }

      const currently_locked = lockdown_active || is_any_lockdown_active();
      const is_blocked = describe_link(url).kind === "blocked";
      const skip_prompt =
        kind === "unsubscribe"
          ? preferences.unsubscribe_confirm_dismissed
          : preferences.external_link_warning_dismissed || is_trusted_link(url);

      if (!currently_locked && !is_blocked && skip_prompt) {
        open_url(url);
        on_result?.(true);

        return;
      }

      settle_pending_result(false);
      pending_result_ref.current = on_result ?? null;
      set_pending_url(url);
      set_pending_text(link_text ?? "");
      set_pending_kind(kind);
      set_pending_trigger(trigger ?? null);
      set_is_modal_open(true);
    },
    [
      lockdown_active,
      preferences.external_link_warning_dismissed,
      preferences.unsubscribe_confirm_dismissed,
      open_url,
      settle_pending_result,
      navigate,
    ],
  );

  const handle_confirm = useCallback(() => {
    const can_open =
      Boolean(pending_url) &&
      describe_link(pending_url).kind !== "blocked" &&
      !lockdown_active &&
      !is_any_lockdown_active();

    if (can_open) {
      open_url(pending_url);
    }
    settle_pending_result(can_open);
    set_is_modal_open(false);
    set_pending_url("");
    set_pending_text("");
  }, [pending_url, lockdown_active, open_url, settle_pending_result]);

  const handle_cancel = useCallback(() => {
    settle_pending_result(false);
    set_is_modal_open(false);
    set_pending_url("");
    set_pending_text("");
  }, [settle_pending_result]);

  const handle_dismiss_permanently = useCallback(() => {
    update_preference(
      pending_kind === "unsubscribe"
        ? "unsubscribe_confirm_dismissed"
        : "external_link_warning_dismissed",
      true,
      true,
    );
  }, [pending_kind, update_preference]);

  useEffect(() => {
    const handle_event = (e: Event) => {
      const custom_event = e as ExternalLinkClickEvent;
      const url = custom_event.detail?.url;

      if (url) {
        custom_event.preventDefault();
        handle_external_link(
          url,
          custom_event.detail?.on_result,
          custom_event.detail?.link_text,
          custom_event.detail?.trigger,
          custom_event.detail?.kind,
        );
      }
    };

    window.addEventListener(EXTERNAL_LINK_EVENT, handle_event);

    return () => {
      window.removeEventListener(EXTERNAL_LINK_EVENT, handle_event);
    };
  }, [handle_external_link]);

  const external_link_value = useMemo(
    () => ({ handle_external_link }),
    [handle_external_link],
  );

  return (
    <ExternalLinkContext.Provider value={external_link_value}>
      {children}
      <ExternalLinkWarningModal
        is_open={is_modal_open}
        kind={pending_kind}
        link_text={pending_text}
        lockdown_active={lockdown_active}
        on_close={handle_cancel}
        on_confirm={handle_confirm}
        on_dismiss_permanently={handle_dismiss_permanently}
        return_focus_to={pending_trigger}
        url={pending_url}
      />
    </ExternalLinkContext.Provider>
  );
}

export function use_external_link() {
  const context = useContext(ExternalLinkContext);

  if (context === undefined) {
    throw new Error(
      "use_external_link must be used within an ExternalLinkProvider",
    );
  }

  return context;
}
