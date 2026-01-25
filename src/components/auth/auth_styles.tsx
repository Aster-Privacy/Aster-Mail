import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

export const input_base_class =
  "flex h-10 w-full rounded-md border bg-[var(--input-bg)] border-[var(--input-border)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)] focus-visible:border-[var(--accent-blue)] hover:border-[var(--border-primary)] disabled:cursor-not-allowed disabled:opacity-50 transition-colors";

export const input_with_suffix_class = cn(input_base_class, "rounded-r-none");

export const get_alert_styles = (
  type: "error" | "info" | "warning" | "success",
  is_dark: boolean,
): CSSProperties => {
  const styles = {
    error: {
      backgroundColor: is_dark ? "rgba(239, 68, 68, 0.1)" : "rgb(254 242 242)",
      borderColor: is_dark ? "rgba(239, 68, 68, 0.3)" : "rgb(254 202 202)",
    },
    info: {
      backgroundColor: is_dark ? "var(--bg-tertiary)" : "rgb(239 246 255)",
      borderColor: is_dark ? "var(--border-secondary)" : "rgb(191 219 254)",
    },
    warning: {
      backgroundColor: is_dark ? "rgba(245, 158, 11, 0.1)" : "rgb(255 251 235)",
      borderColor: is_dark ? "rgba(245, 158, 11, 0.3)" : "rgb(253 230 138)",
    },
    success: {
      backgroundColor: is_dark ? "rgba(34, 197, 94, 0.15)" : "rgb(220 252 231)",
      borderColor: is_dark ? "rgba(34, 197, 94, 0.3)" : "rgb(187 247 208)",
    },
  };

  return styles[type];
};

export const get_alert_text_color = (
  type: "error" | "info" | "warning" | "success",
  is_dark: boolean,
  variant: "title" | "body" = "body",
): string => {
  const colors = {
    error: {
      title: is_dark ? "#f87171" : "#b91c1c",
      body: is_dark ? "#f87171" : "#b91c1c",
    },
    info: {
      title: is_dark ? "#93c5fd" : "#1e40af",
      body: is_dark ? "var(--text-tertiary)" : "#1d4ed8",
    },
    warning: {
      title: is_dark ? "#fcd34d" : "#92400e",
      body: is_dark ? "#fbbf24" : "#b45309",
    },
    success: {
      title: is_dark ? "#4ade80" : "#16a34a",
      body: is_dark ? "#4ade80" : "#15803d",
    },
  };

  return colors[type][variant];
};

export const get_icon_color = (
  type: "error" | "info" | "warning" | "success",
  is_dark: boolean,
): string => {
  const colors = {
    error: is_dark ? "#f87171" : "#dc2626",
    info: is_dark ? "#60a5fa" : "#2563eb",
    warning: is_dark ? "#fbbf24" : "#d97706",
    success: is_dark ? "#4ade80" : "#16a34a",
  };

  return colors[type];
};

export const EyeIcon = () => (
  <svg
    className="h-5 w-5"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    style={{ color: "var(--text-muted)" }}
    viewBox="0 0 24 24"
  >
    <path
      d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const EyeSlashIcon = () => (
  <svg
    className="h-5 w-5"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    style={{ color: "var(--text-muted)" }}
    viewBox="0 0 24 24"
  >
    <path
      d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const CheckIcon = ({
  className = "h-3 w-3",
}: {
  className?: string;
}) => (
  <svg
    className={`${className} text-white`}
    fill="none"
    stroke="currentColor"
    strokeWidth={3}
    viewBox="0 0 24 24"
  >
    <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const ShieldCheckIcon = ({ color }: { color: string }) => (
  <svg
    className="h-5 w-5 flex-shrink-0 mt-0.5"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    style={{ color }}
    viewBox="0 0 24 24"
  >
    <path
      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const LockIcon = ({ color }: { color: string }) => (
  <svg
    className="h-5 w-5 flex-shrink-0"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    style={{ color }}
    viewBox="0 0 24 24"
  >
    <path
      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const WarningIcon = ({ color }: { color: string }) => (
  <svg
    className="h-5 w-5 flex-shrink-0 mt-0.5"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    style={{ color }}
    viewBox="0 0 24 24"
  >
    <path
      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const DocumentIcon = () => (
  <svg
    className="h-4 w-4 mr-2"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    viewBox="0 0 24 24"
  >
    <path
      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const DownloadIcon = () => (
  <svg
    className="h-4 w-4 mr-2"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    viewBox="0 0 24 24"
  >
    <path
      d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

interface CheckboxProps {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

export const Checkbox = ({ checked, disabled, onChange }: CheckboxProps) => (
  <div
    className="relative flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border transition-all duration-200"
    style={{
      borderColor: checked ? "var(--accent-blue)" : "var(--border-secondary)",
      backgroundColor: checked ? "var(--accent-blue)" : "transparent",
    }}
  >
    <input
      checked={checked}
      className="absolute h-full w-full cursor-pointer opacity-0"
      disabled={disabled}
      type="checkbox"
      onChange={(e) => onChange(e.target.checked)}
    />
    {checked && <CheckIcon />}
  </div>
);

export const AuthPageWrapper = ({
  children,
}: {
  children: React.ReactNode;
}) => (
  <div
    className="flex h-screen w-screen items-center justify-center transition-colors duration-200"
    style={{ backgroundColor: "var(--bg-secondary)" }}
  >
    {children}
  </div>
);

export const AuthCard = ({
  children,
  className = "max-w-md",
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <div className={`flex w-full ${className} flex-col items-center gap-6`}>
    {children}
  </div>
);

export const AuthCardBody = ({
  children,
  padding = "px-10 py-10",
}: {
  children: React.ReactNode;
  padding?: string;
}) => (
  <div
    className={`w-full rounded-xl border ${padding} transition-colors duration-200`}
    style={{
      backgroundColor: "var(--bg-card)",
      borderColor: "var(--border-primary)",
    }}
  >
    {children}
  </div>
);

export const AuthFooter = () => (
  <div className="absolute bottom-8 flex flex-col items-center gap-2">
    <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
      End-to-end encrypted email
    </p>
    <div
      className="flex items-center gap-2 text-xs"
      style={{ color: "var(--text-muted)" }}
    >
      <a
        className="transition-colors duration-200 hover:opacity-80"
        href="/terms"
      >
        Terms of Service
      </a>
      <span>•</span>
      <a
        className="transition-colors duration-200 hover:opacity-80"
        href="/privacy"
      >
        Privacy Policy
      </a>
      <span>•</span>
      <span>1.0.0 Aurora</span>
    </div>
  </div>
);

export const Logo = () => (
  <img alt="Logo" className="h-12" src="/text_logo.png" />
);

export const FormLabel = ({ children }: { children: React.ReactNode }) => (
  <label
    className="mb-2 block text-sm font-medium"
    style={{ color: "var(--text-primary)" }}
  >
    {children}
  </label>
);

export const get_primary_button_style = (
  is_dark: boolean,
  is_disabled?: boolean,
): CSSProperties => ({
  background: is_disabled
    ? "var(--text-muted)"
    : "linear-gradient(rgb(82, 110, 249), rgb(55, 79, 235))",
  border: is_disabled ? "none" : is_dark ? "none" : "1px solid #6c6d71",
});

export const get_spinner_style = (is_dark: boolean): CSSProperties => ({
  borderColor: is_dark ? "#374151" : "#bfdbfe",
  borderTopColor: is_dark ? "#60a5fa" : "#2563eb",
});

interface InputWithEndContentProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  end_content?: React.ReactNode;
  wrapper_class?: string;
}

export const InputWithEndContent = ({
  end_content,
  wrapper_class,
  className,
  ...props
}: InputWithEndContentProps) => (
  <div className={cn("relative", wrapper_class)}>
    <input
      className={cn(input_base_class, end_content && "pr-10", className)}
      {...props}
    />
    {end_content && (
      <div className="absolute right-3 top-1/2 -translate-y-1/2">
        {end_content}
      </div>
    )}
  </div>
);
