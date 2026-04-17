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
import type { IdentityKeyStatus } from "@/services/api/key_rotation";

import { useState, useEffect, useCallback } from "react";
import {
  InformationCircleIcon,
  LockClosedIcon,
  UserIcon,
  ChartBarIcon,
  BoltIcon,
  GlobeAltIcon,
  CircleStackIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { Spinner } from "@/components/ui/spinner";
import { show_toast } from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";
import { use_auth } from "@/contexts/auth_context";
import { use_mail_stats } from "@/hooks/use_mail_stats";
import { use_folders } from "@/hooks/use_folders";
import { use_online_status } from "@/hooks/use_online_status";
import { format_bytes } from "@/lib/utils";
import { get_identity_key_status } from "@/services/api/key_rotation";
import {
  get_wkd_publication_status,
  get_keyserver_publication_status,
} from "@/services/api/keys";
import {
  get_vault_from_memory,
  has_passphrase_in_memory,
} from "@/services/crypto/memory_key_store";

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
    connection?: { effectiveType?: string; downlink?: number; rtt?: number };
  };

  return nav.connection?.effectiveType?.toUpperCase() || "Unknown";
}

function get_connection_speed(): string {
  const nav = navigator as Navigator & {
    connection?: { downlink?: number };
  };

  if (nav.connection?.downlink) {
    return `${nav.connection.downlink} Mbps`;
  }

  return "Unknown";
}

function get_connection_latency(): string {
  const nav = navigator as Navigator & {
    connection?: { rtt?: number };
  };

  if (nav.connection?.rtt !== undefined) {
    return `${nav.connection.rtt}ms`;
  }

  return "Unknown";
}

function get_memory_usage(): string {
  const perf = performance as Performance & {
    memory?: { usedJSHeapSize?: number; jsHeapSizeLimit?: number };
  };

  if (perf.memory?.usedJSHeapSize) {
    return `${format_bytes(perf.memory.usedJSHeapSize)} / ${format_bytes(perf.memory.jsHeapSizeLimit || 0)}`;
  }

  return "Unavailable";
}

function get_page_load_time(): string {
  const entries = performance.getEntriesByType(
    "navigation",
  ) as PerformanceNavigationTiming[];

  if (entries.length > 0) {
    const nav = entries[0];

    return `${Math.round(nav.loadEventEnd - nav.startTime)}ms`;
  }

  return "Unavailable";
}

function get_dom_content_loaded(): string {
  const entries = performance.getEntriesByType(
    "navigation",
  ) as PerformanceNavigationTiming[];

  if (entries.length > 0) {
    const nav = entries[0];

    return `${Math.round(nav.domContentLoadedEventEnd - nav.startTime)}ms`;
  }

  return "Unavailable";
}

function count_local_storage_keys(): number {
  return localStorage.length;
}

function get_indexed_db_info(): Promise<string> {
  if (!("indexedDB" in window)) return Promise.resolve("Unsupported");

  return indexedDB
    .databases()
    .then((dbs) => `${dbs.length} database${dbs.length === 1 ? "" : "s"}`)
    .catch(() => "Unknown");
}

function get_screen_info(): string {
  return `${window.screen.width}x${window.screen.height} @ ${window.devicePixelRatio}x`;
}

function get_viewport_info(): string {
  return `${window.innerWidth}x${window.innerHeight}`;
}

function get_session_duration(): string {
  const nav_entries = performance.getEntriesByType(
    "navigation",
  ) as PerformanceNavigationTiming[];

  if (nav_entries.length > 0) {
    const elapsed_ms = performance.now();
    const seconds = Math.floor(elapsed_ms / 1000);

    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);

    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);

    return `${hours}h ${minutes % 60}m`;
  }

  return "Unknown";
}

export function DeveloperSection() {
  const { t } = use_i18n();
  const { user } = use_auth();
  const { stats } = use_mail_stats();
  const folders_hook = use_folders();
  const { is_online } = use_online_status();

  const [sw_status, set_sw_status] = useState("Checking...");
  const [key_status, set_key_status] = useState<IdentityKeyStatus | null>(null);
  const [key_loading, set_key_loading] = useState(true);
  const [wkd_published, set_wkd_published] = useState<boolean | null>(null);
  const [keyserver_published, set_keyserver_published] = useState<
    boolean | null
  >(null);
  const [idb_info, set_idb_info] = useState("Checking...");
  const [session_duration, set_session_duration] = useState(
    get_session_duration(),
  );

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        if (registrations.length > 0) {
          const active = registrations.filter((r) => r.active).length;

          set_sw_status(`${active} active`);
        } else {
          set_sw_status("None registered");
        }
      });
    } else {
      set_sw_status("Unsupported");
    }
  }, []);

  useEffect(() => {
    get_indexed_db_info()
      .then(set_idb_info)
      .catch((e) => {
        if (import.meta.env.DEV) console.error(e);
      });
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      set_session_duration(get_session_duration());
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  const load_crypto_status = useCallback(async () => {
    set_key_loading(true);
    try {
      const [key_result, wkd_result, ks_result] = await Promise.allSettled([
        get_identity_key_status(),
        get_wkd_publication_status(),
        get_keyserver_publication_status(),
      ]);

      if (key_result.status === "fulfilled" && key_result.value.data) {
        set_key_status(key_result.value.data);
      }
      if (wkd_result.status === "fulfilled" && wkd_result.value.data) {
        set_wkd_published(wkd_result.value.data.published);
      }
      if (ks_result.status === "fulfilled" && ks_result.value.data) {
        set_keyserver_published(ks_result.value.data.published);
      }
    } finally {
      set_key_loading(false);
    }
  }, []);

  useEffect(() => {
    load_crypto_status();
  }, [load_crypto_status]);

  const aster_version_window = (
    window as unknown as {
      __aster_version?: {
        version?: string;
        build?: string;
        ts?: number;
        manifest_ts?: number;
      };
    }
  ).__aster_version;
  const display_version = aster_version_window?.version || __APP_VERSION__;
  const build_hash = aster_version_window?.build || __BUILD_HASH__;
  const loaded_ts = aster_version_window?.ts;
  const format_relative_time = (ts: number): string => {
    const delta_ms = Date.now() - ts;
    const seconds = Math.max(0, Math.floor(delta_ms / 1000));

    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);

    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);

    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);

    return `${days}d ago`;
  };
  const loaded_ago_text = loaded_ts ? format_relative_time(loaded_ts) : null;
  const total_emails = stats.inbox + stats.sent + stats.archived + stats.trash;
  const custom_folders = folders_hook.state.folders.filter(
    (f) => !f.is_system,
  ).length;
  const storage_used = format_bytes(stats.storage_used_bytes);
  const storage_total = format_bytes(stats.storage_total_bytes);
  const vault = get_vault_from_memory();
  const has_passphrase = has_passphrase_in_memory();

  const copy_to_clipboard = (text: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        show_toast(t("common.copied_to_clipboard"));
      })
      .catch(() => {});
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

  const handle_unregister_sw = async () => {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();

      await Promise.all(registrations.map((r) => r.unregister()));
      set_sw_status("Unregistered");
    }
  };

  const export_debug_info = () => {
    const debug_data = {
      timestamp: new Date().toISOString(),
      app: {
        version: __APP_VERSION__,
        build: build_hash,
        environment: import.meta.env.MODE,
      },
      user: {
        id_prefix: user?.id?.slice(0, 8) || null,
      },
      crypto: {
        vault_loaded: !!vault,
        passphrase_cached: has_passphrase,
        key_age_hours: key_status?.key_age_hours ?? null,
        key_fingerprint: key_status?.key_fingerprint ?? null,
        wkd_published: wkd_published,
        keyserver_published: keyserver_published,
        algorithms: {
          encryption: "AES-256-GCM",
          key_exchange: "KEM-768",
          signatures: "PGP RSA-4096",
          password_hash: "Argon2id",
        },
      },
      network: {
        online: is_online,
        connection: get_connection_type(),
        speed: get_connection_speed(),
        latency: get_connection_latency(),
      },
      performance: {
        memory: get_memory_usage(),
        page_load: get_page_load_time(),
        dom_ready: get_dom_content_loaded(),
        session_duration: session_duration,
      },
      storage: {
        local_storage: get_local_storage_size(),
        local_storage_keys: count_local_storage_keys(),
        session_storage_keys: Object.keys(sessionStorage).length,
        indexed_db: idb_info,
      },
      mail: {
        total_emails,
        inbox: stats.inbox,
        sent: stats.sent,
        archived: stats.archived,
        trash: stats.trash,
        unread: stats.unread,
        drafts: stats.drafts,
        custom_folders,
        storage_used: storage_used,
        storage_total: storage_total,
      },
      display: {
        screen: get_screen_info(),
        viewport: get_viewport_info(),
        user_agent: navigator.userAgent,
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

  const format_key_age = (hours: number | null): string => {
    if (hours === null) return "Unknown";
    if (hours < 1) return "< 1 hour";
    if (hours < 24) return `${Math.round(hours)}h`;
    const days = Math.floor(hours / 24);

    return `${days}d ${Math.round(hours % 24)}h`;
  };

  const dev_row = (label: string, value: string, copyable?: boolean) => (
    <div className="flex justify-between items-center">
      <span className="text-[13px] text-txt-secondary">{label}</span>
      <span
        className={`text-[13px] font-mono tabular-nums ${copyable ? "cursor-pointer hover:opacity-70" : ""} text-txt-primary`}
        role={copyable ? "button" : undefined}
        tabIndex={copyable ? 0 : undefined}
        onClick={copyable ? () => copy_to_clipboard(value) : undefined}
        onKeyDown={
          copyable
            ? (e) => {
                if (e["key"] === "Enter" || e["key"] === " ") {
                  e.preventDefault();
                  copy_to_clipboard(value);
                }
              }
            : undefined
        }
      >
        {value}
      </span>
    </div>
  );

  const status_dot = (ok: boolean | null) => {
    if (ok === null) return "var(--text-muted)";

    return ok ? "var(--color-success)" : "var(--color-danger)";
  };

  const dev_row_with_status = (
    label: string,
    value: string,
    ok: boolean | null,
  ) => (
    <div className="flex justify-between items-center">
      <span className="text-[13px] text-txt-secondary">{label}</span>
      <div className="flex items-center gap-2">
        <span
          className="w-2 h-2 rounded-full inline-block"
          style={{ backgroundColor: status_dot(ok) }}
        />
        <span className="text-[13px] font-mono tabular-nums text-txt-primary">
          {value}
        </span>
      </div>
    </div>
  );

  const section_header = (
    title: string,
    Icon: React.ComponentType<{ className?: string }>,
  ) => (
    <div className="mb-4">
      <h3 className="flex items-center gap-2 text-base font-semibold text-txt-primary">
        <Icon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
        {title}
      </h3>
      <div className="mt-2 h-px bg-edge-secondary" />
    </div>
  );

  const section_box = (children: React.ReactNode) => (
    <div className="rounded-lg p-4 space-y-2 bg-surf-tertiary">{children}</div>
  );

  return (
    <div className="space-y-4">
      <div>
        {section_header(t("settings.build_info"), InformationCircleIcon)}
        <div className="rounded-lg p-4 bg-surf-tertiary">
          <div className="grid grid-cols-2 gap-y-3 gap-x-6">
            <div>
              <p className="text-[11px] text-txt-muted">
                {t("settings.release")}
              </p>
              <p className="text-[13px] font-mono text-txt-primary">
                {display_version} Aurora
              </p>
            </div>
            <div>
              <p className="text-[11px] text-txt-muted">
                {t("settings.build")}
              </p>
              <button
                className="text-[13px] font-mono cursor-pointer hover:opacity-70 text-txt-primary text-left"
                type="button"
                onClick={() => copy_to_clipboard(build_hash)}
              >
                {build_hash}
              </button>
              {loaded_ago_text && (
                <p className="text-[11px] text-txt-muted">
                  loaded {loaded_ago_text}
                </p>
              )}
            </div>
            <div>
              <p className="text-[11px] text-txt-muted">
                {t("settings.environment")}
              </p>
              <p className="text-[13px] font-mono text-txt-primary">
                {import.meta.env.MODE}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-txt-muted">
                {t("settings.platform")}
              </p>
              <p className="text-[13px] font-mono text-txt-primary">
                {navigator.platform.split(" ")[0]}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div>
        {section_header(t("settings.crypto_status"), LockClosedIcon)}
        {key_loading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner className="text-txt-muted" size="md" />
          </div>
        ) : (
          section_box(
            <>
              {dev_row_with_status(
                t("settings.vault"),
                vault ? t("settings.loaded") : t("settings.not_loaded"),
                !!vault,
              )}
              {dev_row_with_status(
                t("settings.passphrase"),
                has_passphrase
                  ? t("settings.cached")
                  : t("settings.not_cached"),
                has_passphrase,
              )}
              {dev_row(
                t("settings.key_age"),
                format_key_age(key_status?.key_age_hours ?? null),
              )}
              {dev_row(
                t("settings.fingerprint"),
                key_status?.key_fingerprint?.slice(0, 16) || "None",
                !!key_status?.key_fingerprint,
              )}
              {dev_row_with_status(
                t("settings.wkd"),
                wkd_published
                  ? t("settings.published")
                  : t("settings.not_published"),
                wkd_published,
              )}
              {dev_row_with_status(
                t("settings.keyserver"),
                keyserver_published
                  ? t("settings.published")
                  : t("settings.not_published"),
                keyserver_published,
              )}
              <div className="border-t pt-2 mt-2 border-edge-secondary">
                {dev_row("Encryption", "AES-256-GCM")}
                {dev_row("Key Exchange", "KEM-768")}
                {dev_row("Signatures", "PGP RSA-4096")}
                {dev_row("Password KDF", "Argon2id")}
              </div>
            </>,
          )
        )}
      </div>

      <div>
        {section_header(t("settings.session_account"), UserIcon)}
        {section_box(
          <>
            {dev_row(
              t("settings.user_id"),
              user?.id?.slice(0, 8) || "\u2014",
              true,
            )}
            {dev_row(t("settings.session_duration"), session_duration)}
            {dev_row(
              t("settings.user_agent"),
              navigator.userAgent.slice(0, 40) + "...",
              true,
            )}
          </>,
        )}
      </div>

      <div>
        {section_header(t("settings.email_statistics"), ChartBarIcon)}
        {section_box(
          <>
            {dev_row(t("settings.total_emails"), total_emails.toLocaleString())}
            {dev_row(t("mail.inbox"), stats.inbox.toLocaleString())}
            {dev_row(t("mail.sent"), stats.sent.toLocaleString())}
            {dev_row(t("mail.unread"), stats.unread.toLocaleString())}
            {dev_row(t("mail.drafts"), stats.drafts.toLocaleString())}
            {dev_row(t("settings.archived"), stats.archived.toLocaleString())}
            {dev_row(t("mail.trash"), stats.trash.toLocaleString())}
            {dev_row(t("settings.custom_folders"), custom_folders.toString())}
            {dev_row(
              t("settings.storage"),
              `${storage_used} / ${storage_total}`,
            )}
          </>,
        )}
      </div>

      <div>
        {section_header(t("settings.performance"), BoltIcon)}
        {section_box(
          <>
            {dev_row(t("settings.page_load"), get_page_load_time())}
            {dev_row(t("settings.dom_ready"), get_dom_content_loaded())}
            {dev_row(t("settings.js_heap"), get_memory_usage())}
            {dev_row(t("settings.screen"), get_screen_info())}
            {dev_row(t("settings.viewport"), get_viewport_info())}
          </>,
        )}
      </div>

      <div>
        {section_header(t("settings.network"), GlobeAltIcon)}
        {section_box(
          <>
            {dev_row_with_status(
              t("settings.status"),
              is_online ? t("settings.online") : t("common.offline"),
              is_online,
            )}
            {dev_row(t("settings.connection"), get_connection_type())}
            {dev_row(t("settings.speed"), get_connection_speed())}
            {dev_row(t("settings.latency"), get_connection_latency())}
          </>,
        )}
      </div>

      <div>
        {section_header(t("settings.storage"), CircleStackIcon)}
        {section_box(
          <>
            {dev_row(t("settings.service_worker"), sw_status)}
            {dev_row(
              t("settings.local_storage"),
              `${get_local_storage_size()} (${count_local_storage_keys()} keys)`,
            )}
            {dev_row(
              t("settings.session_storage"),
              `${Object.keys(sessionStorage).length} keys`,
            )}
            {dev_row(t("settings.indexed_db"), idb_info)}
          </>,
        )}
      </div>

      <div>
        {section_header(t("settings.actions"), WrenchScrewdriverIcon)}
        <div className="rounded-lg p-4 space-y-2 bg-surf-tertiary">
          <Button
            className="w-full"
            variant="secondary"
            onClick={export_debug_info}
          >
            {t("settings.export_debug_report")}
          </Button>
          <Button
            className="w-full"
            variant="secondary"
            onClick={() => load_crypto_status()}
          >
            {t("settings.refresh_crypto_status")}
          </Button>
          <Button
            className="w-full"
            variant="secondary"
            onClick={() => window.location.reload()}
          >
            {t("settings.force_reload")}
          </Button>
          <Button
            className="w-full"
            variant="secondary"
            onClick={handle_unregister_sw}
          >
            {t("settings.unregister_service_workers")}
          </Button>
          <Button
            className="w-full"
            variant="destructive"
            onClick={handle_clear_cache}
          >
            {t("settings.clear_cache_reload")}
          </Button>
        </div>
      </div>
    </div>
  );
}
