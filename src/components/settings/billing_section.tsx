import { useEffect, useState, useCallback } from "react";
import {
  CheckIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  get_subscription,
  get_available_plans,
  create_checkout_session,
  create_portal_session,
  get_billing_history,
  cancel_subscription,
  reactivate_subscription,
  format_storage,
  format_price,
  format_date,
  type SubscriptionResponse,
  type AvailablePlan,
  type BillingHistoryItem,
} from "@/services/api/billing";
import { use_mail_stats } from "@/hooks/use_mail_stats";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { show_toast } from "@/components/toast/simple_toast";

const TRUSTED_REDIRECT_DOMAINS = ["checkout.stripe.com", "billing.stripe.com"];

function is_safe_redirect_url(url: string): boolean {
  try {
    const parsed = new URL(url);

    if (parsed.protocol !== "https:") return false;

    return TRUSTED_REDIRECT_DOMAINS.some(
      (domain) =>
        parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`),
    );
  } catch {
    return false;
  }
}

export function BillingSection() {
  const { stats } = use_mail_stats();
  const [subscription, set_subscription] =
    useState<SubscriptionResponse | null>(null);
  const [plans, set_plans] = useState<AvailablePlan[]>([]);
  const [history, set_history] = useState<BillingHistoryItem[]>([]);
  const [is_action_loading, set_is_action_loading] = useState(false);
  const [show_cancel_dialog, set_show_cancel_dialog] = useState(false);
  const [show_upgrade_dialog, set_show_upgrade_dialog] = useState(false);
  const [selected_plan, set_selected_plan] = useState<AvailablePlan | null>(
    null,
  );

  const storage_limit_bytes =
    stats.storage_total_bytes ||
    subscription?.storage.total_limit_bytes ||
    1024 * 1024 * 1024;
  const storage_used_bytes = stats.storage_used_bytes;
  const storage_percentage = Math.min(
    100,
    (storage_used_bytes / storage_limit_bytes) * 100,
  );
  const is_storage_over_limit = storage_used_bytes > storage_limit_bytes;

  const load_data = useCallback(async () => {
    try {
      const [sub_response, plans_response, history_response] =
        await Promise.all([
          get_subscription(),
          get_available_plans(),
          get_billing_history(1, 10),
        ]);

      if (sub_response.data) {
        set_subscription(sub_response.data);
      }
      if (plans_response.data) {
        set_plans(plans_response.data.plans);
      }
      if (history_response.data) {
        set_history(history_response.data.items);
      }
    } catch {
      return;
    }
  }, []);

  useEffect(() => {
    load_data();
  }, [load_data]);

  const handle_upgrade = async (plan: AvailablePlan) => {
    if (!plan.stripe_price_id) {
      show_toast("This plan is not available for purchase", "warning");

      return;
    }

    set_is_action_loading(true);
    try {
      const response = await create_checkout_session(plan.id);

      if (response.data?.url && is_safe_redirect_url(response.data.url)) {
        window.location.href = response.data.url;
      } else {
        show_toast("Failed to create checkout session", "error");
      }
    } catch {
      show_toast("Failed to start checkout process", "error");
    } finally {
      set_is_action_loading(false);
    }
  };

  const handle_manage_billing = async () => {
    set_is_action_loading(true);
    try {
      const response = await create_portal_session();

      if (response.data?.url && is_safe_redirect_url(response.data.url)) {
        window.location.href = response.data.url;
      } else {
        show_toast("Failed to open billing portal", "error");
      }
    } catch {
      show_toast("Failed to open billing portal", "error");
    } finally {
      set_is_action_loading(false);
    }
  };

  const handle_cancel = async () => {
    set_is_action_loading(true);
    try {
      const response = await cancel_subscription();

      if (response.data) {
        show_toast(
          "Subscription will be cancelled at the end of the billing period",
          "success",
        );
        await load_data();
      } else {
        show_toast("Failed to cancel subscription", "error");
      }
    } catch {
      show_toast("Failed to cancel subscription", "error");
    } finally {
      set_is_action_loading(false);
      set_show_cancel_dialog(false);
    }
  };

  const handle_reactivate = async () => {
    set_is_action_loading(true);
    try {
      const response = await reactivate_subscription();

      if (response.data) {
        show_toast("Subscription reactivated", "success");
        await load_data();
      } else {
        show_toast("Failed to reactivate subscription", "error");
      }
    } catch {
      show_toast("Failed to reactivate subscription", "error");
    } finally {
      set_is_action_loading(false);
    }
  };

  const is_paid_plan = subscription && subscription.plan.code !== "free";
  const is_over_limit = is_storage_over_limit;

  return (
    <div className="space-y-6">
      {is_over_limit && (
        <div
          className="p-4 rounded-lg border flex items-start gap-3"
          style={{
            backgroundColor: "var(--bg-tertiary)",
            borderColor: "var(--destructive)",
          }}
        >
          <ExclamationTriangleIcon
            className="w-5 h-5 flex-shrink-0 mt-0.5"
            style={{ color: "var(--destructive)" }}
          />
          <div>
            <p
              className="text-sm font-medium"
              style={{ color: "var(--destructive)" }}
            >
              Storage Limit Exceeded
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              Upgrade your plan or delete some emails to continue receiving
              mail.
            </p>
          </div>
        </div>
      )}

      <div
        className="p-5 rounded-lg border"
        style={{
          backgroundColor: "var(--bg-tertiary)",
          borderColor: "var(--border-secondary)",
        }}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <p
              className="text-sm font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              Current Plan
            </p>
            <h3
              className="text-xl font-semibold mt-1"
              style={{ color: "var(--text-primary)" }}
            >
              {subscription?.plan.name || "Free"}
            </h3>
            {subscription?.plan.description && (
              <p
                className="text-xs mt-1"
                style={{ color: "var(--text-muted)" }}
              >
                {subscription.plan.description}
              </p>
            )}
          </div>
          {is_paid_plan && (
            <div className="text-right">
              <p
                className="text-lg font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                {format_price(subscription.plan.price_cents)}
                <span
                  className="text-xs font-normal"
                  style={{ color: "var(--text-muted)" }}
                >
                  /{subscription.plan.billing_period || "month"}
                </span>
              </p>
              {subscription.current_period_end && (
                <p
                  className="text-xs mt-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  {subscription.cancel_at_period_end ? "Cancels" : "Renews"}{" "}
                  {format_date(subscription.current_period_end)}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              Storage
            </span>
            <span
              className="text-xs"
              style={{ color: "var(--text-secondary)" }}
            >
              {format_storage(storage_used_bytes)} /{" "}
              {format_storage(storage_limit_bytes)}
            </span>
          </div>
          <Progress
            className={`h-2 ${is_over_limit ? "[&>div]:bg-red-500" : ""}`}
            value={storage_percentage}
          />
          {subscription && subscription.storage.referral_bonus_bytes > 0 && (
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Includes{" "}
              {format_storage(subscription.storage.referral_bonus_bytes)}{" "}
              referral bonus
            </p>
          )}
        </div>

        {is_paid_plan && (
          <div className="flex gap-2 mt-4 pt-4">
            <Button
              className="flex-1"
              disabled={is_action_loading}
              variant="outline"
              onClick={handle_manage_billing}
            >
              Manage Payment
            </Button>
            {subscription.cancel_at_period_end ? (
              <Button
                className="flex-1"
                disabled={is_action_loading}
                variant="primary"
                onClick={handle_reactivate}
              >
                Reactivate
              </Button>
            ) : (
              <Button
                className="flex-1"
                disabled={is_action_loading}
                variant="ghost"
                onClick={() => set_show_cancel_dialog(true)}
              >
                Cancel Plan
              </Button>
            )}
          </div>
        )}
      </div>

      <div>
        <p
          className="text-sm font-medium mb-3"
          style={{ color: "var(--text-primary)" }}
        >
          Available Plans
        </p>
        <div className="grid gap-3">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className="p-4 rounded-lg border transition-colors hover:bg-[var(--bg-hover)]"
              style={{
                backgroundColor: plan.is_current
                  ? "var(--bg-tertiary)"
                  : undefined,
                borderColor: "var(--border-secondary)",
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4
                      className="text-sm font-medium"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {plan.name}
                    </h4>
                    {plan.is_current && (
                      <span className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-[var(--bg-secondary)] text-[var(--text-secondary)]">
                        <CheckIcon className="w-3 h-3" />
                        Current
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 mt-1.5">
                    <span
                      className="text-xs"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {format_storage(plan.storage_limit_bytes)} storage
                    </span>
                    <span
                      className="text-xs"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {plan.max_email_aliases} aliases
                    </span>
                    <span
                      className="text-xs"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {plan.max_custom_domains} domain
                      {plan.max_custom_domains !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <p
                    className="text-sm font-semibold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {plan.price_cents === 0
                      ? "Free"
                      : format_price(plan.price_cents)}
                    {plan.price_cents > 0 && (
                      <span
                        className="text-xs font-normal"
                        style={{ color: "var(--text-muted)" }}
                      >
                        /{plan.billing_period || "mo"}
                      </span>
                    )}
                  </p>
                  {!plan.is_current &&
                    plan.price_cents > 0 &&
                    plan.stripe_price_id && (
                      <Button
                        className="h-8 px-4 text-xs"
                        disabled={is_action_loading}
                        variant="primary"
                        onClick={() => {
                          set_selected_plan(plan);
                          set_show_upgrade_dialog(true);
                        }}
                      >
                        {(subscription?.plan.price_cents || 0) >
                        plan.price_cents
                          ? "Downgrade"
                          : "Upgrade"}
                      </Button>
                    )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {history.length > 0 && (
        <div>
          <p
            className="text-sm font-medium mb-3"
            style={{ color: "var(--text-primary)" }}
          >
            Billing History
          </p>
          <div
            className="rounded-lg border overflow-hidden"
            style={{ borderColor: "var(--border-secondary)" }}
          >
            <div>
              {history.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between px-4 py-3 hover:bg-[var(--bg-hover)] transition-colors"
                >
                  <div>
                    <p
                      className="text-sm"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {item.description || item.plan_name || "Payment"}
                    </p>
                    <p
                      className="text-xs mt-0.5"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {format_date(item.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded ${
                        item.status === "paid"
                          ? "bg-green-500/20 text-green-500"
                          : item.status === "failed"
                            ? "bg-red-500/20 text-red-500"
                            : "bg-yellow-500/20 text-yellow-500"
                      }`}
                    >
                      {item.status}
                    </span>
                    <p
                      className="text-sm font-medium"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {format_price(item.amount_cents, item.currency)}
                    </p>
                    {item.invoice_pdf_url && (
                      <a
                        className="text-xs text-blue-500 hover:underline"
                        href={item.invoice_pdf_url}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        PDF
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <AlertDialog
        open={show_cancel_dialog}
        onOpenChange={set_show_cancel_dialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Subscription</AlertDialogTitle>
            <AlertDialogDescription>
              Your subscription will remain active until the end of the current
              billing period. After that, you will be moved to the free plan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Plan</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 hover:bg-red-600"
              onClick={handle_cancel}
            >
              {is_action_loading ? "Cancelling..." : "Cancel Subscription"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={show_upgrade_dialog}
        onOpenChange={set_show_upgrade_dialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {(subscription?.plan.price_cents || 0) >
              (selected_plan?.price_cents || 0)
                ? "Downgrade"
                : "Upgrade"}{" "}
              to {selected_plan?.name}
            </AlertDialogTitle>
            <AlertDialogDescription>
              You will be redirected to our secure payment provider to complete
              your purchase.
              {selected_plan && (
                <span className="block mt-2 font-medium">
                  {format_price(selected_plan.price_cents)}/
                  {selected_plan.billing_period || "month"}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (selected_plan) {
                  handle_upgrade(selected_plan);
                }
                set_show_upgrade_dialog(false);
              }}
            >
              {is_action_loading ? "Loading..." : "Continue to Checkout"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
