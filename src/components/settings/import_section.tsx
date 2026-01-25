import { useState, useEffect } from "react";
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ClockIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";

import { ImportModal } from "./import_modal";

import { Button } from "@/components/ui/button";
import {
  list_import_jobs,
  type ImportJob,
  type ImportStatus,
} from "@/services/api/email_import";

function get_status_icon(status: ImportStatus) {
  switch (status) {
    case "completed":
      return (
        <CheckCircleIcon className="w-4 h-4" style={{ color: "#22c55e" }} />
      );
    case "processing":
    case "pending":
      return (
        <ArrowPathIcon
          className="w-4 h-4 animate-spin"
          style={{ color: "var(--accent-color)" }}
        />
      );
    case "failed":
    case "cancelled":
      return <XCircleIcon className="w-4 h-4" style={{ color: "#ef4444" }} />;
  }
}

function get_status_label(status: ImportStatus): string {
  switch (status) {
    case "pending":
      return "Pending";
    case "processing":
      return "In Progress";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
  }
}

function format_relative_time(date_string: string): string {
  const date = new Date(date_string);
  const now = new Date();
  const diff_ms = now.getTime() - date.getTime();
  const diff_minutes = Math.floor(diff_ms / 60000);
  const diff_hours = Math.floor(diff_minutes / 60);
  const diff_days = Math.floor(diff_hours / 24);

  if (diff_minutes < 1) return "Just now";
  if (diff_minutes < 60) return `${diff_minutes}m ago`;
  if (diff_hours < 24) return `${diff_hours}h ago`;
  if (diff_days < 7) return `${diff_days}d ago`;

  return date.toLocaleDateString();
}

function ImportJobCard({ job }: { job: ImportJob }) {
  const source_label = job.source.charAt(0).toUpperCase() + job.source.slice(1);

  return (
    <div
      className="flex items-center justify-between p-3 rounded-lg"
      style={{ backgroundColor: "var(--bg-secondary)" }}
    >
      <div className="flex items-center gap-3">
        {get_status_icon(job.status)}
        <div>
          <p
            className="text-sm font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            {source_label} Import
          </p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {job.processed_emails} imported
            {job.skipped_emails > 0 && `, ${job.skipped_emails} skipped`}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {get_status_label(job.status)}
        </span>
        <ClockIcon className="w-3 h-3" style={{ color: "var(--text-muted)" }} />
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {format_relative_time(job.created_at)}
        </span>
      </div>
    </div>
  );
}

export function ImportSection() {
  const [is_modal_open, set_is_modal_open] = useState(false);
  const [recent_jobs, set_recent_jobs] = useState<ImportJob[]>([]);
  const [is_loading_jobs, set_is_loading_jobs] = useState(true);
  const [has_error, set_has_error] = useState(false);

  const load_jobs = async () => {
    if (has_error) return;
    set_is_loading_jobs(true);

    try {
      const response = await list_import_jobs();

      if (response.data) {
        set_recent_jobs(response.data.jobs.slice(0, 5));
      } else if (response.error) {
        set_has_error(true);
      }
    } catch {
      set_has_error(true);
    }

    set_is_loading_jobs(false);
  };

  useEffect(() => {
    load_jobs();
  }, []);

  useEffect(() => {
    if (!is_modal_open && !has_error) {
      load_jobs();
    }
  }, [is_modal_open, has_error]);

  return (
    <div className="space-y-4">
      <div>
        <h3
          className="text-lg font-semibold mb-2"
          style={{ color: "var(--text-primary)" }}
        >
          Import Emails
        </h3>
        <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
          Bring your emails from Gmail, Outlook, or other email services. Your
          emails are encrypted on your device before being stored.
        </p>

        <Button
          className="w-full sm:w-auto"
          size="lg"
          variant="primary"
          onClick={() => set_is_modal_open(true)}
        >
          <ArrowDownTrayIcon className="w-4 h-4 mr-2" />
          Import Emails
        </Button>
      </div>

      {!is_loading_jobs && recent_jobs.length > 0 && (
        <div className="pt-4">
          <h4
            className="text-sm font-medium mb-3"
            style={{ color: "var(--text-secondary)" }}
          >
            Recent Imports
          </h4>
          <div className="space-y-2">
            {recent_jobs.map((job) => (
              <ImportJobCard key={job.id} job={job} />
            ))}
          </div>
        </div>
      )}

      <ImportModal
        is_open={is_modal_open}
        on_close={() => set_is_modal_open(false)}
      />
    </div>
  );
}
