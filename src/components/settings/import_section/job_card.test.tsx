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
import type { ImportJob, ImportStatus } from "@/services/api/email_import";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@aster/ui", () => ({
  Island: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  IslandRow: ({
    description,
    icon,
    label,
    trailing,
  }: {
    description: React.ReactNode;
    icon: React.ReactNode;
    label: React.ReactNode;
    trailing: React.ReactNode;
  }) => (
    <div>
      <div data-testid="icon">{icon}</div>
      <div data-testid="label">{label}</div>
      <div data-testid="description">{description}</div>
      <div data-testid="trailing">{trailing}</div>
    </div>
  ),
  IslandIconButton: ({
    children,
    label,
    onClick,
  }: {
    children: React.ReactNode;
    label: string;
    onClick?: () => void;
  }) => (
    <button aria-label={label} onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/components/ui/spinner", () => ({
  Spinner: () => <span data-testid="spinner" />,
}));

const { ImportJobCard } = await import("./job_card");
const { get_status_label } = await import("./status");
const { STALE_IMPORT_JOB_MS, INTERRUPTED_ERROR_MESSAGE } =
  await import("@/services/import/job_state");

let container: HTMLDivElement;
let root: Root;

function make_job(
  status: ImportStatus,
  idle_ms: number,
  error_message: string | null = null,
): ImportJob {
  const updated_at = new Date(Date.now() - idle_ms).toISOString();

  return {
    id: "job-1",
    source: "mbox",
    status,
    total_emails: 100,
    processed_emails: 40,
    skipped_emails: 0,
    failed_emails: 0,
    error_message,
    created_at: updated_at,
    updated_at,
  };
}

async function render_card(job: ImportJob, on_delete = vi.fn()) {
  await act(async () => {
    root.render(<ImportJobCard job={job} on_delete={on_delete} />);
  });

  return on_delete;
}

function delete_button(): HTMLButtonElement | null {
  return container.querySelector('button[aria-label="common.delete"]');
}

function description(): string {
  return (
    container.querySelector('[data-testid="description"]')?.textContent ?? ""
  );
}

describe("ImportJobCard", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("hides delete while an import is still making progress", async () => {
    await render_card(make_job("processing", 60_000));

    expect(delete_button()).toBeNull();
    expect(description()).toBe("settings.status_in_progress");
  });

  it("labels a stalled import as interrupted and lets it be deleted", async () => {
    const on_delete = await render_card(
      make_job("processing", STALE_IMPORT_JOB_MS + 60_000),
    );

    expect(description()).toContain("settings.status_interrupted");
    expect(description()).toContain("settings.import_interrupted_hint");
    expect(container.querySelector('[data-testid="spinner"]')).toBeNull();

    const button = delete_button();

    expect(button).not.toBeNull();
    await act(async () => {
      button?.click();
    });
    expect(on_delete).toHaveBeenCalledWith("job-1");
  });

  it("labels a server swept import as interrupted", async () => {
    await render_card(make_job("failed", 0, INTERRUPTED_ERROR_MESSAGE));

    expect(description()).toContain("settings.status_interrupted");
    expect(delete_button()).not.toBeNull();
  });

  it("keeps the plain failed label for other failures", async () => {
    await render_card(make_job("failed", 0, "quota"));

    expect(description()).toBe("settings.status_failed");
  });

  it("maps every display status to its label", () => {
    const t = (key: string) => key;

    expect(get_status_label("interrupted", t)).toBe(
      "settings.status_interrupted",
    );
    expect(get_status_label("pending", t)).toBe("settings.status_pending");
    expect(get_status_label("processing", t)).toBe(
      "settings.status_in_progress",
    );
    expect(get_status_label("completed", t)).toBe("settings.status_completed");
    expect(get_status_label("failed", t)).toBe("settings.status_failed");
    expect(get_status_label("cancelled", t)).toBe("settings.status_cancelled");
  });
});
