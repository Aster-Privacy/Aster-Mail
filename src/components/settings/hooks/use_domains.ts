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
import { useState, useEffect, useCallback } from "react";

import {
  list_domains,
  delete_domain,
  update_domain,
  trigger_verification,
  get_dns_records,
  type CustomDomain,
  type DnsRecord,
  type DnsRecordsResponse,
  type VerificationResult,
} from "@/services/api/domains";

export function use_domains() {
  const [domains, set_domains] = useState<CustomDomain[]>([]);
  const [loading, set_loading] = useState(true);
  const [max_domains, set_max_domains] = useState(0);
  const [verifying_id, set_verifying_id] = useState<string | null>(null);
  const [deleting_id, set_deleting_id] = useState<string | null>(null);
  const [delete_confirm, set_delete_confirm] = useState<{
    is_open: boolean;
    id: string | null;
  }>({ is_open: false, id: null });
  const [wizard, set_wizard] = useState<{
    is_open: boolean;
    mode: "create" | "setup";
    domain_name: string;
    domain_id: string;
    records: DnsRecord[];
  }>({
    is_open: false,
    mode: "create",
    domain_name: "",
    domain_id: "",
    records: [],
  });

  const load_domains = useCallback(async () => {
    set_loading(true);
    try {
      const response = await list_domains();

      if (response.data) {
        set_domains(response.data.domains);
        set_max_domains(response.data.max_domains);
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
    } finally {
      set_loading(false);
    }
  }, []);

  useEffect(() => {
    load_domains();
  }, [load_domains]);

  const open_create_wizard = () => {
    set_wizard({
      is_open: true,
      mode: "create",
      domain_name: "",
      domain_id: "",
      records: [],
    });
  };

  const open_setup_wizard = async (domain: CustomDomain) => {
    try {
      const response = await get_dns_records(domain.id);

      if (response.data) {
        set_wizard({
          is_open: true,
          mode: "setup",
          domain_name: domain.domain_name,
          domain_id: domain.id,
          records: (response.data as DnsRecordsResponse).records,
        });
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
    }
  };

  const close_wizard = () => {
    set_wizard({
      is_open: false,
      mode: "create",
      domain_name: "",
      domain_id: "",
      records: [],
    });
  };

  const handle_domain_created = (
    new_domain: CustomDomain,
    _records: DnsRecord[],
  ) => {
    set_domains((prev) => [new_domain, ...prev]);
  };

  const handle_verification_complete = (
    domain_id: string,
    result: VerificationResult,
  ) => {
    set_domains((prev) =>
      prev.map((d) =>
        d.id === domain_id
          ? {
              ...d,
              status: result.status as CustomDomain["status"],
              txt_verified: result.txt_verified,
              mx_verified: result.mx_verified,
              spf_verified: result.spf_verified,
              dkim_verified: result.dkim_verified,
              dmarc_configured: result.dmarc_configured,
            }
          : d,
      ),
    );
  };

  const handle_verify = async (id: string) => {
    set_verifying_id(id);
    try {
      const response = await trigger_verification(id);

      if (!response.error && response.data) {
        set_domains((prev) =>
          prev.map((d) =>
            d.id === id
              ? {
                  ...d,
                  status: response.data!.status as CustomDomain["status"],
                  txt_verified: response.data!.txt_verified,
                  mx_verified: response.data!.mx_verified,
                  spf_verified: response.data!.spf_verified,
                  dkim_verified: response.data!.dkim_verified,
                  dmarc_configured: response.data!.dmarc_configured,
                }
              : d,
          ),
        );
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
    } finally {
      set_verifying_id(null);
    }
  };

  const handle_delete = (id: string) => {
    set_delete_confirm({ is_open: true, id });
  };

  const confirm_delete = async () => {
    const id = delete_confirm.id;

    if (!id) return;
    set_delete_confirm({ is_open: false, id: null });
    set_deleting_id(id);
    try {
      const response = await delete_domain(id);

      if (!response.error) {
        set_domains((prev) => prev.filter((d) => d.id !== id));
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
    } finally {
      set_deleting_id(null);
    }
  };

  const handle_toggle_catch_all = async (id: string, enabled: boolean) => {
    const response = await update_domain(id, { catch_all_enabled: enabled });

    if (response.data) {
      set_domains((prev) =>
        prev.map((d) => (d.id === id ? response.data! : d)),
      );
    }
  };

  return {
    domains,
    loading,
    max_domains,
    verifying_id,
    deleting_id,
    delete_confirm,
    set_delete_confirm,
    wizard,
    open_create_wizard,
    open_setup_wizard,
    close_wizard,
    handle_domain_created,
    handle_verification_complete,
    handle_verify,
    handle_delete,
    confirm_delete,
    handle_toggle_catch_all,
  };
}
