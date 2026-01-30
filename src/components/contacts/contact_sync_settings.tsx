import type { DecryptedSyncSource, CardDAVConfig } from "@/types/contacts";

import { useState, useCallback, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CloudArrowUpIcon,
  CloudArrowDownIcon,
  PlusIcon,
  TrashIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  ServerIcon,
  EyeIcon,
  EyeSlashIcon,
} from "@heroicons/react/24/outline";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  list_sync_sources,
  add_carddav_sync_source,
  delete_sync_source,
  toggle_sync_source,
  trigger_sync,
} from "@/services/api/contact_sync";

interface ContactSyncSettingsProps {
  on_sync_complete?: () => void;
}

function format_date(date_string?: string): string {
  if (!date_string) return "Never";
  const date = new Date(date_string);
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function get_status_icon(status?: string) {
  switch (status) {
    case "success":
      return <CheckCircleIcon className="w-4 h-4 text-success" />;
    case "failed":
      return <XCircleIcon className="w-4 h-4 text-danger" />;
    case "in_progress":
      return (
        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      );
    default:
      return null;
  }
}

export function ContactSyncSettings({
  on_sync_complete,
}: ContactSyncSettingsProps) {
  const [sources, set_sources] = useState<DecryptedSyncSource[]>([]);
  const [is_loading, set_is_loading] = useState(true);
  const [show_add_form, set_show_add_form] = useState(false);
  const [new_source, set_new_source] = useState<CardDAVConfig>({
    server_url: "",
    username: "",
    password: "",
    display_name: "",
  });
  const [show_password, set_show_password] = useState(false);
  const [is_adding, set_is_adding] = useState(false);
  const [syncing_id, set_syncing_id] = useState<string | null>(null);
  const [deleting_id, set_deleting_id] = useState<string | null>(null);
  const [toggling_id, set_toggling_id] = useState<string | null>(null);
  const [error, set_error] = useState<string | null>(null);

  const load_sources = useCallback(async () => {
    set_is_loading(true);
    set_error(null);

    try {
      const response = await list_sync_sources();

      if (response.error || !response.data) {
        set_error(response.error || "Failed to load sync sources");
        return;
      }

      set_sources(response.data);
    } catch (err) {
      set_error(err instanceof Error ? err.message : "Failed to load sources");
    } finally {
      set_is_loading(false);
    }
  }, []);

  useEffect(() => {
    load_sources();
  }, [load_sources]);

  const handle_add_source = useCallback(async () => {
    if (!new_source.server_url || !new_source.username || !new_source.password) {
      set_error("Please fill in all required fields");
      return;
    }

    set_is_adding(true);
    set_error(null);

    try {
      const response = await add_carddav_sync_source(new_source);

      if (response.error || !response.data) {
        set_error(response.error || "Failed to add sync source");
        return;
      }

      set_sources((prev) => [...prev, response.data!]);
      set_new_source({
        server_url: "",
        username: "",
        password: "",
        display_name: "",
      });
      set_show_add_form(false);
    } catch (err) {
      set_error(err instanceof Error ? err.message : "Failed to add source");
    } finally {
      set_is_adding(false);
    }
  }, [new_source]);

  const handle_delete_source = useCallback(async (source_id: string) => {
    set_deleting_id(source_id);
    set_error(null);

    try {
      const response = await delete_sync_source(source_id);

      if (response.error) {
        set_error(response.error);
        return;
      }

      set_sources((prev) => prev.filter((s) => s.id !== source_id));
    } catch (err) {
      set_error(err instanceof Error ? err.message : "Failed to delete source");
    } finally {
      set_deleting_id(null);
    }
  }, []);

  const handle_toggle_source = useCallback(async (source_id: string) => {
    set_toggling_id(source_id);
    set_error(null);

    try {
      const response = await toggle_sync_source(source_id);

      if (response.error || !response.data) {
        set_error(response.error || "Failed to toggle source");
        return;
      }

      set_sources((prev) =>
        prev.map((s) =>
          s.id === source_id ? { ...s, is_enabled: response.data!.is_enabled } : s,
        ),
      );
    } catch (err) {
      set_error(err instanceof Error ? err.message : "Failed to toggle source");
    } finally {
      set_toggling_id(null);
    }
  }, []);

  const handle_sync = useCallback(
    async (source_id: string) => {
      set_syncing_id(source_id);
      set_error(null);

      try {
        const response = await trigger_sync(source_id);

        if (response.error) {
          set_error(response.error);
          return;
        }

        await load_sources();
        on_sync_complete?.();
      } catch (err) {
        set_error(err instanceof Error ? err.message : "Sync failed");
      } finally {
        set_syncing_id(null);
      }
    },
    [load_sources, on_sync_complete],
  );

  if (is_loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CloudArrowUpIcon className="w-5 h-5 text-foreground-500" />
          <h3 className="text-sm font-medium">Contact Sync</h3>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => set_show_add_form(!show_add_form)}
          className="gap-1.5"
        >
          <PlusIcon className="w-4 h-4" />
          Add CardDAV
        </Button>
      </div>

      <p className="text-xs text-foreground-500">
        Sync contacts with self-hosted CardDAV servers like Nextcloud, Fastmail,
        or your own server. Your credentials are encrypted locally.
      </p>

      <AnimatePresence>
        {show_add_form && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="p-4 rounded-xl border border-divider bg-default-50 space-y-3"
          >
            <div className="flex items-center gap-2 mb-2">
              <ServerIcon className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Add CardDAV Server</span>
            </div>

            <Input
              label="Display Name"
              placeholder="My Nextcloud"
              value={new_source.display_name || ""}
              onChange={(e) =>
                set_new_source((prev) => ({
                  ...prev,
                  display_name: e.target.value,
                }))
              }
            />

            <Input
              label="Server URL"
              placeholder="https://cloud.example.com/remote.php/dav"
              value={new_source.server_url}
              onChange={(e) =>
                set_new_source((prev) => ({
                  ...prev,
                  server_url: e.target.value,
                }))
              }
            />

            <Input
              label="Username"
              placeholder="user@example.com"
              value={new_source.username}
              onChange={(e) =>
                set_new_source((prev) => ({
                  ...prev,
                  username: e.target.value,
                }))
              }
            />

            <div className="relative">
              <Input
                label="Password"
                type={show_password ? "text" : "password"}
                placeholder="App password or regular password"
                value={new_source.password}
                onChange={(e) =>
                  set_new_source((prev) => ({
                    ...prev,
                    password: e.target.value,
                  }))
                }
              />
              <button
                type="button"
                className="absolute right-2 top-8 p-1 text-foreground-400 hover:text-foreground-600"
                onClick={() => set_show_password(!show_password)}
              >
                {show_password ? (
                  <EyeSlashIcon className="w-4 h-4" />
                ) : (
                  <EyeIcon className="w-4 h-4" />
                )}
              </button>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => set_show_add_form(false)}
              >
                Cancel
              </Button>
              <Button
                variant="solid"
                color="primary"
                size="sm"
                onClick={handle_add_source}
                disabled={is_adding}
              >
                {is_adding ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-1" />
                    Adding...
                  </>
                ) : (
                  "Add Server"
                )}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-3 rounded-lg bg-danger/10 text-danger text-sm flex items-center gap-2"
          >
            <ExclamationTriangleIcon className="w-4 h-4" />
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {sources.length === 0 ? (
        <div className="text-center py-8 bg-default-50 rounded-xl">
          <CloudArrowDownIcon className="w-10 h-10 mx-auto text-foreground-300 mb-3" />
          <p className="text-sm text-foreground-500">No sync sources configured</p>
          <p className="text-xs text-foreground-400 mt-1">
            Add a CardDAV server to sync contacts
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {sources.map((source) => (
              <motion.div
                key={source.id}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className={cn(
                  "p-4 rounded-xl border transition-colors",
                  source.is_enabled
                    ? "border-divider bg-background"
                    : "border-divider bg-default-50 opacity-60",
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center",
                        source.is_enabled ? "bg-primary/10" : "bg-default-200",
                      )}
                    >
                      <ServerIcon
                        className={cn(
                          "w-5 h-5",
                          source.is_enabled
                            ? "text-primary"
                            : "text-foreground-400",
                        )}
                      />
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {source.config.display_name ||
                          new URL(source.config.server_url).hostname}
                      </p>
                      <p className="text-xs text-foreground-500">
                        {source.config.username}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handle_toggle_source(source.id)}
                      disabled={toggling_id === source.id}
                      className="p-1.5"
                    >
                      {toggling_id === source.id ? (
                        <div className="w-4 h-4 border-2 border-foreground-500 border-t-transparent rounded-full animate-spin" />
                      ) : source.is_enabled ? (
                        <CheckCircleIcon className="w-4 h-4 text-success" />
                      ) : (
                        <XCircleIcon className="w-4 h-4 text-foreground-400" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handle_sync(source.id)}
                      disabled={syncing_id === source.id || !source.is_enabled}
                      className="p-1.5"
                    >
                      {syncing_id === source.id ? (
                        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <ArrowPathIcon className="w-4 h-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handle_delete_source(source.id)}
                      disabled={deleting_id === source.id}
                      className="p-1.5 text-danger hover:bg-danger/10"
                    >
                      {deleting_id === source.id ? (
                        <div className="w-4 h-4 border-2 border-danger border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <TrashIcon className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="flex items-center gap-4 mt-3 pt-3 border-t border-divider text-xs text-foreground-500">
                  <div className="flex items-center gap-1">
                    {get_status_icon(source.last_sync_status)}
                    <span>Last sync: {format_date(source.last_sync_at)}</span>
                  </div>
                  {source.contacts_synced !== undefined && (
                    <span>{source.contacts_synced} contacts</span>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
