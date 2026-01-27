import type { DraftType } from "@/services/api/multi_drafts";

import { useState, useCallback, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { ComposeWindow } from "./compose_window";

export interface EditDraftData {
  id: string;
  version: number;
  draft_type: DraftType;
  reply_to_id?: string;
  forward_from_id?: string;
  to_recipients: string[];
  cc_recipients: string[];
  bcc_recipients: string[];
  subject: string;
  message: string;
  updated_at: string;
}

export interface ComposeInstance {
  id: string;
  edit_draft?: EditDraftData | null;
  initial_to?: string;
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

export function useComposeManager() {
  const [instances, set_instances] = useState<ComposeInstance[]>([]);

  const open_compose = useCallback(
    (edit_draft?: EditDraftData | null, initial_to?: string) => {
      const new_instance: ComposeInstance = {
        id: generate_compose_id(),
        edit_draft,
        initial_to,
        is_minimized: false,
      };
      set_instances((prev) => [...prev, new_instance]);
    },
    [],
  );

  const close_compose = useCallback((id: string) => {
    set_instances((prev) => prev.filter((instance) => instance.id !== id));
  }, []);

  const toggle_minimize = useCallback((id: string) => {
    set_instances((prev) =>
      prev.map((instance) =>
        instance.id === id
          ? { ...instance, is_minimized: !instance.is_minimized }
          : instance,
      ),
    );
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
  const container_ref = useRef<HTMLDivElement>(null);
  const [show_scroll_hint, set_show_scroll_hint] = useState(false);

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
    observer.observe(container, { childList: true, subtree: true });

    return () => {
      window.removeEventListener("resize", check_overflow);
      observer.disconnect();
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
    <div className="fixed bottom-0 left-0 right-0 z-50 pointer-events-none">
      <div
        ref={container_ref}
        className="flex flex-row-reverse items-end gap-2 px-4 pb-0 overflow-x-auto pointer-events-auto scrollbar-compose"
        style={{
          scrollbarWidth: "thin",
          scrollbarColor: "var(--border-primary) transparent",
        }}
      >
        <AnimatePresence mode="popLayout">
          {instances.map((instance, index) => (
            <motion.div
              key={instance.id}
              layout
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              transition={{
                type: "spring",
                stiffness: 500,
                damping: 30,
                mass: 0.8,
              }}
            >
              <ComposeWindow
                edit_draft={instance.edit_draft}
                index={index}
                initial_to={instance.initial_to}
                instance_id={instance.id}
                is_minimized={instance.is_minimized}
                on_close={() => on_close(instance.id)}
                on_draft_cleared={on_draft_cleared}
                on_toggle_minimize={() => on_toggle_minimize(instance.id)}
                total_instances={instances.length}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      {show_scroll_hint && (
        <div
          className="absolute left-0 top-0 bottom-0 w-8 pointer-events-none"
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
