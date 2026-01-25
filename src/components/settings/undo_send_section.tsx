import { ClockIcon, ArrowUturnLeftIcon } from "@heroicons/react/24/outline";

import { SettingsSaveIndicatorInline } from "./settings_save_indicator";

import { use_preferences } from "@/contexts/preferences_context";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

const PRESET_SECONDS = [3, 5, 10, 15, 30] as const;
const MIN_SECONDS = 1;
const MAX_SECONDS = 30;
const DEFAULT_SECONDS = 3;

function clamp_seconds(value: number): number {
  if (!Number.isFinite(value) || value < MIN_SECONDS) {
    return DEFAULT_SECONDS;
  }

  return Math.min(value, MAX_SECONDS);
}

export function UndoSendSection() {
  const { preferences, update_preferences } = use_preferences();

  const undo_enabled = preferences.undo_send_enabled ?? true;
  const raw_seconds = preferences.undo_send_seconds;
  const display_seconds = undo_enabled
    ? clamp_seconds(raw_seconds ?? DEFAULT_SECONDS)
    : DEFAULT_SECONDS;

  const handle_seconds_change = (value: number) => {
    const clamped = clamp_seconds(value);

    update_preferences({
      undo_send_seconds: clamped,
      undo_send_period: `${clamped} seconds`,
    });
  };

  const handle_toggle = () => {
    if (undo_enabled) {
      update_preferences({
        undo_send_enabled: false,
      });
    } else {
      const seconds = clamp_seconds(raw_seconds ?? DEFAULT_SECONDS);

      update_preferences({
        undo_send_enabled: true,
        undo_send_seconds: seconds,
        undo_send_period: `${seconds} seconds`,
      });
    }
  };

  const handle_input_change = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value;

    if (input === "") {
      return;
    }

    const parsed = parseInt(input, 10);

    if (Number.isFinite(parsed) && parsed >= MIN_SECONDS) {
      handle_seconds_change(parsed);
    }
  };

  const handle_input_blur = (e: React.FocusEvent<HTMLInputElement>) => {
    const input = e.target.value;
    const parsed = parseInt(input, 10);

    if (!Number.isFinite(parsed) || parsed < MIN_SECONDS) {
      handle_seconds_change(DEFAULT_SECONDS);
    } else {
      handle_seconds_change(parsed);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3
            className="text-lg font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            Undo Send
          </h3>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            Configure email sending delay for undo capability
          </p>
        </div>
        <SettingsSaveIndicatorInline />
      </div>

      <div className="space-y-3">
        <div
          className="flex items-center justify-between p-4 rounded-lg border transition-colors"
          style={{
            backgroundColor: "var(--bg-tertiary)",
            borderColor: "var(--border-secondary)",
          }}
        >
          <div className="flex items-center gap-4">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: "var(--bg-secondary)" }}
            >
              <ArrowUturnLeftIcon
                className="w-6 h-6"
                style={{ color: "var(--text-secondary)" }}
              />
            </div>
            <div>
              <h4
                className="text-sm font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                Enable Undo Send
              </h4>
              <p
                className="text-xs mt-0.5"
                style={{ color: "var(--text-muted)" }}
              >
                Delay sending emails so you can undo if needed
              </p>
            </div>
          </div>
          <button
            aria-checked={undo_enabled}
            aria-label="Enable undo send"
            className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
            role="switch"
            style={{
              backgroundColor: undo_enabled
                ? "#3b82f6"
                : "var(--border-secondary)",
            }}
            type="button"
            onClick={handle_toggle}
          >
            <span
              className={cn(
                "inline-block h-4 w-4 rounded-full transition-transform duration-200",
                undo_enabled ? "translate-x-6" : "translate-x-1",
              )}
              style={{
                backgroundColor: undo_enabled ? "#ffffff" : "var(--bg-card)",
              }}
            />
          </button>
        </div>

        {undo_enabled && (
          <div
            className="p-4 rounded-lg border transition-colors"
            style={{
              backgroundColor: "var(--bg-tertiary)",
              borderColor: "var(--border-secondary)",
            }}
          >
            <div className="flex items-center gap-4 mb-4">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: "var(--bg-secondary)" }}
              >
                <ClockIcon
                  className="w-6 h-6"
                  style={{ color: "var(--text-secondary)" }}
                />
              </div>
              <div className="flex-1">
                <h4
                  className="text-sm font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  Cancellation Period
                </h4>
                <p
                  className="text-xs mt-0.5"
                  style={{ color: "var(--text-muted)" }}
                >
                  Time window to cancel a sent email ({MIN_SECONDS}-
                  {MAX_SECONDS} seconds)
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  aria-label="Cancellation period in seconds"
                  className="w-20 h-9 text-center shadow-none focus-visible:ring-0 focus-visible:border-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  max={MAX_SECONDS}
                  min={MIN_SECONDS}
                  type="number"
                  value={display_seconds}
                  onBlur={handle_input_blur}
                  onChange={handle_input_change}
                />
                <span
                  className="text-sm"
                  style={{ color: "var(--text-secondary)" }}
                >
                  seconds
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 pl-14">
              {PRESET_SECONDS.map((seconds) => (
                <button
                  key={seconds}
                  aria-label={`Set to ${seconds} seconds`}
                  aria-pressed={display_seconds === seconds}
                  className={cn(
                    "px-3 py-1.5 text-xs rounded-md transition-colors",
                    display_seconds === seconds
                      ? "bg-[var(--accent-blue)] text-white"
                      : "bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)]",
                  )}
                  style={{
                    color:
                      display_seconds === seconds
                        ? undefined
                        : "var(--text-secondary)",
                  }}
                  type="button"
                  onClick={() => handle_seconds_change(seconds)}
                >
                  {seconds}s
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div
        className="rounded-lg p-4 border"
        style={{
          backgroundColor: "var(--bg-tertiary)",
          borderColor: "var(--border-secondary)",
        }}
      >
        <p
          className="text-[10px] font-medium uppercase tracking-wider mb-3"
          style={{ color: "var(--text-muted)" }}
        >
          How It Works
        </p>
        <ul className="space-y-2">
          <li className="flex items-start gap-2">
            <span className="text-xs" style={{ color: "var(--accent-blue)" }}>
              1.
            </span>
            <span
              className="text-xs"
              style={{ color: "var(--text-secondary)" }}
            >
              When you send an email, it&apos;s queued for the duration you set
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-xs" style={{ color: "var(--accent-blue)" }}>
              2.
            </span>
            <span
              className="text-xs"
              style={{ color: "var(--text-secondary)" }}
            >
              A toast notification appears with an &quot;Undo&quot; button
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-xs" style={{ color: "var(--accent-blue)" }}>
              3.
            </span>
            <span
              className="text-xs"
              style={{ color: "var(--text-secondary)" }}
            >
              Click &quot;Undo&quot; to cancel, or wait for automatic delivery
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}
