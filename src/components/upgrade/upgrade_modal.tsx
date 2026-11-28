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
import type { ChangeEvent, ComponentType, SVGProps } from "react";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowTopRightOnSquareIcon,
  ArrowUpTrayIcon,
  AtSymbolIcon,
  BeakerIcon,
  BoltIcon,
  ChatBubbleBottomCenterTextIcon,
  CheckIcon,
  CircleStackIcon,
  DocumentDuplicateIcon,
  EnvelopeOpenIcon,
  FolderIcon,
  GlobeAltIcon,
  KeyIcon,
  LockClosedIcon,
  MoonIcon,
  PaperAirplaneIcon,
  PencilSquareIcon,
  ServerStackIcon,
  Squares2X2Icon,
  TrashIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import {
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  ModalDescription,
} from "@/components/ui/modal";
import { Progress } from "@/components/ui/progress";
import { LoadFailedNotice } from "@/components/settings/load_failed_notice";
import { Spinner } from "@/components/ui/spinner";
import { use_auth } from "@/contexts/auth_context";
import { use_i18n } from "@/lib/i18n/context";
import { use_plan_limits } from "@/hooks/use_plan_limits";
import {
  show_toast,
  TOAST_DURATION_BILLING_MS,
} from "@/components/toast/simple_toast";
import { request_cache } from "@/services/api/request_cache";
import {
  change_plan,
  format_price,
  start_hosted_checkout,
} from "@/services/api/billing";
import {
  CURRENCY_STORAGE_KEY,
  FAMILY_PLAN_DUO_FEATURES,
  FAMILY_PLAN_FAMILY_FEATURES,
  FAMILY_PLAN_TIERS,
  PLAN_TIERS,
  SUPPORTED_CURRENCIES,
  convert_cents,
  detect_currency_from_locale,
  min_plan_for_feature,
  type PlanTier,
} from "@/components/settings/billing/billing_constants";
import { use_currency_rates } from "@/components/settings/billing/use_currency_rates";
import { PlanFeaturesModal } from "@/components/settings/billing/plan_features_modal";
import { PlanPaymentMethodModal } from "@/components/settings/billing/plan_payment_method_modal";
import { CryptoTermModal } from "@/components/settings/billing/crypto_term_modal";
import { PlanChangeConfirmModal } from "@/components/settings/billing/plan_change_confirm_modal";
import { is_payment_navigation } from "@/lib/payment_navigation";
import { cn, format_bytes } from "@/lib/utils";
import { scroll_to_storage_addons } from "@/components/layout/storage_meter";
import {
  close_upgrade_modal,
  is_on_auth_route,
  use_upgrade_state,
  type UpgradeInterval,
  type UpgradeLimitKey,
} from "@/stores/upgrade_store";
import { checkout_error_text } from "@/components/settings/billing/checkout_error_text";
import { has_tauri_runtime } from "@/lib/tauri_runtime";

const LIMIT_LABEL_KEY: Record<UpgradeLimitKey, string> = {
  max_email_aliases: "settings.usage_aliases",
  max_custom_domains: "settings.usage_domains",
  max_email_templates: "settings.usage_templates",
  max_html_signatures: "settings.usage_signatures",
  max_custom_filters: "settings.usage_filters",
  max_custom_categories: "settings.usage_custom_categories",
  max_linked_accounts: "settings.usage_linked_accounts",
  max_external_accounts: "settings.ext_v2_usage_synced_accounts",
  max_send_only_accounts: "settings.ext_v2_usage_send_only_accounts",
  max_labels: "settings.folders_limit",
  generic: "settings.upgrade_generic_resource",
};

type HighlightKind = "storage" | "aliases" | "domains" | "accounts" | "extra";

interface RequiredFor {
  label_key: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

const REQUIRED_FOR_LIMIT: Partial<Record<UpgradeLimitKey, RequiredFor>> = {
  max_email_aliases: {
    label_key: "settings.plan_required_for_aliases",
    icon: AtSymbolIcon,
  },
  max_custom_domains: {
    label_key: "settings.plan_required_for_domains",
    icon: GlobeAltIcon,
  },
  max_email_templates: {
    label_key: "settings.plan_required_for_templates",
    icon: DocumentDuplicateIcon,
  },
  max_html_signatures: {
    label_key: "settings.plan_required_for_signatures",
    icon: PencilSquareIcon,
  },
  max_custom_filters: {
    label_key: "settings.plan_required_for_filters",
    icon: BoltIcon,
  },
  max_custom_categories: {
    label_key: "settings.plan_required_for_categories",
    icon: Squares2X2Icon,
  },
  max_linked_accounts: {
    label_key: "settings.plan_required_for_linked_accounts",
    icon: UsersIcon,
  },
  max_external_accounts: {
    label_key: "settings.plan_required_for_synced_accounts",
    icon: ServerStackIcon,
  },
  max_send_only_accounts: {
    label_key: "settings.plan_required_for_send_only_accounts",
    icon: ServerStackIcon,
  },
  max_labels: {
    label_key: "settings.plan_required_for_folders",
    icon: FolderIcon,
  },
};

const REQUIRED_FOR_FEATURE: Record<string, RequiredFor> = {
  has_advanced_aliases: {
    label_key: "settings.plan_required_for_advanced_aliases",
    icon: AtSymbolIcon,
  },
  has_alias_avatars: {
    label_key: "settings.plan_required_for_alias_photos",
    icon: AtSymbolIcon,
  },
  has_alias_rules: {
    label_key: "settings.plan_required_for_alias_rules",
    icon: AtSymbolIcon,
  },
  has_alias_external_relay: {
    label_key: "settings.plan_required_for_external_relay",
    icon: AtSymbolIcon,
  },
  has_auto_delete_spam_trash: {
    label_key: "settings.plan_required_for_auto_delete",
    icon: TrashIcon,
  },
  has_auto_forwarding: {
    label_key: "settings.plan_required_for_auto_forwarding",
    icon: ArrowTopRightOnSquareIcon,
  },
  has_catch_all: {
    label_key: "settings.plan_required_for_catch_all",
    icon: GlobeAltIcon,
  },
  has_priority_support: {
    label_key: "settings.plan_required_for_priority_support",
    icon: ChatBubbleBottomCenterTextIcon,
  },
  has_quiet_hours: {
    label_key: "settings.plan_required_for_quiet_hours",
    icon: MoonIcon,
  },
  has_remove_branding: {
    label_key: "settings.plan_required_for_remove_branding",
    icon: PencilSquareIcon,
  },
  has_vacation_reply: {
    label_key: "settings.plan_required_for_vacation_reply",
    icon: PaperAirplaneIcon,
  },
  max_alias_directories: {
    label_key: "settings.plan_required_for_directories",
    icon: FolderIcon,
  },
  max_custom_categories: {
    label_key: "settings.plan_required_for_categories",
    icon: Squares2X2Icon,
  },
  has_contact_merge_wizard: {
    label_key: "settings.plan_required_for_contact_merge",
    icon: UsersIcon,
  },
  has_custom_key_rotation: {
    label_key: "settings.plan_required_for_key_rotation",
    icon: KeyIcon,
  },
  has_encrypted_export: {
    label_key: "settings.plan_required_for_encrypted_export",
    icon: ArrowUpTrayIcon,
  },
  has_mta_sts_hosting: {
    label_key: "settings.plan_required_for_mta_sts",
    icon: GlobeAltIcon,
  },
  has_password_protected_folders: {
    label_key: "settings.plan_required_for_locked_folders",
    icon: LockClosedIcon,
  },
  has_dedicated_support: {
    label_key: "settings.plan_required_for_dedicated_support",
    icon: ChatBubbleBottomCenterTextIcon,
  },
  has_early_access: {
    label_key: "settings.plan_required_for_early_access",
    icon: BeakerIcon,
  },
  has_receipt_tracking: {
    label_key: "settings.plan_required_for_receipt_tracking",
    icon: EnvelopeOpenIcon,
  },
  max_primary_renames: {
    label_key: "settings.plan_required_for_primary_renames",
    icon: AtSymbolIcon,
  },
  has_sender_pinning: {
    label_key: "settings.plan_required_for_sender_pinning",
    icon: AtSymbolIcon,
  },
  max_reverse_contacts_per_alias: {
    label_key: "settings.plan_required_for_reverse_contacts",
    icon: AtSymbolIcon,
  },
};

const REQUIRED_FOR_STORAGE: RequiredFor = {
  label_key: "settings.plan_required_for_storage",
  icon: CircleStackIcon,
};

interface PlanHighlight {
  kind: HighlightKind;
  label_key: string;
  params?: Record<string, string>;
  lead_only?: boolean;
}

type PlanAudience = "individual" | "family";

const PLAN_HIGHLIGHTS: Record<string, PlanHighlight[]> = {
  star: [
    { kind: "storage", label_key: "settings.plan_feat_storage_50" },
    { kind: "aliases", label_key: "settings.plan_feat_aliases_15" },
    { kind: "domains", label_key: "settings.plan_feat_domains_5" },
    {
      kind: "extra",
      label_key: "settings.plan_feat_imap_smtp",
    },
  ],
  nova: [
    { kind: "storage", label_key: "settings.plan_feat_storage_500" },
    { kind: "aliases", label_key: "settings.plan_feat_aliases_unlimited" },
    { kind: "domains", label_key: "settings.plan_feat_domains_30" },
    {
      kind: "accounts",
      label_key: "settings.plan_f_multi_accounts",
      params: { value: "5" },
    },
    {
      kind: "extra",
      label_key: "settings.plan_feat_smart_folders",
    },
  ],
  supernova: [
    { kind: "storage", label_key: "settings.plan_feat_storage_5tb" },
    { kind: "domains", label_key: "settings.plan_feat_domains_unlimited" },
    {
      kind: "aliases",
      label_key: "settings.plan_feat_aliases_unlimited",
      lead_only: true,
    },
    {
      kind: "accounts",
      label_key: "settings.plan_f_multi_accounts",
      params: { value: "20" },
    },
    {
      kind: "extra",
      label_key: "settings.plan_f_support_dedicated",
    },
    {
      kind: "extra",
      label_key: "settings.plan_f_early_access",
    },
  ],
};

const LIMIT_HIGHLIGHT_KIND: Partial<Record<UpgradeLimitKey, HighlightKind>> = {
  max_email_aliases: "aliases",
  max_custom_domains: "domains",
  max_linked_accounts: "accounts",
};

function order_highlights(
  highlights: PlanHighlight[],
  lead: HighlightKind | null,
): PlanHighlight[] {
  if (!lead) return highlights.filter((entry) => !entry.lead_only);

  return [
    ...highlights.filter((entry) => entry.kind === lead),
    ...highlights.filter((entry) => entry.kind !== lead && !entry.lead_only),
  ];
}

const CARD_FEATURE_COUNT = 4;

const GRID_COLUMNS: Record<number, string> = {
  1: "sm:grid-cols-1 sm:max-w-sm sm:mx-auto w-full",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
};

function upgrade_tiers(plan_code: string | null): PlanTier[] {
  const index = PLAN_TIERS.findIndex((tier) => tier.id === plan_code);

  return PLAN_TIERS.slice(index + 1);
}

function checkout_interval_for(term_id: string): string {
  if (term_id === "monthly") return "month";
  if (term_id === "biennial") return "biennial";

  return "year";
}

function term_id_for_interval(interval: UpgradeInterval | null): string {
  if (interval === "year") return "yearly";
  if (interval === "biennial") return "biennial";

  return "monthly";
}

function is_desktop(): boolean {
  return has_tauri_runtime();
}

export function UpgradeModal() {
  const { t } = use_i18n();
  const location = useLocation();
  const navigate = useNavigate();
  const state = use_upgrade_state();
  const { is_authenticated } = use_auth();
  const is_blocked = is_on_auth_route(location.pathname) || !is_authenticated;
  const {
    limits,
    is_loading: is_loading_limits,
    load_failed: limits_load_failed,
    refresh,
  } = use_plan_limits();
  const [currency, set_currency] = useState("usd");
  const [audience, set_audience] = useState<PlanAudience>("individual");
  const [interval, set_interval] = useState<"month" | "year">("year");
  const [term_id, set_term_id] = useState("yearly");
  const [crypto_tier, set_crypto_tier] = useState<PlanTier | null>(null);
  const [crypto_term_months, set_crypto_term_months] = useState(1);
  const [pending_tier, set_pending_tier] = useState<PlanTier | null>(null);
  const [plan_change_target, set_plan_change_target] = useState<{
    tier: PlanTier;
    billing: string;
  } | null>(null);
  const [compare_open, set_compare_open] = useState(false);
  const [is_starting, set_is_starting] = useState(false);
  const pending_desktop_checkout_ref = useRef(false);
  const [seeded_open_seq, set_seeded_open_seq] = useState(0);
  const [is_resume_review, set_is_resume_review] = useState(false);

  use_currency_rates();

  useEffect(() => {
    set_currency(detect_currency_from_locale());
  }, []);

  useEffect(() => {
    if (is_blocked && state.is_open) {
      close_upgrade_modal();
    }
  }, [is_blocked, state.is_open]);

  useEffect(() => {
    const handle_focus = () => {
      if (!pending_desktop_checkout_ref.current) return;
      pending_desktop_checkout_ref.current = false;
      set_is_starting(false);
      request_cache.invalidate("/payments/v1");
      refresh(true);
    };

    window.addEventListener("focus", handle_focus);

    return () => window.removeEventListener("focus", handle_focus);
  }, [refresh]);

  const is_storage = state.reason === "storage_full";
  const is_resume = state.reason === "checkout_cancelled";
  const is_offer = state.reason === "offer";
  const is_manual = state.reason === "manual";

  const limit_info = useMemo(() => {
    if (!limits || state.limit_key === "generic") return null;

    return limits.limits[state.limit_key] ?? null;
  }, [limits, state.limit_key]);

  const plan_name = limits?.plan_name ?? null;
  const plan_code = limits?.plan_code ?? null;

  const individual_tiers = useMemo(() => upgrade_tiers(plan_code), [plan_code]);

  const family_tiers = useMemo<PlanTier[]>(
    () =>
      FAMILY_PLAN_TIERS.map((entry) => ({
        id: entry.id,
        name: entry.name,
        description: entry.description,
        monthly_cents: entry.monthly_cents,
        yearly_cents: entry.yearly_cents,
        biennial_cents: entry.biennial_cents,
        savings_cents: Math.max(
          0,
          entry.monthly_cents * 12 - entry.yearly_cents,
        ),
        biennial_savings_cents: Math.max(
          0,
          entry.monthly_cents * 24 - entry.biennial_cents,
        ),
        is_recommended: entry.is_recommended,
      })),
    [],
  );

  const tiers = audience === "family" ? family_tiers : individual_tiers;

  const yearly_save_percent = useMemo(() => {
    const best = tiers.reduce((acc, entry) => {
      const full = entry.monthly_cents * 12;

      if (full <= 0) return acc;

      return Math.max(acc, ((full - entry.yearly_cents) / full) * 100);
    }, 0);

    return Math.round(best);
  }, [tiers]);

  const required_tier = useMemo(
    () => (is_storage ? null : min_plan_for_feature(state.feature_key)),
    [is_storage, state.feature_key],
  );

  const lead_kind: HighlightKind | null = is_storage
    ? "storage"
    : (LIMIT_HIGHLIGHT_KIND[state.limit_key] ?? null);

  const default_tier = useMemo(() => {
    if (tiers.length === 0) return null;

    const by_price = [...tiers].sort(
      (left, right) => left.monthly_cents - right.monthly_cents,
    );
    const raises_limit = lead_kind
      ? by_price.find((tier) =>
          (PLAN_HIGHLIGHTS[tier.id] ?? []).some(
            (entry) => entry.kind === lead_kind,
          ),
        )
      : null;
    const limit_pick =
      raises_limit ??
      (state.limit_key !== "generic" && !lead_kind ? by_price[0] : null);

    const preselected = state.preselect_plan_code
      ? tiers.find((tier) => tier.id === state.preselect_plan_code)
      : null;
    const required = required_tier
      ? tiers.find((tier) => tier.id === required_tier.id)
      : null;

    return (
      preselected ??
      required ??
      limit_pick ??
      tiers.find((tier) => tier.is_recommended) ??
      tiers[0]
    );
  }, [
    tiers,
    required_tier,
    state.preselect_plan_code,
    state.limit_key,
    lead_kind,
  ]);

  const resume_target = useMemo(() => {
    if (state.reason !== "checkout_cancelled") return null;
    if (!state.preselect_plan_code) return null;

    const individual = individual_tiers.find(
      (tier) => tier.id === state.preselect_plan_code,
    );

    if (individual) {
      return { tier: individual, audience: "individual" as PlanAudience };
    }

    const family = family_tiers.find(
      (tier) => tier.id === state.preselect_plan_code,
    );

    if (family) return { tier: family, audience: "family" as PlanAudience };

    return null;
  }, [state.reason, state.preselect_plan_code, individual_tiers, family_tiers]);

  useEffect(() => {
    if (!state.is_open || is_blocked) return;

    if (seeded_open_seq === state.open_seq) return;

    refresh(true);
    set_seeded_open_seq(state.open_seq);
    set_is_starting(false);
    set_compare_open(false);
    set_crypto_tier(null);
    set_plan_change_target(null);

    if (resume_target) {
      set_audience(resume_target.audience);
      set_term_id(term_id_for_interval(state.preselect_interval));
      set_pending_tier(resume_target.tier);
      set_is_resume_review(true);

      return;
    }

    set_pending_tier(null);
    set_is_resume_review(false);
  }, [
    state.is_open,
    state.open_seq,
    state.preselect_interval,
    seeded_open_seq,
    resume_target,
    is_blocked,
    refresh,
  ]);

  const close_resume_review = () => {
    set_pending_tier(null);
    set_is_resume_review(false);
    close_upgrade_modal();
  };

  const handle_currency_change = (event: ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value;

    set_currency(next);
    try {
      localStorage.setItem(CURRENCY_STORAGE_KEY, next);
    } catch {
      return;
    }
  };

  const scroll_probe_ref = useRef<HTMLSpanElement | null>(null);
  const [has_more_below, set_has_more_below] = useState(false);

  const measure_scroll_edge = () => {
    const body = scroll_probe_ref.current?.parentElement;

    if (!body) return;

    set_has_more_below(
      body.scrollHeight - body.scrollTop - body.clientHeight > 1,
    );
  };

  useEffect(() => {
    if (!state.is_open) return;

    const body = scroll_probe_ref.current?.parentElement;
    const frame = requestAnimationFrame(measure_scroll_edge);

    if (!body || typeof ResizeObserver === "undefined") {
      return () => cancelAnimationFrame(frame);
    }

    const observer = new ResizeObserver(measure_scroll_edge);

    observer.observe(body);
    Array.from(body.children).forEach((child) => observer.observe(child));

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  });

  useEffect(() => {
    if (state.is_open && state.preselect_interval) {
      set_interval(state.preselect_interval === "month" ? "month" : "year");
    }
  }, [state.is_open, state.preselect_interval]);

  const tier_features = (tier: PlanTier) => {
    const family_features =
      tier.id === "duo"
        ? FAMILY_PLAN_DUO_FEATURES
        : tier.id === "family"
          ? FAMILY_PLAN_FAMILY_FEATURES
          : null;

    if (family_features) {
      return family_features.map((entry) => ({
        label: t(entry.label_key as never),
        on: entry.on,
        is_lead: false,
      }));
    }

    return order_highlights(PLAN_HIGHLIGHTS[tier.id] ?? [], lead_kind).map(
      (highlight) => ({
        label: t(highlight.label_key as never, highlight.params),
        on: true,
        is_lead: lead_kind !== null && highlight.kind === lead_kind,
      }),
    );
  };

  const resource_label = state.limit_key
    ? t(LIMIT_LABEL_KEY[state.limit_key] as never) || state.resource_label
    : state.resource_label;

  const title = is_storage
    ? t("settings.storage_locked_title")
    : is_resume
      ? t("settings.upgrade_resume_title")
      : is_offer
        ? t("settings.offer_upgrade_title")
        : is_manual
          ? t("settings.win_back_offer_action")
          : t("settings.upgrade_modal_title");

  const description = is_storage
    ? t("settings.plan_picker_storage_subtitle")
    : is_resume
      ? t("settings.upgrade_resume_description")
      : is_offer
        ? t("settings.offer_upgrade_description")
        : is_manual
          ? t("settings.upgrade_for_more")
          : required_tier
            ? null
            : limit_info && resource_label && plan_name
              ? t("settings.plan_picker_limit_subtitle", {
                  resource: String(resource_label).toLowerCase(),
                  plan: plan_name,
                })
              : state.server_message && state.server_message.trim().length > 0
                ? state.server_message
                : t("settings.plan_picker_generic_subtitle");

  const required_for =
    is_manual || is_resume || is_offer
      ? null
      : is_storage
        ? REQUIRED_FOR_STORAGE
        : ((state.feature_key
            ? REQUIRED_FOR_FEATURE[state.feature_key]
            : null) ??
          REQUIRED_FOR_LIMIT[state.limit_key] ??
          null);

  const required_plan_name = required_tier?.name ?? default_tier?.name ?? null;

  const required_for_text =
    required_for && required_plan_name
      ? t(required_for.label_key as never, { plan: required_plan_name })
      : null;

  const RequiredForIcon = required_for?.icon ?? null;

  const limit_note =
    state.limit_key === "max_linked_accounts"
      ? t("settings.upgrade_linked_accounts_note")
      : null;

  const monthly_equivalent = (tier: PlanTier) =>
    interval === "year"
      ? Math.round(tier.yearly_cents / 12)
      : tier.monthly_cents;

  const price_label = (tier: PlanTier) =>
    format_price(convert_cents(monthly_equivalent(tier), currency), currency);

  const billing_line = (tier: PlanTier) =>
    interval === "year"
      ? t("settings.billing_billed_yearly_total", {
          amount: format_price(
            convert_cents(tier.yearly_cents, currency),
            currency,
          ),
        })
      : t("settings.billing_billed_monthly");

  const start_plan_change = async (
    tier: PlanTier,
    billing: string,
    promo_code?: string,
  ) => {
    set_is_starting(true);

    try {
      const result = await change_plan(
        tier.id,
        billing,
        undefined,
        undefined,
        promo_code,
      );

      if (!result.ok) {
        show_toast(
          checkout_error_text(t, result.server_code),
          "error",
          TOAST_DURATION_BILLING_MS,
        );
        set_is_starting(false);

        return;
      }

      if (result.requires_checkout) {
        if (is_desktop()) {
          pending_desktop_checkout_ref.current = true;
          set_is_starting(false);
        }

        return;
      }

      request_cache.invalidate("/payments/v1");
      await refresh(true);
      show_toast(t("settings.payment_success"), "success");
      set_plan_change_target(null);
      close_upgrade_modal();
      set_is_starting(false);
    } catch {
      show_toast(
        t("settings.failed_checkout"),
        "error",
        TOAST_DURATION_BILLING_MS,
      );
      set_is_starting(false);
    }
  };

  const handle_select_tier = (tier: PlanTier) => {
    if (is_starting) return;

    if (!limits) {
      show_toast(t("common.something_went_wrong_try_again"), "error");
      void refresh();

      return;
    }

    set_term_id(interval === "month" ? "monthly" : "yearly");
    set_pending_tier(tier);
  };

  const handle_choose_crypto = (selected_term_id?: string) => {
    if (is_starting || !pending_tier) return;

    const tier = pending_tier;
    const chosen = selected_term_id ?? term_id;

    set_crypto_term_months(
      chosen === "monthly" ? 1 : chosen === "biennial" ? 24 : 12,
    );
    set_pending_tier(null);
    set_crypto_tier(tier);
  };

  const handle_choose_card = async (selected_term_id?: string) => {
    if (is_starting || !pending_tier) return;

    const billing = checkout_interval_for(selected_term_id ?? term_id);

    if (!!plan_code && plan_code !== "free") {
      set_plan_change_target({ tier: pending_tier, billing });
      set_pending_tier(null);

      return;
    }

    set_is_starting(true);

    try {
      const result = await start_hosted_checkout(
        pending_tier.id,
        billing,
        currency,
      );

      if (!result.ok) {
        show_toast(
          checkout_error_text(t, result.server_code),
          "error",
          TOAST_DURATION_BILLING_MS,
        );
      } else if (is_desktop()) {
        pending_desktop_checkout_ref.current = true;
      }

      set_is_starting(false);
    } catch {
      show_toast(
        t("settings.failed_checkout"),
        "error",
        TOAST_DURATION_BILLING_MS,
      );
      set_is_starting(false);
    }
  };

  useEffect(() => {
    const guard_active = is_starting || !!pending_tier || !!plan_change_target;

    if (!guard_active) return;

    const handle_before_unload = (event: BeforeUnloadEvent) => {
      if (is_payment_navigation()) return;

      event.preventDefault();
      event.returnValue = t("settings.checkout_leave_warning");
    };

    window.addEventListener("beforeunload", handle_before_unload);

    return () => {
      window.removeEventListener("beforeunload", handle_before_unload);
    };
  }, [is_starting, pending_tier, plan_change_target, t]);

  const handle_compare_plans = () => {
    set_compare_open(true);
  };

  const handle_buy_storage = () => {
    close_upgrade_modal();
    requestAnimationFrame(() => {
      window.dispatchEvent(
        new CustomEvent("navigate-settings", { detail: "billing" }),
      );
      scroll_to_storage_addons();
    });
  };

  const limits_failed = !limits && limits_load_failed && !is_loading_limits;
  const is_first_load = !limits && !limits_failed;

  const storage = limits?.storage ?? null;
  const storage_percentage = storage
    ? Math.min(100, storage.percentage_used)
    : 0;

  return (
    <>
      <Modal
        close_on_escape={false}
        close_on_overlay={false}
        is_open={
          state.is_open &&
          !is_blocked &&
          seeded_open_seq === state.open_seq &&
          !pending_tier &&
          !crypto_tier &&
          !plan_change_target
        }
        on_close={close_upgrade_modal}
        size="2xl"
      >
        <ModalHeader>
          {required_for_text && RequiredForIcon ? (
            <p
              className="mb-1.5 flex items-start gap-1.5 text-[13px] font-medium leading-4 text-amber-700 dark:text-[var(--color-warning)]"
              data-testid="plan_required_for"
            >
              <RequiredForIcon
                aria-hidden="true"
                className="h-4 w-4 shrink-0"
                strokeWidth={1.75}
              />
              <span>{required_for_text}</span>
            </p>
          ) : null}
          <ModalTitle>{title}</ModalTitle>
          {description ? (
            <ModalDescription>{description}</ModalDescription>
          ) : (
            <ModalDescription className="sr-only">
              {required_for_text ?? title}
            </ModalDescription>
          )}
        </ModalHeader>

        <ModalBody className="space-y-4" onScroll={measure_scroll_edge}>
          <span ref={scroll_probe_ref} hidden />
          {limit_note ? (
            <p className="text-[13px] leading-5 text-txt-muted">
              {limit_note}
              {state.limit_key === "max_linked_accounts" ? (
                <>
                  {" "}
                  <a
                    className="font-medium underline underline-offset-2"
                    href="https://astermail.org/terms#section-2"
                    rel="noopener noreferrer"
                    style={{ color: "var(--accent-color)" }}
                    target="_blank"
                  >
                    {t("settings.upgrade_linked_accounts_link")}
                  </a>
                </>
              ) : null}
            </p>
          ) : null}

          {is_storage && storage ? (
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[13px] font-medium text-txt-primary">
                  {t("settings.usage_storage")}
                </span>
                <span
                  className="text-[12px] tabular-nums"
                  style={{
                    color: storage.is_locked
                      ? "var(--destructive)"
                      : "var(--text-muted)",
                  }}
                >
                  {format_bytes(storage.used_bytes)} /{" "}
                  {format_bytes(storage.limit_bytes)}
                </span>
              </div>
              <Progress
                className={`h-1.5 ${storage.is_locked ? "[&>div]:bg-red-500" : storage.is_warning ? "[&>div]:bg-amber-500" : ""}`}
                value={storage_percentage}
              />
              {storage.days_until_permanent_bounce !== null &&
                storage.is_locked && (
                  <p
                    className="mt-2 text-[12px]"
                    style={{ color: "var(--destructive)" }}
                  >
                    {t("settings.storage_locked_bounce_warning", {
                      days: storage.days_until_permanent_bounce,
                    })}
                  </p>
                )}
            </div>
          ) : null}

          {limits_failed ? (
            <LoadFailedNotice on_retry={() => void refresh(true)} />
          ) : null}

          {is_first_load ? (
            <div className="flex items-center justify-center py-12">
              <Spinner size="sm" />
            </div>
          ) : null}

          {!is_first_load && !limits_failed && tiers.length > 0 && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div
                  aria-label={t("settings.billing_term_heading")}
                  className="aster_segmented"
                  role="group"
                >
                  {(["month", "year"] as const).map((period) => (
                    <button
                      key={period}
                      aria-pressed={interval === period}
                      className="aster_segmented_option"
                      type="button"
                      onClick={() => set_interval(period)}
                    >
                      {period === "year"
                        ? t("settings.billing_yearly")
                        : t("settings.billing_monthly")}
                      {period === "year" && yearly_save_percent > 0 && (
                        <span
                          className="ms-1.5 text-[11.5px] font-semibold"
                          style={{
                            color:
                              interval === "year"
                                ? "inherit"
                                : "var(--color-success)",
                          }}
                        >
                          {t("settings.billing_save_percent", {
                            percent: yearly_save_percent,
                          })}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                <button
                  className="text-[13px] font-medium text-txt-secondary underline-offset-4 transition-colors hover:text-txt-primary hover:underline focus-visible:underline focus-visible:outline-none"
                  type="button"
                  onClick={() =>
                    set_audience(
                      audience === "family" ? "individual" : "family",
                    )
                  }
                >
                  {audience === "family"
                    ? t("settings.plan_picker_individual_link")
                    : t("settings.plan_picker_family_link")}
                </button>
              </div>

              <div
                className={`grid grid-cols-1 gap-3 ${GRID_COLUMNS[tiers.length] ?? "sm:grid-cols-3"}`}
              >
                {tiers.map((tier) => {
                  const is_featured = default_tier?.id === tier.id;

                  return (
                    <div
                      key={tier.id}
                      className={`flex flex-col gap-4 rounded-[var(--aster-radius-control)] p-4 ${is_featured ? "order-first sm:order-none" : ""}`}
                      data-plan-card={tier.id}
                      style={{
                        backgroundColor: "var(--aster-field-bg)",
                        boxShadow: is_featured
                          ? "inset 0 0 0 2px var(--accent-color)"
                          : "none",
                      }}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <h5 className="text-[17px] font-semibold leading-6 text-txt-primary">
                            {tier.name}
                          </h5>
                          {is_featured && (
                            <span
                              className="text-[12px] font-medium"
                              style={{ color: "var(--accent-color)" }}
                            >
                              {t("settings.plan_recommended")}
                            </span>
                          )}
                        </div>
                        <div className="mt-2 flex items-baseline gap-1">
                          <span className="text-[26px] font-semibold tabular-nums leading-8 tracking-tight text-txt-primary">
                            {price_label(tier)}
                          </span>
                          <span className="text-[13px] text-txt-muted">
                            {t("settings.per_month_short")}
                          </span>
                        </div>
                        <p className="mt-1 text-[12.5px] text-txt-muted">
                          {billing_line(tier)}
                        </p>
                      </div>
                      <Button
                        className="w-full"
                        disabled={is_starting}
                        size="lg"
                        variant={is_featured ? "primary" : "secondary"}
                        onClick={() => handle_select_tier(tier)}
                      >
                        {t("settings.get_plan", { name: tier.name })}
                      </Button>
                      <ul className="flex flex-col gap-2">
                        {tier_features(tier)
                          .filter((feature) => feature.on)
                          .slice(0, CARD_FEATURE_COUNT)
                          .map((feature) => (
                            <li
                              key={feature.label}
                              className={
                                feature.is_lead
                                  ? "flex items-start gap-2 text-[13px] font-medium leading-5 text-amber-700 dark:text-[var(--color-warning)]"
                                  : "flex items-start gap-2 text-[13px] leading-5 text-txt-secondary"
                              }
                            >
                              <CheckIcon
                                className={
                                  feature.is_lead
                                    ? "mt-0.5 h-4 w-4 flex-shrink-0"
                                    : "mt-0.5 h-4 w-4 flex-shrink-0 text-txt-muted"
                                }
                              />
                              <span>{feature.label}</span>
                            </li>
                          ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {!is_first_load && !limits_failed && tiers.length === 0 && (
            <ul className="flex flex-col gap-2">
              {[
                t("settings.upgrade_perk_storage"),
                t("settings.upgrade_perk_aliases"),
                t("settings.upgrade_perk_domains"),
                t("settings.upgrade_perk_features"),
              ].map((perk) => (
                <li
                  key={perk}
                  className="flex items-start gap-2 text-[13px] leading-5 text-txt-secondary"
                >
                  <CheckIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-txt-muted" />
                  <span>{perk}</span>
                </li>
              ))}
            </ul>
          )}

          <p className="flex flex-wrap items-center justify-center gap-x-1.5 text-center text-[12px] text-txt-muted">
            <span>
              {t("settings.money_back_guarantee")} ·{" "}
              {t("settings.cancel_anytime")}
            </span>
            {tiers.length > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <select
                  aria-label={t("settings.select_currency")}
                  className="cursor-pointer appearance-none bg-transparent text-[12px] text-txt-muted underline-offset-4 outline-none transition-colors hover:text-txt-primary hover:underline focus-visible:underline"
                  value={currency}
                  onChange={handle_currency_change}
                >
                  {SUPPORTED_CURRENCIES.map((entry) => (
                    <option key={entry.code} value={entry.code}>
                      {entry.label}
                    </option>
                  ))}
                </select>
              </>
            )}
          </p>
        </ModalBody>

        <ModalFooter
          className={cn(
            "flex items-center justify-between gap-3 border-t transition-colors",
            has_more_below ? "border-edge-secondary" : "border-transparent",
          )}
        >
          {is_storage ? (
            <Button
              disabled={is_starting}
              size="sm"
              variant="ghost"
              onClick={handle_buy_storage}
            >
              {t("settings.upgrade_buy_storage")}
            </Button>
          ) : (
            <Button
              disabled={is_starting}
              size="sm"
              variant="ghost"
              onClick={handle_compare_plans}
            >
              {t("settings.compare_all_features")}
            </Button>
          )}
          <span className="flex items-center gap-1">
            {is_starting && <Spinner size="xs" />}
            <Button
              disabled={is_starting}
              size="sm"
              variant="ghost"
              onClick={close_upgrade_modal}
            >
              {t("common.not_now")}
            </Button>
          </span>
        </ModalFooter>
      </Modal>

      {pending_tier && (
        <PlanPaymentMethodModal
          busy={is_starting}
          comparison_plan_code={pending_tier.id}
          features={tier_features(pending_tier)
            .filter((feature) => feature.on)
            .map((feature) => ({ label: feature.label }))}
          on_choose_card={(id) => void handle_choose_card(id)}
          on_choose_crypto={handle_choose_crypto}
          on_close={() => {
            if (is_starting) return;
            if (is_resume_review) {
              close_resume_review();

              return;
            }
            set_pending_tier(null);
          }}
          on_select_plan={(id) => {
            const next = tiers.find((tier) => tier.id === id);

            if (next) set_pending_tier(next);
          }}
          on_select_term={set_term_id}
          open={!!pending_tier}
          plan_choices={tiers.map((tier) => ({
            id: tier.id,
            name: tier.name,
            is_recommended: tier.id === default_tier?.id,
            price_label: `${price_label(tier)}${t("settings.per_month_short")}`,
          }))}
          plan_name={pending_tier.name}
          selected_plan_id={pending_tier.id}
          selected_term={term_id}
          term_options={[
            {
              id: "monthly",
              label: t("settings.billing_monthly"),
              per_month_cents: pending_tier.monthly_cents,
              total_cents: pending_tier.monthly_cents,
              save_cents: 0,
            },
            {
              id: "yearly",
              label: t("settings.billing_yearly"),
              per_month_cents: Math.round(pending_tier.yearly_cents / 12),
              total_cents: pending_tier.yearly_cents,
              save_cents:
                pending_tier.monthly_cents * 12 - pending_tier.yearly_cents,
            },
            {
              id: "biennial",
              label: t("settings.biennial"),
              crypto_only: true,
              per_month_cents: Math.round(pending_tier.biennial_cents / 24),
              total_cents: pending_tier.biennial_cents,
              save_cents:
                pending_tier.monthly_cents * 24 - pending_tier.biennial_cents,
            },
          ]}
        />
      )}

      <PlanFeaturesModal
        highlight_plan_code={pending_tier?.id ?? default_tier?.id ?? null}
        is_open={compare_open}
        on_close={() => set_compare_open(false)}
        z_index={80}
      />

      {plan_change_target && (
        <PlanChangeConfirmModal
          billing_interval={plan_change_target.billing}
          is_confirming={is_starting}
          on_close={() => {
            if (is_starting) return;
            const tier = plan_change_target.tier;

            set_plan_change_target(null);
            set_pending_tier(tier);
          }}
          on_confirm={(promo_code) =>
            void start_plan_change(
              plan_change_target.tier,
              plan_change_target.billing,
              promo_code,
            )
          }
          open={!!plan_change_target}
          plan_code={plan_change_target.tier.id}
          plan_name={plan_change_target.tier.name}
        />
      )}

      {crypto_tier && (
        <CryptoTermModal
          initial_term_months={crypto_term_months}
          is_open={!!crypto_tier}
          monthly_price_cents={crypto_tier.monthly_cents}
          on_checkout_opened={() => {
            if (is_desktop()) pending_desktop_checkout_ref.current = true;
          }}
          on_close={() => {
            const tier = crypto_tier;

            set_crypto_tier(null);
            set_pending_tier(tier);
          }}
          on_finished={() => {
            set_crypto_tier(null);
            if (is_resume_review) close_resume_review();
          }}
          on_native_invoice={(invoice_id) => {
            close_upgrade_modal();
            navigate(`/crypto-invoice/${invoice_id}`);
          }}
          plan_code={crypto_tier.id}
          plan_name={crypto_tier.name}
          preferred_currency={currency}
          yearly_price_cents={crypto_tier.yearly_cents}
        />
      )}
    </>
  );
}
