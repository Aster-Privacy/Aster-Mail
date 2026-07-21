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
import { useState, useEffect, useCallback, useMemo } from "react";

import { use_i18n } from "@/lib/i18n/context";
import { use_plan_limits } from "@/hooks/use_plan_limits";
import { show_toast } from "@/components/toast/simple_toast";
import { emit_aliases_changed } from "@/hooks/mail_events";
import {
  list_all_aliases,
  update_alias,
  delete_alias,
  decrypt_aliases,
  get_alias_counts,
  toggle_alias_pin,
  type DecryptedEmailAlias,
  type AliasCountsResponse,
} from "@/services/api/aliases";
import {
  has_passphrase_in_memory,
  get_derived_encryption_key,
} from "@/services/crypto/memory_key_store";
import {
  list_domains,
  delete_domain,
  get_dns_records,
  list_domain_addresses,
  delete_domain_address,
  decrypt_domain_addresses,
  type CustomDomain,
  type DecryptedDomainAddress,
  type DnsRecord,
  type DnsRecordsResponse,
  type AddDomainResponse,
} from "@/services/api/domains";

const DEFAULT_DOMAINS = ["astermail.org", "aster.cx"];

interface AliasesCache {
  aliases: DecryptedEmailAlias[];
  domain_addresses: (DecryptedDomainAddress & { domain_name: string })[];
  alias_counts: AliasCountsResponse | null;
  domains: CustomDomain[];
  max_aliases: number;
  max_domains: number;
  loaded: boolean;
}

const aliases_cache: AliasesCache = {
  aliases: [],
  domain_addresses: [],
  alias_counts: null,
  domains: [],
  max_aliases: 3,
  max_domains: 0,
  loaded: false,
};

let aliases_cache_token = 0;

export function get_aliases_cache_token(): number {
  return aliases_cache_token;
}

export function clear_aliases_cache(): void {
  aliases_cache_token += 1;
  aliases_cache.aliases = [];
  aliases_cache.domain_addresses = [];
  aliases_cache.alias_counts = null;
  aliases_cache.domains = [];
  aliases_cache.max_aliases = 3;
  aliases_cache.max_domains = 0;
  aliases_cache.loaded = false;
}

export function get_cached_aliases(): DecryptedEmailAlias[] {
  return aliases_cache.aliases;
}

export function get_cached_domain_addresses(): (DecryptedDomainAddress & {
  domain_name: string;
})[] {
  return aliases_cache.domain_addresses;
}

let ensure_loaded_promise: Promise<void> | null = null;

export async function ensure_aliases_and_domains_loaded(): Promise<void> {
  if (aliases_cache.loaded) return;
  if (ensure_loaded_promise) return ensure_loaded_promise;
  if (!has_passphrase_in_memory() || !get_derived_encryption_key()) return;

  const token = aliases_cache_token;

  ensure_loaded_promise = (async () => {
    try {
      const { aliases: raw, max_aliases, error } = await list_all_aliases();

      if (token !== aliases_cache_token) return;

      if (!error) {
        const decrypted = await decrypt_aliases(raw);

        if (token !== aliases_cache_token) return;

        aliases_cache.aliases = decrypted;
        aliases_cache.max_aliases = max_aliases;
        aliases_cache.loaded = true;
        aliases_cache.alias_counts = {
          count: decrypted.length,
          max: max_aliases,
          can_create: max_aliases === -1 || decrypted.length < max_aliases,
        };
      }

      const domains_response = await list_domains();

      if (token !== aliases_cache_token) return;

      if (!domains_response.data) return;

      const active = domains_response.data.domains.filter(
        (d) => d.status === "active",
      );

      aliases_cache.domains = domains_response.data.domains;
      aliases_cache.max_domains = domains_response.data.max_domains;

      if (active.length === 0) {
        aliases_cache.domain_addresses = [];

        return;
      }

      const responses = await Promise.all(
        active.map((d) => list_domain_addresses(d.id)),
      );

      if (token !== aliases_cache_token) return;

      const all_addresses: (DecryptedDomainAddress & {
        domain_name: string;
      })[] = [];

      for (let i = 0; i < active.length; i++) {
        const response = responses[i];

        if (response.data) {
          const decrypted = await decrypt_domain_addresses(
            response.data.addresses,
          );

          if (token !== aliases_cache_token) return;

          for (const addr of decrypted) {
            all_addresses.push({ ...addr, domain_name: active[i].domain_name });
          }
        }
      }

      if (token !== aliases_cache_token) return;

      aliases_cache.domain_addresses = all_addresses;
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
    } finally {
      ensure_loaded_promise = null;
    }
  })();

  return ensure_loaded_promise;
}

export { DEFAULT_DOMAINS };

export function use_aliases() {
  const { t } = use_i18n();
  const { limits } = use_plan_limits();
  const is_free_plan = useMemo(
    () => !!limits && limits.plan_code.toLowerCase() === "free",
    [limits],
  );
  const [aliases, set_aliases] = useState<DecryptedEmailAlias[]>(
    aliases_cache.aliases,
  );
  const [aliases_loading, set_aliases_loading] = useState(
    !aliases_cache.loaded,
  );
  const [max_aliases, set_max_aliases] = useState(aliases_cache.max_aliases);
  const [show_create_alias_modal, set_show_create_alias_modal] =
    useState(false);
  const [show_upgrade_modal, set_show_upgrade_modal] = useState(false);
  const [toggling_id, set_toggling_id] = useState<string | null>(null);
  const [alias_deleting_id, set_alias_deleting_id] = useState<string | null>(
    null,
  );
  const [alias_delete_confirm, set_alias_delete_confirm] = useState<{
    is_open: boolean;
    id: string | null;
  }>({ is_open: false, id: null });

  const [alias_too_new_info, set_alias_too_new_info] = useState<{
    is_open: boolean;
    eligible_date: string | null;
  }>({ is_open: false, eligible_date: null });

  const [alias_counts, set_alias_counts] = useState<AliasCountsResponse | null>(
    aliases_cache.alias_counts,
  );

  const [domain_addresses, set_domain_addresses] = useState<
    (DecryptedDomainAddress & { domain_name: string })[]
  >(aliases_cache.domain_addresses);
  const [domain_addr_deleting_id, set_domain_addr_deleting_id] = useState<
    string | null
  >(null);
  const [domain_addr_delete_confirm, set_domain_addr_delete_confirm] =
    useState<{
      is_open: boolean;
      id: string | null;
      domain_id: string | null;
    }>({ is_open: false, id: null, domain_id: null });

  const [domains, set_domains] = useState<CustomDomain[]>(
    aliases_cache.domains,
  );
  const [domains_loading, set_domains_loading] = useState(
    !aliases_cache.loaded,
  );
  const [max_domains, set_max_domains] = useState(aliases_cache.max_domains);
  const [wizard_open, set_wizard_open] = useState(false);
  const [wizard_mode, set_wizard_mode] = useState<"input" | "dns">("input");
  const [wizard_domain_id, set_wizard_domain_id] = useState<string | null>(
    null,
  );
  const [wizard_domain_name, set_wizard_domain_name] = useState("");
  const [wizard_dns_records, set_wizard_dns_records] = useState<DnsRecord[]>(
    [],
  );
  const [domain_deleting_id, set_domain_deleting_id] = useState<string | null>(
    null,
  );
  const [domain_delete_confirm, set_domain_delete_confirm] = useState<{
    is_open: boolean;
    id: string | null;
  }>({ is_open: false, id: null });

  const available_domains_for_aliases = useMemo(
    () => [
      ...DEFAULT_DOMAINS,
      ...domains.filter((d) => d.status === "active").map((d) => d.domain_name),
    ],
    [domains],
  );

  const custom_domains_for_import = useMemo(
    () => domains
      .filter((d) => d.status === "active")
      .map((d) => ({ name: d.domain_name, id: d.id })),
    [domains],
  );

  const load_aliases = useCallback(async () => {
    if (!has_passphrase_in_memory() || !get_derived_encryption_key()) {
      set_aliases_loading(false);

      return;
    }

    const token = aliases_cache_token;

    if (!aliases_cache.loaded) {
      set_aliases_loading(true);
    }

    try {
      const { aliases: raw, max_aliases, error } = await list_all_aliases();

      if (token !== aliases_cache_token) return;

      if (!error) {
        set_max_aliases(max_aliases);
        aliases_cache.max_aliases = max_aliases;

        const decrypted = await decrypt_aliases(raw);

        if (token !== aliases_cache_token) return;

        set_aliases(decrypted);
        aliases_cache.aliases = decrypted;
        aliases_cache.loaded = true;

        const derived_counts: AliasCountsResponse = {
          count: decrypted.length,
          max: max_aliases,
          can_create: max_aliases === -1 || decrypted.length < max_aliases,
        };

        set_alias_counts(derived_counts);
        aliases_cache.alias_counts = derived_counts;
      }
    } catch (error) {
      if (token === aliases_cache_token) {
        show_toast(t("settings.aliases_load_failed"), "error");
      }
      if (import.meta.env.DEV) console.error(error);
    } finally {
      if (token === aliases_cache_token) set_aliases_loading(false);
    }
  }, []);

  const load_alias_counts = useCallback(async () => {
    const token = aliases_cache_token;

    try {
      const response = await get_alias_counts();

      if (
        token === aliases_cache_token &&
        response.data &&
        typeof response.data.max === "number"
      ) {
        set_alias_counts(response.data);
        aliases_cache.alias_counts = response.data;
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
    }
  }, []);

  const load_domains = useCallback(async () => {
    const token = aliases_cache_token;

    if (!aliases_cache.loaded) {
      set_domains_loading(true);
    }

    try {
      const response = await list_domains();

      if (token !== aliases_cache_token) return;

      if (response.data) {
        set_domains(response.data.domains);
        set_max_domains(response.data.max_domains);
        aliases_cache.domains = response.data.domains;
        aliases_cache.max_domains = response.data.max_domains;
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
    } finally {
      if (token === aliases_cache_token) set_domains_loading(false);
    }
  }, []);

  const load_domain_addresses = useCallback(
    async (domain_list: CustomDomain[]) => {
      const token = aliases_cache_token;
      const active = domain_list.filter((d) => d.status === "active");

      if (active.length === 0) {
        if (token === aliases_cache_token) {
          set_domain_addresses([]);
          aliases_cache.domain_addresses = [];
        }

        return;
      }

      try {
        const responses = await Promise.all(
          active.map((d) => list_domain_addresses(d.id)),
        );

        if (token !== aliases_cache_token) return;

        const all_addresses: (DecryptedDomainAddress & {
          domain_name: string;
        })[] = [];

        for (let i = 0; i < active.length; i++) {
          const response = responses[i];

          if (response.data) {
            const decrypted = await decrypt_domain_addresses(
              response.data.addresses,
            );

            if (token !== aliases_cache_token) return;

            for (const addr of decrypted) {
              all_addresses.push({
                ...addr,
                domain_name: active[i].domain_name,
              });
            }
          }
        }

        if (token !== aliases_cache_token) return;

        set_domain_addresses(all_addresses);
        aliases_cache.domain_addresses = all_addresses;
      } catch (error) {
        if (import.meta.env.DEV) console.error(error);
        if (token === aliases_cache_token) {
          set_domain_addresses([]);
          aliases_cache.domain_addresses = [];
        }
      }
    },
    [],
  );

  useEffect(() => {
    load_aliases();
    load_domains();
    load_alias_counts();
  }, [load_aliases, load_domains, load_alias_counts]);

  useEffect(() => {
    if (domains.length > 0) {
      load_domain_addresses(domains);
    }
  }, [domains, load_domain_addresses]);

  const handle_alias_toggle = async (id: string, enabled: boolean) => {
    set_toggling_id(id);
    set_aliases((prev) => {
      const updated = prev.map((a) =>
        a.id === id ? { ...a, is_enabled: enabled } : a,
      );
      aliases_cache.aliases = updated;
      return updated;
    });
    try {
      const response = await update_alias(id, { is_enabled: enabled });

      if (response.error) {
        set_aliases((prev) => {
          const reverted = prev.map((a) =>
            a.id === id ? { ...a, is_enabled: !enabled } : a,
          );
          aliases_cache.aliases = reverted;
          return reverted;
        });
        show_toast(response.error || t("settings.alias_toggle_failed"), "error");
      } else {
        show_toast(
          enabled
            ? t("settings.alias_enabled_toast")
            : t("settings.alias_disabled_toast"),
          "success",
        );
      }
    } catch (error) {
      set_aliases((prev) => {
        const reverted = prev.map((a) =>
          a.id === id ? { ...a, is_enabled: !enabled } : a,
        );
        aliases_cache.aliases = reverted;
        return reverted;
      });
      show_toast(t("settings.alias_toggle_failed"), "error");
      if (import.meta.env.DEV) console.error(error);
    } finally {
      set_toggling_id(null);
    }
  };

  const handle_pin_toggle = async (id: string) => {
    const target = aliases.find((a) => a.id === id);
    if (!target) return;
    const next_pinned = !target.is_pinned;

    set_aliases((prev) => {
      const updated = prev.map((a) =>
        a.id === id ? { ...a, is_pinned: next_pinned } : a,
      );
      aliases_cache.aliases = updated;
      return updated;
    });

    try {
      const response = await toggle_alias_pin(id);

      if (response.error) {
        set_aliases((prev) => {
          const reverted = prev.map((a) =>
            a.id === id ? { ...a, is_pinned: !next_pinned } : a,
          );
          aliases_cache.aliases = reverted;
          return reverted;
        });
        show_toast(response.error, "error");
      } else {
        show_toast(
          response.data?.is_pinned
            ? t("settings.alias_pinned_toast")
            : t("settings.alias_unpinned_toast"),
          "success",
        );
      }
    } catch (error) {
      set_aliases((prev) => {
        const reverted = prev.map((a) =>
          a.id === id ? { ...a, is_pinned: !next_pinned } : a,
        );
        aliases_cache.aliases = reverted;
        return reverted;
      });
      if (import.meta.env.DEV) console.error(error);
    }
  };

  const handle_alias_delete = (id: string) => {
    const alias = aliases.find((a) => a.id === id);

    if (alias && is_free_plan && !alias.decryption_failed) {
      const created = new Date(alias.created_at);
      const eligible = new Date(created.getTime() + 30 * 24 * 60 * 60 * 1000);

      if (new Date() < eligible) {
        set_alias_too_new_info({
          is_open: true,
          eligible_date: eligible.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          }),
        });

        return;
      }
    }
    set_alias_delete_confirm({ is_open: true, id });
  };

  const confirm_alias_delete = async () => {
    const id = alias_delete_confirm.id;

    if (!id) return;
    const deleted_alias = aliases.find((a) => a.id === id);

    set_alias_delete_confirm({ is_open: false, id: null });
    set_alias_deleting_id(id);
    try {
      const response = await delete_alias(id);

      if (!response.error) {
        set_aliases((prev) => {
          const updated = prev.filter((a) => a.id !== id);

          aliases_cache.aliases = updated;

          return updated;
        });
        load_alias_counts();
        emit_aliases_changed();

        if (
          deleted_alias?.full_address &&
          window.location.pathname ===
            `/alias/${encodeURIComponent(deleted_alias.full_address)}`
        ) {
          window.dispatchEvent(
            new CustomEvent("astermail:navigate", { detail: "/" }),
          );
        }
      } else {
        show_toast(response.error || t("settings.alias_delete_failed"), "error");
      }
    } catch (error) {
      show_toast(t("settings.alias_delete_failed"), "error");
      if (import.meta.env.DEV) console.error(error);
    } finally {
      set_alias_deleting_id(null);
    }
  };

  const handle_domain_addr_delete = (id: string, domain_id: string) => {
    const addr = domain_addresses.find((a) => a.id === id);

    if (addr) {
      const created = new Date(addr.created_at);
      const eligible = new Date(created.getTime() + 30 * 24 * 60 * 60 * 1000);

      if (new Date() < eligible) {
        set_alias_too_new_info({
          is_open: true,
          eligible_date: eligible.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          }),
        });

        return;
      }
    }
    set_domain_addr_delete_confirm({ is_open: true, id, domain_id });
  };

  const confirm_domain_addr_delete = async () => {
    const { id, domain_id } = domain_addr_delete_confirm;

    if (!id || !domain_id) return;
    set_domain_addr_delete_confirm({
      is_open: false,
      id: null,
      domain_id: null,
    });
    set_domain_addr_deleting_id(id);
    try {
      const response = await delete_domain_address(domain_id, id);

      if (!response.error) {
        set_domain_addresses((prev) => {
          const updated = prev.filter((a) => a.id !== id);

          aliases_cache.domain_addresses = updated;

          return updated;
        });
        emit_aliases_changed();
      } else {
        show_toast(
          response.error || t("settings.domain_address_delete_failed"),
          "error",
        );
      }
    } catch (error) {
      show_toast(t("settings.domain_address_delete_failed"), "error");
      if (import.meta.env.DEV) console.error(error);
    } finally {
      set_domain_addr_deleting_id(null);
    }
  };

  const handle_open_add_domain = () => {
    set_wizard_mode("input");
    set_wizard_domain_id(null);
    set_wizard_domain_name("");
    set_wizard_dns_records([]);
    set_wizard_open(true);
  };

  const handle_domain_added = (response: AddDomainResponse) => {
    const new_domain_entry: CustomDomain = {
      id: response.id,
      domain_name: response.domain_name,
      status: "pending",
      txt_verified: false,
      mx_verified: false,
      spf_verified: false,
      dkim_verified: false,
      dmarc_configured: false,
      catch_all_enabled: false,
      is_primary: false,
      health_status: "unknown",
      verification_token: response.verification_token,
      created_at: response.created_at,
    };

    set_domains((prev) => [new_domain_entry, ...prev]);
    set_wizard_domain_id(response.id);
    set_wizard_domain_name(response.domain_name);
    set_wizard_dns_records(response.dns_records);
    set_wizard_mode("dns");
  };

  const handle_open_setup = async (domain: CustomDomain) => {
    set_wizard_domain_id(domain.id);
    set_wizard_domain_name(domain.domain_name);
    set_wizard_mode("dns");
    set_wizard_open(true);

    const response = await get_dns_records(domain.id);

    if (response.data) {
      set_wizard_dns_records((response.data as DnsRecordsResponse).records);
    }
  };

  const handle_wizard_close = () => {
    set_wizard_open(false);
    load_domains();
  };

  const handle_display_name_saved = (alias_id: string, name: string) => {
    set_aliases((prev) => {
      const updated = prev.map((a) =>
        a.id === alias_id ? { ...a, display_name: name || undefined } : a,
      );

      aliases_cache.aliases = updated;

      return updated;
    });
  };

  const handle_note_saved = (alias_id: string, note: string) => {
    set_aliases((prev) => {
      const updated = prev.map((a) =>
        a.id === alias_id ? { ...a, note: note || undefined } : a,
      );

      aliases_cache.aliases = updated;

      return updated;
    });
  };

  const handle_websites_saved = (alias_id: string, websites: string[]) => {
    set_aliases((prev) => {
      const updated = prev.map((a) =>
        a.id === alias_id
          ? { ...a, websites: websites.length > 0 ? websites : undefined }
          : a,
      );

      aliases_cache.aliases = updated;

      return updated;
    });
  };

  const handle_domain_address_display_name_saved = (
    address_id: string,
    name: string,
  ) => {
    set_domain_addresses((prev) => {
      const updated = prev.map((a) =>
        a.id === address_id ? { ...a, display_name: name || undefined } : a,
      );

      aliases_cache.domain_addresses = updated;

      return updated;
    });
  };

  const handle_domain_delete = (id: string) => {
    set_domain_delete_confirm({ is_open: true, id });
  };

  const confirm_domain_delete = async () => {
    const id = domain_delete_confirm.id;

    if (!id) return;
    set_domain_delete_confirm({ is_open: false, id: null });
    set_domain_deleting_id(id);
    try {
      const response = await delete_domain(id);

      if (!response.error) {
        set_domains((prev) => {
          const updated = prev.filter((d) => d.id !== id);

          aliases_cache.domains = updated;

          return updated;
        });
        set_domain_addresses((prev) => {
          const updated = prev.filter((a) => a.domain_id !== id);

          aliases_cache.domain_addresses = updated;

          return updated;
        });
      } else {
        show_toast(response.error || t("settings.domain_delete_failed"), "error");
      }
    } catch (error) {
      show_toast(t("settings.domain_delete_failed"), "error");
      if (import.meta.env.DEV) console.error(error);
    } finally {
      set_domain_deleting_id(null);
    }
  };

  return {
    aliases,
    aliases_loading,
    max_aliases,
    show_create_alias_modal,
    set_show_create_alias_modal,
    show_upgrade_modal,
    set_show_upgrade_modal,
    toggling_id,
    alias_deleting_id,
    alias_delete_confirm,
    set_alias_delete_confirm,
    alias_too_new_info,
    set_alias_too_new_info,
    alias_counts,
    domain_addresses,
    domain_addr_deleting_id,
    domain_addr_delete_confirm,
    set_domain_addr_delete_confirm,
    domains,
    domains_loading,
    max_domains,
    wizard_open,
    wizard_mode,
    wizard_domain_id,
    wizard_domain_name,
    wizard_dns_records,
    domain_deleting_id,
    domain_delete_confirm,
    set_domain_delete_confirm,
    available_domains_for_aliases,
    custom_domains_for_import,
    load_aliases,
    load_alias_counts,
    load_domain_addresses,
    load_domains,
    handle_alias_toggle,
    handle_pin_toggle,
    handle_alias_delete,
    confirm_alias_delete,
    handle_domain_addr_delete,
    confirm_domain_addr_delete,
    handle_open_add_domain,
    handle_domain_added,
    handle_open_setup,
    handle_wizard_close,
    handle_display_name_saved,
    handle_note_saved,
    handle_websites_saved,
    handle_domain_address_display_name_saved,
    handle_domain_delete,
    confirm_domain_delete,
  };
}
