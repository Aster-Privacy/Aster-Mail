import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { XMarkIcon } from "@heroicons/react/24/outline";

import { use_auth } from "@/contexts/auth_context";
import { use_mail_stats } from "@/hooks/use_mail_stats";
import { use_folders } from "@/hooks/use_folders";
import { format_bytes } from "@/lib/utils";

interface DeveloperPanelProps {
  is_open: boolean;
  on_close: () => void;
}

export function DeveloperPanel({ is_open, on_close }: DeveloperPanelProps) {
  const { user } = use_auth();
  const { stats } = use_mail_stats();
  const { state: folders_state } = use_folders();

  const panel_ref = useRef<HTMLDivElement>(null);
  const [position, set_position] = useState({ x: 0, y: 0 });
  const [is_dragging, set_is_dragging] = useState(false);
  const drag_start = useRef({ x: 0, y: 0 });
  const [initialized, set_initialized] = useState(false);

  useEffect(() => {
    if (is_open && !initialized) {
      const panel_width = 300;
      const panel_height = 420;
      const padding = 20;

      set_position({
        x: window.innerWidth - panel_width - padding,
        y: window.innerHeight - panel_height - padding,
      });
      set_initialized(true);
    }
  }, [is_open, initialized]);

  useEffect(() => {
    if (!is_open) {
      set_initialized(false);
    }
  }, [is_open]);

  const handle_mouse_down = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest("button")) return;
      set_is_dragging(true);
      drag_start.current = {
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      };
    },
    [position],
  );

  const handle_mouse_move = useCallback(
    (e: MouseEvent) => {
      if (!is_dragging) return;

      const panel_width = 300;
      const panel_height = panel_ref.current?.offsetHeight || 420;

      let new_x = e.clientX - drag_start.current.x;
      let new_y = e.clientY - drag_start.current.y;

      new_x = Math.max(0, Math.min(window.innerWidth - panel_width, new_x));
      new_y = Math.max(0, Math.min(window.innerHeight - panel_height, new_y));

      set_position({ x: new_x, y: new_y });
    },
    [is_dragging],
  );

  const handle_mouse_up = useCallback(() => {
    set_is_dragging(false);
  }, []);

  useEffect(() => {
    if (is_dragging) {
      window.addEventListener("mousemove", handle_mouse_move);
      window.addEventListener("mouseup", handle_mouse_up);

      return () => {
        window.removeEventListener("mousemove", handle_mouse_move);
        window.removeEventListener("mouseup", handle_mouse_up);
      };
    }
  }, [is_dragging, handle_mouse_move, handle_mouse_up]);

  const build_hash = Date.now().toString(36).slice(-6).toUpperCase();
  const total_emails = stats.inbox + stats.sent + stats.archived + stats.trash;
  const custom_folders = folders_state.folders.filter(
    (f) => !f.is_system,
  ).length;
  const storage_used = format_bytes(stats.storage_used_bytes);

  return (
    <AnimatePresence>
      {is_open && (
        <motion.div
          ref={panel_ref}
          animate={{ opacity: 1, scale: 1 }}
          className="fixed z-[9999] w-[300px] rounded-xl overflow-hidden select-none"
          exit={{ opacity: 0, scale: 0.98 }}
          initial={{ opacity: 0, scale: 0.98 }}
          style={{
            left: position.x,
            top: position.y,
            backgroundColor: "var(--bg-primary)",
            border: "1px solid var(--border-primary)",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
            cursor: is_dragging ? "grabbing" : "default",
          }}
          transition={{ duration: 0.15 }}
          onMouseDown={handle_mouse_down}
        >
          <div
            className="flex items-center justify-between px-4 py-3 cursor-grab active:cursor-grabbing"
            style={{ borderBottom: "1px solid var(--border-primary)" }}
          >
            <div>
              <p
                className="text-[13px] font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                Developer Mode
              </p>
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                v0.1.0
              </p>
            </div>
            <button
              className="p-1.5 rounded-md transition-colors"
              style={{ color: "var(--text-muted)" }}
              onClick={on_close}
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor = "var(--bg-secondary)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = "transparent")
              }
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 space-y-4">
            <div>
              <p
                className="text-[10px] font-medium uppercase tracking-wider mb-2"
                style={{ color: "var(--text-muted)" }}
              >
                Build Info
              </p>
              <div
                className="rounded-lg p-3"
                style={{ backgroundColor: "var(--bg-secondary)" }}
              >
                <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                  <div>
                    <p
                      className="text-[10px]"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Release
                    </p>
                    <p
                      className="text-[12px] font-mono"
                      style={{ color: "var(--text-primary)" }}
                    >
                      1.0.0 Aurora
                    </p>
                  </div>
                  <div>
                    <p
                      className="text-[10px]"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Build
                    </p>
                    <p
                      className="text-[12px] font-mono"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {build_hash}
                    </p>
                  </div>
                  <div>
                    <p
                      className="text-[10px]"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Environment
                    </p>
                    <p
                      className="text-[12px] font-mono"
                      style={{ color: "var(--text-primary)" }}
                    >
                      development
                    </p>
                  </div>
                  <div>
                    <p
                      className="text-[10px]"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Platform
                    </p>
                    <p
                      className="text-[12px] font-mono"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {navigator.platform.split(" ")[0]}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <p
                className="text-[10px] font-medium uppercase tracking-wider mb-2"
                style={{ color: "var(--text-muted)" }}
              >
                Statistics
              </p>
              <div
                className="rounded-lg p-3 space-y-2"
                style={{ backgroundColor: "var(--bg-secondary)" }}
              >
                <div className="flex justify-between">
                  <span
                    className="text-[12px]"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Total Emails
                  </span>
                  <span
                    className="text-[12px] font-mono tabular-nums"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {total_emails}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span
                    className="text-[12px]"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Inbox
                  </span>
                  <span
                    className="text-[12px] font-mono tabular-nums"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {stats.inbox}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span
                    className="text-[12px]"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Sent
                  </span>
                  <span
                    className="text-[12px] font-mono tabular-nums"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {stats.sent}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span
                    className="text-[12px]"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Folders
                  </span>
                  <span
                    className="text-[12px] font-mono tabular-nums"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {custom_folders}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span
                    className="text-[12px]"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Storage Used
                  </span>
                  <span
                    className="text-[12px] font-mono tabular-nums"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {storage_used}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <p
                className="text-[10px] font-medium uppercase tracking-wider mb-2"
                style={{ color: "var(--text-muted)" }}
              >
                Session
              </p>
              <div
                className="rounded-lg p-3 space-y-2"
                style={{ backgroundColor: "var(--bg-secondary)" }}
              >
                <div className="flex justify-between">
                  <span
                    className="text-[12px]"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    User ID
                  </span>
                  <span
                    className="text-[12px] font-mono"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {user?.id?.slice(0, 8) || "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span
                    className="text-[12px]"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Encryption
                  </span>
                  <span
                    className="text-[12px] font-mono"
                    style={{ color: "var(--text-primary)" }}
                  >
                    AES-256-GCM
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div
            className="px-4 py-2.5"
            style={{ borderTop: "1px solid var(--border-primary)" }}
          >
            <p
              className="text-[10px] text-center"
              style={{ color: "var(--text-muted)" }}
            >
              5× click email to close
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
