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
import {
  CheckIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";

import { Spinner } from "@/components/ui/spinner";

export type StepStatus = "pending" | "verified" | "failed" | "checking";

export interface ChecklistStep {
  id: string;
  title: string;
  record_type: string;
  status: StepStatus;
}

interface DnsChecklistProps {
  steps: ChecklistStep[];
  active_step: number;
  on_step_click: (index: number) => void;
  disabled?: boolean;
  layout?: "vertical" | "horizontal";
}

function StepStatusIcon({ status }: { status: StepStatus }) {
  if (status === "checking") return <Spinner size="sm" />;
  if (status === "verified")
    return <CheckIcon className="w-3.5 h-3.5 text-white" />;
  if (status === "failed")
    return <XCircleIcon className="w-3.5 h-3.5 text-white" />;

  return null;
}

function step_bg(status: StepStatus, is_active: boolean): string {
  if (status === "verified") return "linear-gradient(to bottom, #22c55e, #16a34a)";
  if (status === "failed") return "linear-gradient(to bottom, #f87171, #dc2626)";
  if (is_active) return "linear-gradient(to bottom, #4a7aff, #2d5ae0)";

  return "var(--bg-tertiary)";
}

function step_text_color(status: StepStatus, is_active: boolean): string {
  if (status === "verified" || status === "failed" || is_active) return "white";

  return "var(--text-muted)";
}

export function DnsChecklist({
  steps,
  active_step,
  on_step_click,
  disabled = false,
  layout = "vertical",
}: DnsChecklistProps) {
  if (layout === "horizontal") {
    return (
      <div className="flex items-center justify-center gap-1">
        {steps.map((step, index) => (
          <div key={step.id} className="flex items-center">
            <button
              className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold transition-all"
              disabled={disabled}
              style={{
                background: step_bg(step.status, index === active_step),
                color: step_text_color(step.status, index === active_step),
                opacity: disabled ? 0.6 : 1,
                cursor: disabled ? "default" : "pointer",
              }}
              onClick={() => on_step_click(index)}
            >
              <StepStatusIcon status={step.status} />
              {step.status === "pending" && (index + 1)}
            </button>
            {index < steps.length - 1 && (
              <div
                className="w-4 h-0.5 mx-0.5 rounded-full transition-colors"
                style={{
                  backgroundColor:
                    step.status === "verified" ? "#22c55e" : "var(--bg-tertiary)",
                }}
              />
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      {steps.map((step, index) => {
        const is_active = index === active_step;

        return (
          <button
            key={step.id}
            className="flex items-center gap-3 px-3 py-2.5 rounded-[14px] text-left transition-colors"
            disabled={disabled}
            style={{
              backgroundColor: is_active ? "var(--bg-tertiary)" : "transparent",
              borderLeft: is_active
                ? "2px solid var(--accent-color, #3b82f6)"
                : "2px solid transparent",
              opacity: disabled ? 0.6 : 1,
              cursor: disabled ? "default" : "pointer",
            }}
            onClick={() => on_step_click(index)}
          >
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold flex-shrink-0"
              style={{
                background: step_bg(step.status, is_active),
                color: step_text_color(step.status, is_active),
              }}
            >
              <StepStatusIcon status={step.status} />
              {step.status === "pending" && (index + 1)}
            </div>

            <div className="min-w-0 flex-1">
              <p
                className="text-sm font-medium truncate"
                style={{
                  color: is_active ? "var(--text-primary)" : "var(--text-secondary)",
                }}
              >
                {step.title}
              </p>
              <span className="text-[11px] font-mono text-txt-muted">
                {step.record_type}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
