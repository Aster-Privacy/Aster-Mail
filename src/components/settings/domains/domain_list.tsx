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
import type { CustomDomain } from "@/services/api/domains";

import { PlusIcon, GlobeAltIcon } from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { DomainCard } from "@/components/settings/domains/domain_card";

interface DomainListProps {
  domains: CustomDomain[];
  loading: boolean;
  max_domains: number;
  verifying_id: string | null;
  deleting_id: string | null;
  on_add: () => void;
  on_verify: (id: string) => void;
  on_delete: (id: string) => void;
  on_setup: (domain: CustomDomain) => void;
  on_toggle_catch_all: (id: string, enabled: boolean) => void;
}

export function DomainList({
  domains,
  loading,
  max_domains,
  verifying_id,
  deleting_id,
  on_add,
  on_verify,
  on_delete,
  on_setup,
  on_toggle_catch_all,
}: DomainListProps) {
  const { t } = use_i18n();

  if (!loading && max_domains === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold mb-2 text-txt-primary">
            {t("settings.custom_domains_label")}
          </h3>
          <div className="p-6 rounded-lg text-center bg-surf-tertiary border border-edge-secondary">
            <p className="text-sm font-medium mb-1 text-txt-primary">
              {t("settings.custom_domains_not_available")}
            </p>
            <p className="text-sm mb-4 text-txt-muted">
              {t("settings.upgrade_plan_more_domains")}
            </p>
            <Button
              variant="depth"
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent("navigate-settings", { detail: "billing" }),
                )
              }
            >
              {t("common.upgrade_plan")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-semibold text-txt-primary">
          {t("settings.custom_domains_label")}
        </h3>
        <span className="text-sm text-txt-muted">
          {t("settings.used_count", {
            current: domains.length,
            max: max_domains,
          })}
        </span>
      </div>
      <p className="text-sm mb-3 text-txt-muted">
        {t("settings.domains_send_receive_description")}
      </p>

      <Button
        className="w-full mb-3"
        size="xl"
        variant="depth"
        onClick={on_add}
      >
        <PlusIcon className="w-4 h-4" />
        {t("common.add_domain")}
      </Button>

      {loading ? (
        <div />
      ) : domains.length === 0 ? (
        <div className="text-center py-8 rounded-xl bg-surf-secondary border border-dashed border-edge-secondary">
          <GlobeAltIcon className="w-6 h-6 mx-auto mb-2 text-txt-muted" />
          <p className="text-sm text-txt-muted">
            {t("settings.no_domains_yet")}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {domains.map((domain) => (
            <DomainCard
              key={domain.id}
              deleting={deleting_id === domain.id}
              domain={domain}
              on_delete={on_delete}
              on_setup={on_setup}
              on_toggle_catch_all={on_toggle_catch_all}
              on_verify={on_verify}
              verifying={verifying_id === domain.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
