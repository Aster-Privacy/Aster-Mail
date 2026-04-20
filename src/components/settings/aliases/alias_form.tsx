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
import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import {
  create_alias,
  check_alias_availability,
  validate_local_part,
} from "@/services/api/aliases";
import {
  add_domain_address,
  validate_local_part as validate_domain_local_part,
  type CustomDomain,
  type DecryptedDomainAddress,
} from "@/services/api/domains";
import { DEFAULT_DOMAINS } from "@/components/settings/hooks/use_aliases";
import {
  TurnstileWidget,
  type TurnstileWidgetRef,
  TURNSTILE_SITE_KEY,
} from "@/components/auth/turnstile_widget";

interface CreateAliasModalProps {
  is_open: boolean;
  on_close: () => void;
  on_created: () => void;
  max_aliases: number;
  current_count: number;
  available_domains: string[];
  custom_domains: CustomDomain[];
  domain_addresses: (DecryptedDomainAddress & { domain_name: string })[];
}

export function CreateAliasModal({
  is_open,
  on_close,
  on_created,
  max_aliases,
  current_count,
  available_domains,
  custom_domains,
  domain_addresses,
}: CreateAliasModalProps) {
  const { t } = use_i18n();
  const [local_part, set_local_part] = useState("");
  const [domain, set_domain] = useState(
    available_domains[0] || DEFAULT_DOMAINS[0],
  );
  const [saving, set_saving] = useState(false);
  const [error, set_error] = useState<string | null>(null);
  const [checking, set_checking] = useState(false);
  const [is_available, set_is_available] = useState<boolean | null>(null);
  const [captcha_token, set_captcha_token] = useState<string | null>(null);
  const check_timeout_ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const turnstile_ref = useRef<TurnstileWidgetRef>(null);
  const turnstile_required = !!TURNSTILE_SITE_KEY;

  const is_custom_domain = !DEFAULT_DOMAINS.includes(domain);
  const matched_custom_domain = custom_domains.find(
    (d) => d.domain_name === domain && d.status === "active",
  );

  useEffect(() => {
    if (is_open) {
      set_local_part("");
      set_domain(available_domains[0] || DEFAULT_DOMAINS[0]);
      set_error(null);
      set_is_available(null);
      set_captcha_token(null);
      turnstile_ref.current?.reset();
    }
  }, [is_open]);

  const check_availability = useCallback(async (lp: string, d: string) => {
    if (!lp || lp.length < 3) {
      set_is_available(null);

      return;
    }

    const validation = validate_local_part(lp);

    if (!validation.valid) {
      set_is_available(null);

      return;
    }

    set_checking(true);
    try {
      const response = await check_alias_availability(lp, d);

      if (response.data) {
        set_is_available(response.data.available);
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      set_is_available(null);
    } finally {
      set_checking(false);
    }
  }, []);

  useEffect(() => {
    if (check_timeout_ref.current) {
      clearTimeout(check_timeout_ref.current);
    }

    if (is_custom_domain) {
      set_is_available(null);
      set_checking(false);

      return;
    }

    if (local_part.length >= 3) {
      check_timeout_ref.current = setTimeout(() => {
        check_availability(local_part, domain);
      }, 500);
    } else {
      set_is_available(null);
    }

    return () => {
      if (check_timeout_ref.current) {
        clearTimeout(check_timeout_ref.current);
      }
    };
  }, [local_part, domain, check_availability, is_custom_domain]);

  const handle_create = async () => {
    const validation = is_custom_domain
      ? validate_domain_local_part(local_part)
      : validate_local_part(local_part);

    if (!validation.valid) {
      set_error(validation.error || t("settings.invalid_address"));

      return;
    }

    if (!is_custom_domain && is_available === false) {
      set_error(t("settings.alias_already_taken"));

      return;
    }

    if (is_custom_domain && !matched_custom_domain) {
      set_error(t("settings.domain_not_available"));

      return;
    }

    set_saving(true);
    set_error(null);

    try {
      if (is_custom_domain && matched_custom_domain) {
        const response = await add_domain_address(
          matched_custom_domain.id,
          local_part,
          domain,
          captcha_token ?? undefined,
        );

        if (response.error) {
          set_error(response.error);
          set_captcha_token(null);
          turnstile_ref.current?.reset();
        } else {
          on_created();
          on_close();
        }
      } else {
        const response = await create_alias(
          local_part,
          domain,
          undefined,
          captcha_token ?? undefined,
        );

        if (response.error) {
          if (response.code === "CONFLICT") {
            set_is_available(false);
          } else {
            set_error(response.error);
          }
          set_captcha_token(null);
          turnstile_ref.current?.reset();
        } else {
          on_created();
          on_close();
        }
      }
    } catch (err) {
      set_error(
        err instanceof Error
          ? err.message
          : t("settings.failed_create_address"),
      );
      set_captcha_token(null);
      turnstile_ref.current?.reset();
    } finally {
      set_saving(false);
    }
  };

  const has_custom_domains = custom_domains.some((d) => d.status === "active");
  const at_limit =
    max_aliases !== -1 && current_count >= max_aliases && !has_custom_domains;

  const current_validation = is_custom_domain
    ? validate_domain_local_part(local_part)
    : validate_local_part(local_part);

  const standard_domains = available_domains.filter((d) =>
    DEFAULT_DOMAINS.includes(d),
  );
  const custom_domain_options = available_domains.filter(
    (d) => !DEFAULT_DOMAINS.includes(d),
  );

  const custom_domain_address_count =
    is_custom_domain && matched_custom_domain
      ? domain_addresses.filter((a) => a.domain_id === matched_custom_domain.id)
          .length
      : 0;

  const remaining =
    max_aliases === -1
      ? Infinity
      : is_custom_domain
        ? Math.max(0, max_aliases - custom_domain_address_count)
        : Math.max(0, max_aliases - current_count);

  return (
    <Modal is_open={is_open} on_close={on_close} size="xl">
      <ModalHeader>
        <ModalTitle>
          {at_limit
            ? t("common.alias_limit_reached")
            : t("settings.create_email_alias")}
        </ModalTitle>
        <ModalDescription>
          {at_limit
            ? t("settings.alias_limit_all_used", {
                used: current_count,
                count: max_aliases,
              })
            : t("settings.alias_forwards_description")}
        </ModalDescription>
      </ModalHeader>

      <ModalBody>
        {at_limit ? (
          <p className="text-sm text-txt-secondary">
            {t("settings.upgrade_plan_more_aliases")}
          </p>
        ) : (
          <div className="space-y-5">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label
                  className="text-sm font-medium text-txt-primary"
                  htmlFor="alias-address"
                >
                  {t("settings.address_label")}
                </label>
                <span className="text-[11px] tabular-nums text-txt-muted">
                  {remaining === Infinity
                    ? t("settings.unlimited")
                    : `${remaining} ${t("common.remaining")}`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  className={`flex-1 min-w-0 h-10 px-3 rounded-lg bg-transparent border text-sm text-txt-primary placeholder:text-txt-muted outline-none ${
                    local_part && !current_validation.valid
                      ? "border-red-500"
                      : is_available === true
                        ? "border-green-500"
                        : is_available === false
                          ? "border-red-500"
                          : "border-edge-secondary"
                  }`}
                  id="alias-address"
                  placeholder="newsletter"
                  value={local_part}
                  onChange={(e) =>
                    set_local_part(e.target.value.toLowerCase().trim())
                  }
                  onKeyDown={(e) => e["key"] === "Enter" && handle_create()}
                />
                <Select value={domain} onValueChange={set_domain}>
                  <SelectTrigger className="h-10 w-auto shrink-0 rounded-lg border border-edge-secondary bg-transparent text-sm px-3 focus:ring-0 focus:ring-offset-0">
                    <span className="text-txt-muted mr-0.5">@</span>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {standard_domains.length > 0 && (
                      <>
                        <div className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wider text-txt-muted">
                          {t("settings.standard_aliases")}
                        </div>
                        {standard_domains.map((d) => (
                          <SelectItem key={d} value={d}>
                            {d}
                          </SelectItem>
                        ))}
                      </>
                    )}
                    {custom_domain_options.length > 0 && (
                      <>
                        <div className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wider mt-1 text-txt-muted">
                          {t("settings.custom_domains_label")}
                        </div>
                        {custom_domain_options.map((d) => (
                          <SelectItem key={d} value={d}>
                            {d}
                          </SelectItem>
                        ))}
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
              {checking && (
                <p className="text-xs mt-1.5 text-txt-muted">
                  {t("settings.checking_availability")}
                </p>
              )}
              {!checking && is_available === true && (
                <p className="text-xs mt-1.5 text-green-500">
                  {t("settings.alias_is_available")}
                </p>
              )}
              {!checking && is_available === false && (
                <p className="text-xs mt-1.5 text-red-500">
                  {t("settings.alias_not_available")}
                </p>
              )}
              {local_part && !current_validation.valid && (
                <p className="text-xs mt-1.5 text-red-500">
                  {current_validation.error}
                </p>
              )}
            </div>
            {turnstile_required && (
              <div className="flex justify-center">
                <TurnstileWidget
                  ref={turnstile_ref}
                  on_expire={() => set_captcha_token(null)}
                  on_verify={set_captcha_token}
                />
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="mt-4 px-3 py-2.5 rounded-lg text-sm bg-red-500/[0.08] border border-red-500/20 text-red-500">
            {error}
          </div>
        )}
      </ModalBody>

      <ModalFooter>
        <Button variant={at_limit ? "outline" : "ghost"} onClick={on_close}>
          {t("common.cancel")}
        </Button>
        {at_limit ? (
          <Button
            variant="depth"
            onClick={() => {
              on_close();
              window.dispatchEvent(
                new CustomEvent("navigate-settings", {
                  detail: "billing",
                }),
              );
            }}
          >
            {t("common.upgrade_plan")}
          </Button>
        ) : (
          <Button
            disabled={
              saving ||
              !local_part ||
              (!is_custom_domain && is_available === false) ||
              !current_validation.valid ||
              (turnstile_required && !captcha_token)
            }
            variant="depth"
            onClick={handle_create}
          >
            {saving ? t("common.creating") : t("settings.create_alias")}
          </Button>
        )}
      </ModalFooter>
    </Modal>
  );
}
