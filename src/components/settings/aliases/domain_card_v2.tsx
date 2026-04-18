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
import { useState } from "react";
import {
  GlobeAltIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  XMarkIcon,
  ArrowPathIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { Spinner } from "@/components/ui/spinner";
import {
  get_status_color,
  get_status_label,
  update_domain,
  rotate_dkim,
  type CustomDomain,
} from "@/services/api/domains";
import { show_toast } from "@/components/toast/simple_toast";

interface DomainCardV2Props {
  domain: CustomDomain;
  on_setup: (domain: CustomDomain) => void;
  on_delete: (id: string) => void;
  on_domains_changed: () => void;
  deleting: boolean;
}

function VerificationIcon({ verified }: { verified: boolean }) {
  if (verified) return <CheckCircleIcon className="w-4 h-4 text-green-500" />;

  return <XMarkIcon className="w-4 h-4 text-yellow-500" />;
}

export function DomainCardV2({
  domain,
  on_setup,
  on_delete,
  on_domains_changed,
  deleting,
}: DomainCardV2Props) {
  const { t } = use_i18n();
  const [expanded, set_expanded] = useState(false);
  const [show_advanced, set_show_advanced] = useState(false);
  const [catch_all_loading, set_catch_all_loading] = useState(false);
  const [dkim_rotating, set_dkim_rotating] = useState(false);

  const verification_count = [
    domain.txt_verified,
    domain.mx_verified,
    domain.spf_verified,
    domain.dkim_verified,
    domain.dmarc_configured,
  ].filter(Boolean).length;

  const handle_toggle_catch_all = async () => {
    set_catch_all_loading(true);
    try {
      const response = await update_domain(domain.id, {
        catch_all_enabled: !domain.catch_all_enabled,
      });

      if (!response.error) {
        on_domains_changed();
        show_toast(
          domain.catch_all_enabled
            ? t("settings.catch_all_disabled")
            : t("settings.catch_all_enabled_toast"),
          "success",
        );
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error(err);
    } finally {
      set_catch_all_loading(false);
    }
  };

  const handle_rotate_dkim = async () => {
    set_dkim_rotating(true);
    try {
      const response = await rotate_dkim(domain.id);

      if (response.data?.success) {
        show_toast(t("settings.dkim_rotated"), "success");
        on_domains_changed();
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error(err);
    } finally {
      set_dkim_rotating(false);
    }
  };

  return (
    <div className="rounded-lg overflow-hidden bg-surf-tertiary border border-edge-secondary">
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Button
            className="h-6 w-6 flex-shrink-0"
            size="icon"
            variant="ghost"
            onClick={() => set_expanded(!expanded)}
          >
            {expanded ? (
              <ChevronDownIcon className="w-4 h-4 text-txt-muted" />
            ) : (
              <ChevronRightIcon className="w-4 h-4 text-txt-muted" />
            )}
          </Button>

          <GlobeAltIcon className="w-5 h-5 flex-shrink-0 text-txt-muted" />

          <div className="min-w-0">
            <p className="text-sm font-medium truncate text-txt-primary">
              {domain.domain_name}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              {domain.status !== "active" && (
                <>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${get_status_color(domain.status)}`}
                  >
                    {get_status_label(domain.status)}
                  </span>
                  <span className="text-xs text-txt-muted">
                    {t("settings.verified_count", { count: verification_count })}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {domain.status !== "active" && (
            <Button size="md" variant="depth" onClick={() => on_setup(domain)}>
              <ArrowRightIcon className="w-3.5 h-3.5" />
              {t("settings.continue_setup")}
            </Button>
          )}

          <Button
            className="text-red-500 hover:text-red-500 hover:bg-red-500/10"
            disabled={deleting}
            size="icon"
            variant="ghost"
            onClick={() => on_delete(domain.id)}
          >
            {deleting ? (
              <Spinner size="md" />
            ) : (
              <TrashIcon className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t border-edge-secondary">
          <div className="flex items-center gap-4 mb-4">
            {[
              { label: "TXT", verified: domain.txt_verified },
              { label: "MX", verified: domain.mx_verified },
              { label: "SPF", verified: domain.spf_verified },
              { label: "DKIM", verified: domain.dkim_verified },
              { label: "DMARC", verified: domain.dmarc_configured },
            ].map(({ label, verified }) => (
              <div key={label} className="flex items-center gap-1.5">
                <VerificationIcon verified={verified} />
                <span className="text-xs text-txt-secondary">{label}</span>
              </div>
            ))}
          </div>

          {domain.status !== "active" && verification_count < 5 && (
            <p className="text-xs text-txt-muted mb-4">
              {t("settings.domain_pending_hint")}
            </p>
          )}

          {domain.status === "active" && (
            <div>
              <button
                className="flex items-center gap-2 text-sm font-medium text-txt-secondary hover:text-txt-primary transition-colors mb-3"
                type="button"
                onClick={() => set_show_advanced(!show_advanced)}
              >
                {show_advanced ? (
                  <ChevronDownIcon className="w-4 h-4" />
                ) : (
                  <ChevronRightIcon className="w-4 h-4" />
                )}
                {t("settings.advanced_settings")}
              </button>

              {show_advanced && (
                <div className="space-y-4 pl-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-txt-primary">
                        {t("settings.catch_all_label")}
                      </p>
                      <p className="text-xs text-txt-muted">
                        {t("settings.catch_all_description")}
                      </p>
                    </div>
                    <button
                      className="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out"
                      disabled={catch_all_loading}
                      role="switch"
                      style={{
                        backgroundColor: domain.catch_all_enabled
                          ? "var(--accent-color, #3b82f6)"
                          : "var(--bg-tertiary)",
                        opacity: catch_all_loading ? 0.6 : 1,
                      }}
                      type="button"
                      onClick={handle_toggle_catch_all}
                    >
                      <span
                        className="pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200 ease-in-out"
                        style={{
                          transform: domain.catch_all_enabled
                            ? "translate(20px, 2px)"
                            : "translate(2px, 2px)",
                        }}
                      />
                    </button>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-txt-primary">
                        {t("settings.rotate_dkim_key")}
                      </p>
                      <p className="text-xs text-txt-muted">
                        {t("settings.rotate_dkim_description")}
                      </p>
                    </div>
                    <Button
                      disabled={dkim_rotating}
                      size="sm"
                      variant="outline"
                      onClick={handle_rotate_dkim}
                    >
                      {dkim_rotating ? (
                        <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <ArrowPathIcon className="w-3.5 h-3.5" />
                      )}
                      {t("settings.rotate_label")}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
