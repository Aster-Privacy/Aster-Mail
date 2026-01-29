import { useState, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { COPY_FIELD_FEEDBACK_MS } from "@/constants/timings";
import { use_auth } from "@/contexts/auth_context";
import { use_mail_stats } from "@/hooks/use_mail_stats";
import { use_folders } from "@/hooks/use_folders";
import { format_bytes } from "@/lib/utils";

function get_local_storage_size(): string {
  let total = 0;

  for (const key in localStorage) {
    if (Object.prototype.hasOwnProperty.call(localStorage, key)) {
      total += (localStorage[key].length + key.length) * 2;
    }
  }

  return format_bytes(total);
}

function get_connection_type(): string {
  const nav = navigator as Navigator & {
    connection?: { effectiveType?: string };
  };

  return nav.connection?.effectiveType?.toUpperCase() || "Unknown";
}

export function DeveloperSection() {
  const { user } = use_auth();
  const { stats } = use_mail_stats();
  const folders_hook = use_folders();

  const [copied_field, set_copied_field] = useState<string | null>(null);
  const [sw_status, set_sw_status] = useState<string>("Checking...");

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        set_sw_status(registrations.length > 0 ? "Active" : "None");
      });
    } else {
      set_sw_status("Unsupported");
    }
  }, []);

  const build_hash = Date.now().toString(36).slice(-6).toUpperCase();
  const total_emails = stats.inbox + stats.sent + stats.archived + stats.trash;
  const custom_folders = folders_hook.state.folders.filter(
    (f) => !f.is_system,
  ).length;
  const storage_used = format_bytes(stats.storage_used_bytes);
  const is_online = navigator.onLine;
  const local_storage_size = get_local_storage_size();
  const connection = get_connection_type();
  const session_keys = Object.keys(sessionStorage).length;

  const copy_to_clipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    set_copied_field(field);
    setTimeout(() => set_copied_field(null), COPY_FIELD_FEEDBACK_MS);
  };

  const handle_clear_cache = async () => {
    localStorage.clear();
    sessionStorage.clear();
    if ("caches" in window) {
      const cache_names = await caches.keys();

      await Promise.all(cache_names.map((name) => caches.delete(name)));
    }
    window.location.reload();
  };

  const export_debug_info = () => {
    const debug_data = {
      timestamp: new Date().toISOString(),
      app: { version: "1.0.0", build: build_hash, environment: "development" },
      user: { id: user?.id?.slice(0, 8) || null },
      network: { online: is_online, connection },
      storage: { local_storage: local_storage_size, session_keys },
      stats: {
        total_emails,
        inbox: stats.inbox,
        sent: stats.sent,
        folders: custom_folders,
        storage: storage_used,
      },
    };
    const blob = new Blob([JSON.stringify(debug_data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = `astermail-debug-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const dev_row = (label: string, value: string, copyable?: boolean) => (
    <div className="flex justify-between items-center">
      <span className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
        {label}
      </span>
      <span
        className={`text-[13px] font-mono tabular-nums ${copyable ? "cursor-pointer hover:opacity-70" : ""}`}
        role={copyable ? "button" : undefined}
        style={{ color: "var(--text-primary)" }}
        tabIndex={copyable ? 0 : undefined}
        onClick={copyable ? () => copy_to_clipboard(value, label) : undefined}
        onKeyDown={
          copyable
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  copy_to_clipboard(value, label);
                }
              }
            : undefined
        }
      >
        {copied_field === label ? "Copied!" : value}
      </span>
    </div>
  );

  const section_header = (title: string) => (
    <p
      className="text-[10px] font-medium uppercase tracking-wider mb-3"
      style={{ color: "var(--text-muted)" }}
    >
      {title}
    </p>
  );

  const section_box = (children: React.ReactNode) => (
    <div
      className="rounded-lg p-4 space-y-2"
      style={{ backgroundColor: "var(--bg-tertiary)" }}
    >
      {children}
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        {section_header("Build Info")}
        <div
          className="rounded-lg p-4"
          style={{ backgroundColor: "var(--bg-tertiary)" }}
        >
          <div className="grid grid-cols-2 gap-y-3 gap-x-6">
            <div>
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                Release
              </p>
              <p
                className="text-[13px] font-mono"
                style={{ color: "var(--text-primary)" }}
              >
                1.0.0 Aurora
              </p>
            </div>
            <div>
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                Build
              </p>
              <p
                className="text-[13px] font-mono"
                style={{ color: "var(--text-primary)" }}
              >
                {build_hash}
              </p>
            </div>
            <div>
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                Environment
              </p>
              <p
                className="text-[13px] font-mono"
                style={{ color: "var(--text-primary)" }}
              >
                development
              </p>
            </div>
            <div>
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                Platform
              </p>
              <p
                className="text-[13px] font-mono"
                style={{ color: "var(--text-primary)" }}
              >
                {navigator.platform.split(" ")[0]}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div>
        {section_header("Email Statistics")}
        {section_box(
          <>
            {dev_row("Total Emails", total_emails.toLocaleString())}
            {dev_row("Inbox", stats.inbox.toLocaleString())}
            {dev_row("Sent", stats.sent.toLocaleString())}
            {dev_row("Archived", stats.archived.toLocaleString())}
            {dev_row("Trash", stats.trash.toLocaleString())}
            {dev_row("Custom Folders", custom_folders.toString())}
            {dev_row("Storage Used", storage_used)}
          </>,
        )}
      </div>

      <div>
        {section_header("Session & Security")}
        {section_box(
          <>
            {dev_row("User ID", user?.id?.slice(0, 8) || "—", true)}
            {dev_row("Encryption", "AES-256-GCM")}
            {dev_row("Key Exchange", "X25519")}
            {dev_row("Signatures", "Ed25519")}
            {dev_row("Password Hash", "Argon2id")}
          </>,
        )}
      </div>

      <div>
        {section_header("Network & Storage")}
        {section_box(
          <>
            {dev_row("Status", is_online ? "Online" : "Offline")}
            {dev_row("Connection", connection)}
            {dev_row("Service Worker", sw_status)}
            {dev_row("LocalStorage", local_storage_size)}
            {dev_row("Session Keys", session_keys.toString())}
          </>,
        )}
      </div>

      <div>
        {section_header("Debug Actions")}
        <div
          className="rounded-lg p-4 space-y-2"
          style={{ backgroundColor: "var(--bg-tertiary)" }}
        >
          <Button
            className="w-full"
            variant="secondary"
            onClick={export_debug_info}
          >
            Export Debug Info
          </Button>
          <Button
            className="w-full"
            variant="secondary"
            onClick={() => window.location.reload()}
          >
            Force Reload
          </Button>
          <Button
            className="w-full"
            variant="destructive"
            onClick={handle_clear_cache}
          >
            Clear Cache & Reload
          </Button>
        </div>
      </div>

      <div
        className="rounded-lg p-4"
        style={{ backgroundColor: "var(--bg-tertiary)" }}
      >
        <p
          className="text-[11px] text-center"
          style={{ color: "var(--text-muted)" }}
        >
          5× click version in sidebar to toggle developer mode
        </p>
      </div>
    </div>
  );
}
