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

import {
  list_aliases,
  update_alias,
  delete_alias,
  decrypt_aliases,
  get_alias_counts,
  type DecryptedEmailAlias,
  type AliasListResponse,
  type AliasCountsResponse,
} from "@/services/api/aliases";
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

export { DEFAULT_DOMAINS };

export function use_aliases() {
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

  const load_aliases = useCallback(async () => {
    if (!aliases_cache.loaded) {
      set_aliases_loading(true);
    }

    try {
      const response = await list_aliases();

      if (response.data) {
        const data = response.data as AliasListResponse;

        set_max_aliases(data.max_aliases);
        aliases_cache.max_aliases = data.max_aliases;

        const decrypted = await decrypt_aliases(data.aliases);

        set_aliases(decrypted);
        aliases_cache.aliases = decrypted;
        aliases_cache.loaded = true;

        const derived_counts: AliasCountsResponse = {
          count: decrypted.length,
          max: data.max_aliases,
          can_create: decrypted.length < data.max_aliases,
        };

        set_alias_counts(derived_counts);
        aliases_cache.alias_counts = derived_counts;
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
    } finally {
      set_aliases_loading(false);
    }
  }, []);

  const load_alias_counts = useCallback(async () => {
    try {
      const response = await get_alias_counts();

      if (response.data && response.data.max !== 0) {
        set_alias_counts(response.data);
        aliases_cache.alias_counts = response.data;
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
    }
  }, []);

  const load_domains = useCallback(async () => {
    if (!aliases_cache.loaded) {
      set_domains_loading(true);
    }

    try {
      const response = await list_domains();

      if (response.data) {
        set_domains(response.data.domains);
        set_max_domains(response.data.max_domains);
        aliases_cache.domains = response.data.domains;
        aliases_cache.max_domains = response.data.max_domains;
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
    } finally {
      set_domains_loading(false);
    }
  }, []);

  const load_domain_addresses = useCallback(
    async (domain_list: CustomDomain[]) => {
      const active = domain_list.filter((d) => d.status === "active");

      if (active.length === 0) {
        set_domain_addresses([]);
        aliases_cache.domain_addresses = [];

        return;
      }

      try {
        const responses = await Promise.all(
          active.map((d) => list_domain_addresses(d.id)),
        );

        const all_addresses: (DecryptedDomainAddress & {
          domain_name: string;
        })[] = [];

        for (let i = 0; i < active.length; i++) {
          const response = responses[i];

          if (response.data) {
            const decrypted = await decrypt_domain_addresses(
              response.data.addresses,
            );

            for (const addr of decrypted) {
              all_addresses.push({
                ...addr,
                domain_name: active[i].domain_name,
              });
            }
          }
        }

        set_domain_addresses(all_addresses);
        aliases_cache.domain_addresses = all_addresses;
      } catch (error) {
        if (import.meta.env.DEV) console.error(error);
        set_domain_addresses([]);
        aliases_cache.domain_addresses = [];
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
    try {
      const response = await update_alias(id, { is_enabled: enabled });

      if (!response.error) {
        set_aliases((prev) => {
          const updated = prev.map((a) =>
            a.id === id ? { ...a, is_enabled: enabled } : a,
          );

          aliases_cache.aliases = updated;

          return updated;
        });
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
    } finally {
      set_toggling_id(null);
    }
  };

  const handle_alias_delete = (id: string) => {
    const alias = aliases.find((a) => a.id === id);

    if (alias) {
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

        if (
          deleted_alias?.full_address &&
          window.location.pathname ===
            `/alias/${encodeURIComponent(deleted_alias.full_address)}`
        ) {
          window.dispatchEvent(
            new CustomEvent("astermail:navigate", { detail: "/" }),
          );
        }
      }
    } catch (error) {
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
      }
    } catch (error) {
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
      }
    } catch (error) {
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
    load_aliases,
    load_alias_counts,
    load_domain_addresses,
    load_domains,
    handle_alias_toggle,
    handle_alias_delete,
    confirm_alias_delete,
    handle_domain_addr_delete,
    confirm_domain_addr_delete,
    handle_open_add_domain,
    handle_domain_added,
    handle_open_setup,
    handle_wizard_close,
    handle_display_name_saved,
    handle_domain_delete,
    confirm_domain_delete,
  };
}
