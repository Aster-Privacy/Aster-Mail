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
import type { ExtractedPurchaseDetails } from "@/services/extraction/types";
import type { ReactNode } from "react";

import { useId, useState } from "react";
import {
  HandThumbDownIcon,
  HandThumbUpIcon,
  InformationCircleIcon,
  ReceiptPercentIcon,
} from "@heroicons/react/24/outline";
import {
  HandThumbDownIcon as HandThumbDownIconSolid,
  HandThumbUpIcon as HandThumbUpIconSolid,
} from "@heroicons/react/24/solid";
import { IslandDivider, IslandIconButton, Tooltip } from "@aster/ui";

import { ExtractionCard } from "./extraction_card";

import { use_i18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import {
  apply_receipt_review,
  confirm_receipt,
  hide_receipt,
  save_receipt_correction,
  type ReceiptReview,
} from "@/services/extraction/review_store";

const COLLAPSED_PREF_KEY = "receipt_banner_collapsed";
const MAX_VISIBLE_ITEMS = 6;
const MAX_FIELD_LENGTH = 80;

function read_collapsed_pref(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_PREF_KEY) === "1";
  } catch {
    return false;
  }
}

function write_collapsed_pref(collapsed: boolean) {
  try {
    localStorage.setItem(COLLAPSED_PREF_KEY, collapsed ? "1" : "0");
  } catch {
    return;
  }
}

interface LedgerRowProps {
  label: ReactNode;
  value: ReactNode;
  emphasis?: boolean;
  test_id?: string;
}

function LedgerRow({ label, value, emphasis, test_id }: LedgerRowProps) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4 text-sm",
        emphasis ? "text-txt-primary font-semibold" : "text-txt-secondary",
      )}
      data-testid={test_id}
    >
      <span className="min-w-0 truncate">{label}</span>
      <span className="shrink-0 tabular-nums">{value}</span>
    </div>
  );
}

interface DetailRowProps {
  label: string;
  value: ReactNode;
  test_id?: string;
}

function DetailRow({ label, value, test_id }: DetailRowProps) {
  return (
    <div
      className="flex items-baseline justify-between gap-4 text-sm"
      data-testid={test_id}
    >
      <span className="shrink-0 text-txt-muted">{label}</span>
      <span className="min-w-0 truncate text-end text-txt-primary">
        {value}
      </span>
    </div>
  );
}

interface ReviewFormProps {
  merchant_name: string;
  order_id: string;
  on_save: (merchant_name: string, order_id: string) => void;
  on_cancel: () => void;
  on_hide: () => void;
}

function ReviewForm({
  merchant_name,
  order_id,
  on_save,
  on_cancel,
  on_hide,
}: ReviewFormProps) {
  const { t } = use_i18n();
  const field_id = useId();
  const [merchant_value, set_merchant_value] = useState(merchant_name);
  const [order_value, set_order_value] = useState(order_id);

  const input_class =
    "h-9 w-full rounded-[var(--aster-radius-item)] border-0 bg-[var(--aster-field-bg)] px-3 text-sm text-txt-primary outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]";

  return (
    <form
      className="px-4 py-3"
      data-testid="purchase_review_form"
      onSubmit={(event) => {
        event.preventDefault();
        on_save(merchant_value, order_value);
      }}
    >
      <p className="text-sm font-medium text-txt-primary">
        {t("mail.receipt_review_title")}
      </p>
      <div className="mt-3 grid gap-3 @md:grid-cols-2">
        <label className="flex flex-col gap-1" htmlFor={`${field_id}_merchant`}>
          <span className="text-xs text-txt-muted">{t("mail.merchant")}</span>
          <input
            autoComplete="off"
            className={input_class}
            data-testid="purchase_review_merchant"
            id={`${field_id}_merchant`}
            maxLength={MAX_FIELD_LENGTH}
            type="text"
            value={merchant_value}
            onChange={(event) => set_merchant_value(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1" htmlFor={`${field_id}_order`}>
          <span className="text-xs text-txt-muted">
            {t("mail.order_number_label")}
          </span>
          <input
            autoComplete="off"
            className={input_class}
            data-testid="purchase_review_order_id"
            id={`${field_id}_order`}
            maxLength={MAX_FIELD_LENGTH}
            type="text"
            value={order_value}
            onChange={(event) => set_order_value(event.target.value)}
          />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          className="aster_btn aster_btn_primary aster_btn_sm"
          data-testid="purchase_review_save"
          type="submit"
        >
          {t("common.save")}
        </button>
        <button
          className="aster_btn aster_btn_ghost aster_btn_sm"
          type="button"
          onClick={on_cancel}
        >
          {t("common.cancel")}
        </button>
        <button
          className="aster_btn aster_btn_ghost aster_btn_sm ms-auto text-txt-muted"
          data-testid="purchase_review_hide"
          type="button"
          onClick={on_hide}
        >
          {t("mail.receipt_review_hide")}
        </button>
      </div>
    </form>
  );
}

interface PurchaseDetailsBannerProps {
  details: ExtractedPurchaseDetails;
  email_id?: string;
  className?: string;
}

export function PurchaseDetailsBanner({
  details: extracted,
  email_id,
  className,
}: PurchaseDetailsBannerProps) {
  const { t } = use_i18n();
  const [is_collapsed, set_is_collapsed] = useState(read_collapsed_pref);
  const [review_state, set_review_state] = useState<{
    email_id: string | undefined;
    review: ReceiptReview | null;
    editing: boolean;
  }>(() => ({
    email_id,
    review: apply_receipt_review(extracted, email_id).review,
    editing: false,
  }));

  if (review_state.email_id !== email_id) {
    set_review_state({
      email_id,
      review: apply_receipt_review(extracted, email_id).review,
      editing: false,
    });
  }

  const applied = apply_receipt_review(extracted, email_id);
  const details = applied.details;
  const review = review_state.review;

  if (review?.hidden) return null;

  const clean_items = details.items.filter(
    (item) => item.name && item.name.trim().length > 0,
  );

  const has_meaningful_data =
    details.order_id ||
    details.total ||
    clean_items.length > 0 ||
    details.merchant_name;

  if (!has_meaningful_data) return null;

  const toggle_collapsed = () => {
    set_is_collapsed((prev) => {
      write_collapsed_pref(!prev);

      return !prev;
    });
  };

  const is_receipt = details.document_kind === "receipt";
  const title = details.merchant_name
    ? t(is_receipt ? "mail.receipt_from" : "mail.order_from", {
        merchant: details.merchant_name,
      })
    : t("mail.order_details");
  const number_label = details.order_id
    ? t(is_receipt ? "mail.receipt_number" : "mail.order_number", {
        id: details.order_id,
      })
    : null;
  const subtitle =
    [number_label, details.order_date].filter(Boolean).join(" · ") || undefined;

  const amount_rows: { label: string; amount: string }[] = [];

  if (details.subtotal)
    amount_rows.push({
      label: t("common.subtotal"),
      amount: details.subtotal.formatted,
    });
  if (details.shipping_cost)
    amount_rows.push({
      label: t("common.shipping"),
      amount: details.shipping_cost.formatted,
    });
  if (details.tax)
    amount_rows.push({ label: t("common.tax"), amount: details.tax.formatted });
  if (details.discount)
    amount_rows.push({
      label: t("common.discount"),
      amount: `−${details.discount.formatted}`,
    });

  const payment = details.card_last_four
    ? t("mail.card_ending_in", { last_four: details.card_last_four })
    : details.payment_method;

  const handle_confirm = () => {
    set_review_state({
      email_id,
      review: confirm_receipt(email_id),
      editing: false,
    });
  };

  const handle_hide = () => {
    set_review_state({
      email_id,
      review: hide_receipt(email_id),
      editing: false,
    });
  };

  const handle_save = (merchant_name: string, order_id: string) => {
    set_review_state({
      email_id,
      review: save_receipt_correction(email_id, extracted.merchant_source, {
        merchant_name,
        order_id,
      }),
      editing: false,
    });
  };

  const is_confirmed = review?.confirmed === true;
  const is_corrected = Boolean(review?.merchant_name || review?.order_id);
  const info_text = is_corrected
    ? t("mail.receipt_review_saved")
    : t("mail.purchase_extraction_privacy");
  const sections: ReactNode[] = [];

  if (clean_items.length > 0)
    sections.push(
      <div
        key="items"
        className="px-4 py-3 space-y-1.5"
        data-testid="purchase_items_row"
      >
        {clean_items.slice(0, MAX_VISIBLE_ITEMS).map((item, index) => (
          <LedgerRow
            key={index}
            label={
              <>
                <span className="text-txt-primary">{item.name}</span>
                {item.quantity && item.quantity > 1 && (
                  <span className="ms-2 text-txt-muted">× {item.quantity}</span>
                )}
              </>
            }
            value={item.total_price?.formatted ?? ""}
          />
        ))}
        {clean_items.length > MAX_VISIBLE_ITEMS && (
          <p className="text-xs text-txt-muted">
            {t("mail.more_items_count", {
              count: clean_items.length - MAX_VISIBLE_ITEMS,
            })}
          </p>
        )}
      </div>,
    );

  if (amount_rows.length > 0 || details.total)
    sections.push(
      <div
        key="amounts"
        className="px-4 py-3 space-y-1.5"
        data-testid="purchase_total_row"
      >
        {amount_rows.map((row) => (
          <LedgerRow key={row.label} label={row.label} value={row.amount} />
        ))}
        {details.total && (
          <LedgerRow
            emphasis
            label={t("common.total")}
            value={details.total.formatted}
          />
        )}
      </div>,
    );

  sections.push(
    <div key="details" className="px-4 py-3 space-y-1.5">
      {details.merchant_name && (
        <DetailRow
          label={t("mail.merchant")}
          test_id="purchase_merchant_row"
          value={details.merchant_name}
        />
      )}
      {details.order_id && (
        <DetailRow
          label={t("mail.order_number_label")}
          test_id="purchase_order_id_row"
          value={details.order_id}
        />
      )}
      {details.order_date && (
        <DetailRow label={t("mail.date")} value={details.order_date} />
      )}
      {payment && (
        <DetailRow label={t("mail.receipt_payment")} value={payment} />
      )}
    </div>,
  );

  sections.push(
    review_state.editing ? (
      <ReviewForm
        key="form"
        merchant_name={details.merchant_name ?? ""}
        on_cancel={() =>
          set_review_state((prev) => ({ ...prev, editing: false }))
        }
        on_hide={handle_hide}
        on_save={handle_save}
        order_id={details.order_id ?? ""}
      />
    ) : (
      <div
        key="footer"
        className="px-2 py-1 flex items-center gap-0.5"
        data-testid="purchase_review_footer"
      >
        <Tooltip tip={info_text}>
          <IslandIconButton label={info_text} size="sm" type="button">
            <InformationCircleIcon strokeWidth={1.75} />
          </IslandIconButton>
        </Tooltip>
        <span className="flex-1" />
        <Tooltip tip={t("mail.receipt_review_looks_right")}>
          <IslandIconButton
            active={is_confirmed}
            data-testid="purchase_review_confirm"
            label={t("mail.receipt_review_looks_right")}
            size="sm"
            type="button"
            onClick={handle_confirm}
          >
            {is_confirmed ? (
              <HandThumbUpIconSolid />
            ) : (
              <HandThumbUpIcon strokeWidth={1.75} />
            )}
          </IslandIconButton>
        </Tooltip>
        <Tooltip tip={t("mail.receipt_review_not_right")}>
          <IslandIconButton
            active={is_corrected}
            data-testid="purchase_review_edit"
            label={t("mail.receipt_review_not_right")}
            size="sm"
            type="button"
            onClick={() =>
              set_review_state((prev) => ({ ...prev, editing: true }))
            }
          >
            {is_corrected ? (
              <HandThumbDownIconSolid />
            ) : (
              <HandThumbDownIcon strokeWidth={1.75} />
            )}
          </IslandIconButton>
        </Tooltip>
      </div>
    ),
  );

  return (
    <ExtractionCard
      className={className}
      is_collapsed={is_collapsed}
      leading={
        <ReceiptPercentIcon
          aria-hidden="true"
          className="w-5 h-5 text-txt-secondary"
          strokeWidth={1.75}
        />
      }
      on_toggle={toggle_collapsed}
      subtitle={subtitle}
      test_id="purchase_details_card"
      title={title}
      toggle_label={
        is_collapsed ? t("mail.show_details") : t("mail.hide_details")
      }
      trailing={details.total?.formatted}
    >
      {sections.map((section, index) => (
        <div key={index}>
          {index > 0 && <IslandDivider />}
          {section}
        </div>
      ))}
    </ExtractionCard>
  );
}
