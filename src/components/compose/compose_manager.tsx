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
import type {
  DraftType,
  DraftAttachmentData,
} from "@/services/api/multi_drafts";

import {
  useState,
  useCallback,
  useEffect,
  useRef,
  Suspense,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";

import {
  compose_shell_mode,
  WINDOW_HEIGHT_NORMAL,
  WINDOW_WIDTH,
  WINDOW_WIDTH_MINIMIZED,
} from "@/components/compose/compose_shell_mode";
import { use_should_reduce_motion } from "@/provider";
import { show_toast } from "@/components/toast/simple_toast";
import { use_translation } from "@/lib/i18n/context";
import { use_preferences } from "@/contexts/preferences_context";
import { play_iconic_sound } from "@/services/iconic_sounds";
import { ErrorBoundary } from "@/components/ui/error_boundary";
import { Spinner } from "@/components/ui/spinner";
import { ignore_error } from "@/lib/ignore_error";
import { lazy_with_retry, preload_when_idle } from "@/utils/lazy_with_retry";

export const load_compose_window = () =>
  import("@/components/compose/compose_window");

const ComposeWindow = lazy_with_retry(() =>
  load_compose_window().then((m) => ({ default: m.ComposeWindow })),
);

export function preload_compose_window(): void {
  void load_compose_window().catch((caught) =>
    ignore_error("components/compose/compose_manager:preload", caught),
  );
}

function ComposeWindowFallback({
  is_minimized,
}: {
  is_minimized: boolean;
}): ReactNode {
  const { t } = use_translation();
  const { preferences } = use_preferences();
  const shell_mode = compose_shell_mode(
    is_minimized,
    (preferences.compose_window_mode ?? "default") === "fullscreen",
  );
  const is_narrow = window.innerWidth < 640;

  return (
    <div
      aria-busy="true"
      aria-label={t("common.loading")}
      className={`flex items-center justify-center shadow-[var(--aster-floating-shadow)] overflow-hidden bg-[var(--aster-dialog-bg,var(--modal-bg))] text-txt-muted ${
        shell_mode === "minimized"
          ? "h-[53px] rounded-t-[var(--aster-radius-floating,16px)]"
          : shell_mode === "expanded"
            ? "fixed inset-4 z-50 rounded-[var(--aster-radius-floating,16px)]"
            : "fixed inset-0 z-50 sm:relative sm:inset-auto sm:z-auto rounded-none sm:rounded-t-[var(--aster-radius-floating,16px)]"
      }`}
      role="status"
      style={
        shell_mode === "minimized"
          ? { width: WINDOW_WIDTH_MINIMIZED }
          : shell_mode === "docked" && !is_narrow
            ? {
                width: WINDOW_WIDTH,
                height: WINDOW_HEIGHT_NORMAL,
                maxWidth: window.innerWidth - 48,
              }
            : undefined
      }
    >
      <Spinner size="md" />
    </div>
  );
}

const MAX_COMPOSE_INSTANCES = 3;

export interface EditDraftData {
  id: string;
  version: number;
  draft_type: DraftType;
  reply_to_id?: string;
  rfc_message_id?: string;
  forward_from_id?: string;
  thread_token?: string;
  to_recipients: string[];
  cc_recipients: string[];
  bcc_recipients: string[];
  subject: string;
  message: string;
  from_email?: string;
  expires_at?: string;
  expiry_password?: string;
  updated_at: string;
  attachments?: DraftAttachmentData[];
  is_restored_send?: boolean;
}

export interface ComposeInstance {
  id: string;
  edit_draft?: EditDraftData | null;
  initial_to?: string;
  initial_ghost_mode?: boolean;
  is_minimized: boolean;
}

interface ComposeManagerProps {
  on_draft_cleared?: () => void;
}

let compose_counter = 0;

function generate_compose_id(): string {
  compose_counter += 1;

  return `compose_${Date.now()}_${compose_counter}`;
}

export function use_compose_manager() {
  const { t } = use_translation();
  const { preferences } = use_preferences();
  const [instances, set_instances] = useState<ComposeInstance[]>([]);
  const instances_ref = useRef(instances);

  instances_ref.current = instances;

  const open_compose = useCallback(
    (
      edit_draft?: EditDraftData | null,
      initial_to?: string,
      initial_ghost_mode?: boolean,
    ) => {
      const current = instances_ref.current;
      const existing =
        !edit_draft && initial_to
          ? current.find(
              (instance) =>
                !instance.edit_draft && instance.initial_to === initial_to,
            )
          : undefined;

      if (existing) {
        const next = current.map((instance) =>
          instance.id === existing.id
            ? { ...instance, is_minimized: false }
            : instance,
        );

        instances_ref.current = next;
        set_instances(next);

        return;
      }

      if (current.length >= MAX_COMPOSE_INSTANCES) {
        show_toast(t("mail.max_composers_warning"), "error");

        return;
      }

      const next = [
        ...current,
        {
          id: generate_compose_id(),
          edit_draft,
          initial_to,
          initial_ghost_mode,
          is_minimized:
            (preferences.compose_window_mode ?? "default") === "minimized",
        },
      ];

      instances_ref.current = next;
      set_instances(next);
      play_iconic_sound("compose");
    },
    [t, preferences.compose_window_mode],
  );

  const close_compose = useCallback((id: string) => {
    const next = instances_ref.current.filter((instance) => instance.id !== id);

    instances_ref.current = next;
    set_instances(next);
  }, []);

  const toggle_minimize = useCallback((id: string) => {
    const next = instances_ref.current.map((instance) =>
      instance.id === id
        ? { ...instance, is_minimized: !instance.is_minimized }
        : instance,
    );

    instances_ref.current = next;
    set_instances(next);
  }, []);

  const has_instances = instances.length > 0;

  return {
    instances,
    open_compose,
    close_compose,
    toggle_minimize,
    has_instances,
  };
}

interface ComposeManagerComponentProps extends ComposeManagerProps {
  instances: ComposeInstance[];
  on_close: (id: string) => void;
  on_toggle_minimize: (id: string) => void;
}

export function ComposeManager({
  instances,
  on_close,
  on_toggle_minimize,
  on_draft_cleared,
}: ComposeManagerComponentProps) {
  const reduce_motion = use_should_reduce_motion();
  const { t } = use_translation();
  const container_ref = useRef<HTMLDivElement>(null);
  const [show_scroll_hint, set_show_scroll_hint] = useState(false);

  const handle_load_error = useCallback(
    (id: string) => {
      show_toast(t("common.unable_to_load_composer"), "error");
      on_close(id);
    },
    [on_close, t],
  );

  useEffect(() => preload_when_idle(preload_compose_window), []);

  useEffect(() => {
    const container = container_ref.current;

    if (!container) return;

    const check_overflow = () => {
      const has_overflow = container.scrollWidth > container.clientWidth;

      set_show_scroll_hint(has_overflow);
    };

    check_overflow();
    window.addEventListener("resize", check_overflow);

    const observer = new MutationObserver(check_overflow);

    observer.observe(container, { childList: true });

    const size_observer = new ResizeObserver(check_overflow);

    size_observer.observe(container);

    return () => {
      window.removeEventListener("resize", check_overflow);
      observer.disconnect();
      size_observer.disconnect();
    };
  }, [instances.length]);

  useEffect(() => {
    const container = container_ref.current;

    if (!container || instances.length === 0) return;

    requestAnimationFrame(() => {
      container.scrollLeft = container.scrollWidth;
    });
  }, [instances.length]);

  if (instances.length === 0) {
    return null;
  }

  return (
    <div
      className="fixed bottom-0 start-0 end-0 z-50 pointer-events-none"
      style={{ paddingInlineEnd: "var(--quick_panel_inset, 0px)" }}
    >
      <div
        ref={container_ref}
        className="flex flex-row-reverse items-end gap-2 px-4 pb-0 overflow-x-auto scrollbar-compose"
        style={{
          scrollbarWidth: "thin",
        }}
      >
        <AnimatePresence>
          {instances.map((instance) => (
            <motion.div
              key={instance.id}
              animate={{ opacity: 1 }}
              className="pointer-events-auto"
              exit={{ opacity: 0 }}
              initial={reduce_motion ? false : { opacity: 0 }}
              transition={{ duration: reduce_motion ? 0 : 0.15 }}
            >
              <ErrorBoundary
                fallback={null}
                on_error={() => handle_load_error(instance.id)}
              >
                <Suspense
                  fallback={
                    <ComposeWindowFallback
                      is_minimized={instance.is_minimized}
                    />
                  }
                >
                  <ComposeWindow
                    edit_draft={instance.edit_draft}
                    initial_ghost_mode={instance.initial_ghost_mode}
                    initial_to={instance.initial_to}
                    instance_id={instance.id}
                    is_minimized={instance.is_minimized}
                    on_close={() => on_close(instance.id)}
                    on_draft_cleared={on_draft_cleared}
                    on_toggle_minimize={() => on_toggle_minimize(instance.id)}
                  />
                </Suspense>
              </ErrorBoundary>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      {show_scroll_hint && (
        <div
          className="absolute start-0 top-0 bottom-0 w-8 pointer-events-none"
          style={{
            background:
              "linear-gradient(to right, var(--bg-primary), transparent)",
          }}
        />
      )}
      <style>{`
        .scrollbar-compose::-webkit-scrollbar {
          height: 6px;
        }
        .scrollbar-compose::-webkit-scrollbar-track {
          background: transparent;
        }
        .scrollbar-compose::-webkit-scrollbar-thumb {
          background: var(--border-primary);
          border-radius: 3px;
        }
        .scrollbar-compose::-webkit-scrollbar-thumb:hover {
          background: var(--border-secondary);
        }
      `}</style>
    </div>
  );
}
