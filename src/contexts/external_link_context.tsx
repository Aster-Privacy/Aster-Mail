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
} from "react";

import { ExternalLinkWarningModal } from "@/components/modals/external_link_warning_modal";
import { use_preferences } from "@/contexts/preferences_context";
import { open_external } from "@/utils/open_link";

interface ExternalLinkContextType {
  handle_external_link: (url: string) => void;
}

const ExternalLinkContext = createContext<ExternalLinkContextType | undefined>(
  undefined,
);

interface ExternalLinkClickEvent extends CustomEvent {
  detail: { url: string };
}

export function ExternalLinkProvider({ children }: { children: ReactNode }) {
  const { preferences, update_preference } = use_preferences();
  const [is_modal_open, set_is_modal_open] = useState(false);
  const [pending_url, set_pending_url] = useState<string>("");
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

  const handle_external_link = useCallback(
    (url: string) => {
      if (preferences.external_link_warning_dismissed) {
        open_url(url);

        return;
      }

      set_pending_url(url);
      set_is_modal_open(true);
    },
    [preferences.external_link_warning_dismissed, open_url],
  );

  const handle_confirm = useCallback(() => {
    if (pending_url) {
      open_url(pending_url);
    }
    set_is_modal_open(false);
    set_pending_url("");
  }, [pending_url, open_url]);

  const handle_cancel = useCallback(() => {
    set_is_modal_open(false);
    set_pending_url("");
  }, []);

  const handle_dismiss_permanently = useCallback(() => {
    update_preference("external_link_warning_dismissed", true, true);
  }, [update_preference]);

  useEffect(() => {
    const handle_event = (e: Event) => {
      const custom_event = e as ExternalLinkClickEvent;

      if (custom_event.detail?.url) {
        handle_external_link(custom_event.detail.url);
      }
    };

    window.addEventListener("aster-external-link", handle_event);

    return () => {
      window.removeEventListener("aster-external-link", handle_event);
    };
  }, [handle_external_link]);

  return (
    <ExternalLinkContext.Provider value={{ handle_external_link }}>
      {children}
      <ExternalLinkWarningModal
        is_open={is_modal_open}
        on_close={handle_cancel}
        on_confirm={handle_confirm}
        on_dismiss_permanently={handle_dismiss_permanently}
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
