import { motion } from "framer-motion";
import {
  CheckIcon,
  XMarkIcon,
  ArrowLeftIcon,
} from "@heroicons/react/24/outline";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PlansComparisonProps {
  selected_plan: "free" | "starter" | "pro";
  on_select: (plan: "free" | "starter" | "pro") => void;
  on_back: () => void;
  on_continue: () => void;
}

interface FeatureRow {
  name: string;
  free: string | boolean;
  starter: string | boolean;
  pro: string | boolean;
  category?: string;
}

const features: FeatureRow[] = [
  { category: "Storage & Limits", name: "", free: "", starter: "", pro: "" },
  { name: "Secure storage", free: "1 GB", starter: "10 GB", pro: "50 GB" },
  {
    name: "Max attachment size",
    free: "25 MB",
    starter: "50 MB",
    pro: "100 MB",
  },
  {
    name: "Daily send limit",
    free: "100 emails",
    starter: "500 emails",
    pro: "Unlimited",
  },
  {
    name: "Email retention",
    free: "Unlimited",
    starter: "Unlimited",
    pro: "Unlimited",
  },

  { category: "Email Features", name: "", free: "", starter: "", pro: "" },
  { name: "End-to-end encryption", free: true, starter: true, pro: true },
  { name: "Zero-knowledge architecture", free: true, starter: true, pro: true },
  { name: "Email aliases", free: "3", starter: "5", pro: "10" },
  { name: "Custom domains", free: "1", starter: "2", pro: "5" },
  { name: "Scheduled sending", free: true, starter: true, pro: true },
  {
    name: "Undo send",
    free: "10 seconds",
    starter: "30 seconds",
    pro: "60 seconds",
  },
  { name: "Read receipts", free: false, starter: true, pro: true },
  { name: "Email templates", free: "5", starter: "25", pro: "Unlimited" },
  { name: "Auto-responder", free: false, starter: true, pro: true },

  { category: "Organization", name: "", free: "", starter: "", pro: "" },
  { name: "Folders", free: "10", starter: "50", pro: "Unlimited" },
  { name: "Labels", free: "20", starter: "100", pro: "Unlimited" },
  { name: "Smart folders", free: false, starter: true, pro: true },
  { name: "Advanced search", free: true, starter: true, pro: true },
  {
    name: "Search history",
    free: "30 days",
    starter: "1 year",
    pro: "Unlimited",
  },
  { name: "Contacts", free: "250", starter: "2,500", pro: "Unlimited" },
  { name: "Contact groups", free: "5", starter: "25", pro: "Unlimited" },

  { category: "Security", name: "", free: "", starter: "", pro: "" },
  { name: "Two-factor authentication", free: true, starter: true, pro: true },
  { name: "Recovery codes", free: true, starter: true, pro: true },
  { name: "Password-protected folders", free: false, starter: true, pro: true },
  { name: "Session management", free: true, starter: true, pro: true },
  { name: "Login notifications", free: true, starter: true, pro: true },
  { name: "Encrypted exports", free: false, starter: true, pro: true },
  { name: "Hardware key support", free: false, starter: false, pro: true },

  { category: "Privacy", name: "", free: "", starter: "", pro: "" },
  { name: "No ads", free: true, starter: true, pro: true },
  { name: "No tracking", free: true, starter: true, pro: true },
  { name: "Anonymous sign-up", free: true, starter: true, pro: true },
  { name: "Tor support", free: true, starter: true, pro: true },
  { name: "Link tracking protection", free: true, starter: true, pro: true },
  { name: "Remote image blocking", free: true, starter: true, pro: true },

  { category: "Import & Export", name: "", free: "", starter: "", pro: "" },
  { name: "Import from Gmail", free: true, starter: true, pro: true },
  { name: "Import from Outlook", free: true, starter: true, pro: true },
  { name: "MBOX import", free: true, starter: true, pro: true },
  { name: "Export emails", free: true, starter: true, pro: true },
  { name: "Export contacts", free: true, starter: true, pro: true },

  { category: "Support", name: "", free: "", starter: "", pro: "" },
  { name: "Help center access", free: true, starter: true, pro: true },
  { name: "Community forum", free: true, starter: true, pro: true },
  { name: "Email support", free: false, starter: true, pro: true },
  { name: "Priority support", free: false, starter: false, pro: true },
  { name: "Response time", free: "-", starter: "48 hours", pro: "24 hours" },

  { category: "Apps & Integrations", name: "", free: "", starter: "", pro: "" },
  { name: "Web app", free: true, starter: true, pro: true },
  { name: "iOS app", free: true, starter: true, pro: true },
  { name: "Android app", free: true, starter: true, pro: true },
  { name: "Desktop app", free: true, starter: true, pro: true },
  { name: "Browser extension", free: true, starter: true, pro: true },
  { name: "IMAP/SMTP access", free: false, starter: true, pro: true },
  { name: "CalDAV calendar", free: false, starter: true, pro: true },
  { name: "API access", free: false, starter: false, pro: true },
];

const plans = [
  {
    key: "free" as const,
    label: "Personal",
    price: "Free",
    period: "for life",
  },
  { key: "starter" as const, label: "Starter", price: "$10", period: "/month" },
  { key: "pro" as const, label: "Pro", price: "$20", period: "/month" },
];

function FeatureCheck({ included }: { included: boolean }) {
  if (included) {
    return (
      <CheckIcon
        className="w-5 h-5 mx-auto text-emerald-500"
        strokeWidth={2.5}
      />
    );
  }

  return (
    <XMarkIcon
      className="w-5 h-5 mx-auto text-[var(--text-muted)]"
      strokeWidth={2}
    />
  );
}

function FeatureValue({ value }: { value: string | boolean }) {
  if (typeof value === "boolean") {
    return <FeatureCheck included={value} />;
  }

  return (
    <span className="text-sm text-[var(--text-primary)] font-medium">
      {value}
    </span>
  );
}

function MobilePlanCard({
  plan,
  selected,
  on_select,
}: {
  plan: (typeof plans)[0];
  selected: boolean;
  on_select: () => void;
}) {
  const plan_features = features.filter((f) => !f.category);

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all border-2 bg-[var(--bg-card)]",
        selected
          ? "border-[var(--accent-blue)] shadow-[0_0_0_1px_var(--accent-blue),0_4px_12px_rgba(59,130,246,0.15)]"
          : "border-[var(--border-primary)]",
      )}
      onClick={on_select}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div
              className={cn(
                "text-xs font-medium mb-1",
                plan.key === "free"
                  ? "text-[var(--accent-blue)]"
                  : "text-[var(--text-tertiary)]",
              )}
            >
              {plan.label}
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold text-[var(--text-primary)]">
                {plan.price}
              </span>
              <span className="text-sm text-[var(--text-tertiary)]">
                {plan.period}
              </span>
            </div>
          </div>
          {selected && (
            <div className="w-6 h-6 rounded-full bg-[var(--accent-blue)] flex items-center justify-center">
              <CheckIcon className="w-4 h-4 text-white" strokeWidth={2.5} />
            </div>
          )}
        </div>

        <div className="space-y-2 pt-3 border-t border-[var(--border-primary)]">
          {plan_features.slice(0, 8).map((feature, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between text-sm"
            >
              <span className="text-[var(--text-secondary)]">
                {feature.name}
              </span>
              <span className="text-[var(--text-primary)] font-medium">
                <FeatureValue value={feature[plan.key]} />
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function MobileFeatureCategory({
  category,
  feature_rows,
  selected_plan,
}: {
  category: string;
  feature_rows: FeatureRow[];
  selected_plan: "free" | "starter" | "pro";
}) {
  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">
        {category}
      </h3>
      <div className="space-y-2">
        {feature_rows.map((row, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between py-2 border-b border-[var(--border-primary)]"
          >
            <span className="text-sm text-[var(--text-secondary)]">
              {row.name}
            </span>
            <span className="text-sm text-[var(--text-primary)] font-medium">
              <FeatureValue value={row[selected_plan]} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PlansComparison({
  selected_plan,
  on_select,
  on_back,
  on_continue,
}: PlansComparisonProps) {
  const grouped_features = features.reduce(
    (acc, row) => {
      if (row.category) {
        acc.push({ category: row.category, rows: [] });
      } else if (acc.length > 0) {
        acc[acc.length - 1].rows.push(row);
      }

      return acc;
    },
    [] as { category: string; rows: FeatureRow[] }[],
  );

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex flex-col bg-[var(--bg-primary)]"
      initial={{ opacity: 0 }}
    >
      <div className="flex items-center justify-between px-4 md:px-6 py-4 border-b border-[var(--border-primary)]">
        <Button
          className="gap-1 md:gap-2 text-[var(--text-tertiary)] px-2 md:px-4"
          variant="ghost"
          onClick={on_back}
        >
          <ArrowLeftIcon className="w-4 h-4" />
          <span className="hidden sm:inline">Back to plans</span>
          <span className="sm:hidden">Back</span>
        </Button>
        <h1 className="text-base md:text-lg font-semibold text-[var(--text-primary)] hidden sm:block">
          Compare all features
        </h1>
        <Button className="px-3 md:px-4 text-sm" onClick={on_continue}>
          <span className="hidden sm:inline">
            Continue with{" "}
            {selected_plan === "free"
              ? "Free"
              : selected_plan === "starter"
                ? "Starter"
                : "Pro"}
          </span>
          <span className="sm:hidden">Continue</span>
        </Button>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="md:hidden px-4 py-6">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4 text-center">
            Select your plan
          </h2>
          <div className="space-y-3 mb-8">
            {plans.map((plan) => (
              <MobilePlanCard
                key={plan.key}
                on_select={() => on_select(plan.key)}
                plan={plan}
                selected={selected_plan === plan.key}
              />
            ))}
          </div>

          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
            {selected_plan === "free"
              ? "Personal"
              : selected_plan === "starter"
                ? "Starter"
                : "Pro"}{" "}
            features
          </h2>
          {grouped_features.map((group, idx) => (
            <MobileFeatureCategory
              key={idx}
              category={group.category}
              feature_rows={group.rows}
              selected_plan={selected_plan}
            />
          ))}

          <div className="mt-8 text-center">
            <p className="text-sm mb-4 text-[var(--text-tertiary)]">
              All plans include our core privacy and security features.
            </p>
            <Button className="w-full" size="lg" onClick={on_continue}>
              Continue with{" "}
              {selected_plan === "free"
                ? "Free"
                : selected_plan === "starter"
                  ? "Starter"
                  : "Pro"}
            </Button>
          </div>
        </div>

        <div className="hidden md:block max-w-5xl mx-auto px-6 py-8">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="text-left py-4 px-4 w-1/3">
                    <span className="text-sm font-medium text-[var(--text-tertiary)]">
                      Features
                    </span>
                  </th>
                  {plans.map((plan) => (
                    <th
                      key={plan.key}
                      className="text-center py-4 px-2 w-[22%]"
                    >
                      <Card
                        className={cn(
                          "cursor-pointer transition-all border-2 bg-[var(--bg-card)]",
                          selected_plan === plan.key
                            ? "border-[var(--accent-blue)] shadow-[0_0_0_1px_var(--accent-blue),0_4px_12px_rgba(59,130,246,0.15)]"
                            : "border-[var(--border-primary)] hover:border-[var(--border-secondary)]",
                        )}
                        onClick={() => on_select(plan.key)}
                      >
                        <CardContent className="p-4">
                          <div
                            className={cn(
                              "text-xs font-medium mb-2",
                              plan.key === "free"
                                ? "text-[var(--accent-blue)]"
                                : "text-[var(--text-tertiary)]",
                            )}
                          >
                            {plan.label}
                          </div>
                          <div className="text-2xl font-bold text-[var(--text-primary)]">
                            {plan.price}
                          </div>
                          <div className="text-sm text-[var(--text-tertiary)]">
                            {plan.period}
                          </div>
                        </CardContent>
                      </Card>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {features.map((row, index) => {
                  if (row.category) {
                    return (
                      <tr key={index}>
                        <td className="pt-8 pb-3 px-4" colSpan={4}>
                          <span className="text-sm font-semibold text-[var(--text-primary)]">
                            {row.category}
                          </span>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr
                      key={index}
                      className="border-b border-[var(--border-primary)]"
                    >
                      <td className="py-3 px-4">
                        <span className="text-sm text-[var(--text-secondary)]">
                          {row.name}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <FeatureValue value={row.free} />
                      </td>
                      <td className="py-3 px-4 text-center">
                        <FeatureValue value={row.starter} />
                      </td>
                      <td className="py-3 px-4 text-center">
                        <FeatureValue value={row.pro} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-12 text-center">
            <p className="text-sm mb-4 text-[var(--text-tertiary)]">
              All plans include our core privacy and security features.
              <br />
              Upgrade or downgrade anytime from your settings.
            </p>
            <Button size="lg" onClick={on_continue}>
              Continue with{" "}
              {selected_plan === "free"
                ? "Free"
                : selected_plan === "starter"
                  ? "Starter"
                  : "Pro"}
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
