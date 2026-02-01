import type {
  DecryptedContact,
  ContactFormData,
  DecryptedContactPhoto,
  DecryptedContactAttachment,
  DecryptedCustomFieldValue,
} from "@/types/contacts";

import { useState, useEffect, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  PlusIcon,
  XMarkIcon,
  ArrowPathIcon,
  UserIcon,
  EnvelopeIcon,
  PhoneIcon,
  BuildingOffice2Icon,
  BriefcaseIcon,
  MapPinIcon,
  CalendarIcon,
  DocumentTextIcon,
  GlobeAltIcon,
  StarIcon,
  PhotoIcon,
  PaperClipIcon,
  AdjustmentsHorizontalIcon,
} from "@heroicons/react/24/outline";

import { ContactPhotoUpload } from "./contact_photo_upload";
import { ContactAttachmentsPanel } from "./contact_attachments_panel";
import { ContactCustomFields } from "./contact_custom_fields";

import { cn, EMAIL_REGEX } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ContactFormProps {
  is_open: boolean;
  on_close: () => void;
  on_submit: (data: ContactFormData) => Promise<void>;
  contact?: DecryptedContact | null;
  is_loading?: boolean;
  current_photo?: DecryptedContactPhoto | null;
  on_photo_change?: (photo: DecryptedContactPhoto | null) => void;
  attachments?: DecryptedContactAttachment[];
  on_attachments_change?: (attachments: DecryptedContactAttachment[]) => void;
  custom_field_values?: DecryptedCustomFieldValue[];
  on_custom_field_values_change?: (values: DecryptedCustomFieldValue[]) => void;
}

const initial_form_data: ContactFormData = {
  first_name: "",
  last_name: "",
  emails: [""],
  phone: "",
  company: "",
  job_title: "",
  notes: "",
  relationship: undefined,
  birthday: "",
  social_links: {},
  address: {},
  is_favorite: false,
};

const MAX_EMAILS = 5;

const RELATIONSHIPS = [
  { value: "work", label: "Work" },
  { value: "personal", label: "Personal" },
  { value: "family", label: "Family" },
  { value: "other", label: "Other" },
] as const;

type TabId =
  | "basic"
  | "details"
  | "address"
  | "social"
  | "photo"
  | "files"
  | "fields";

export function ContactForm({
  is_open,
  on_close,
  on_submit,
  contact,
  is_loading = false,
  current_photo,
  on_photo_change,
  attachments = [],
  on_attachments_change,
  custom_field_values = [],
  on_custom_field_values_change,
}: ContactFormProps) {
  const [form_data, set_form_data] =
    useState<ContactFormData>(initial_form_data);
  const [errors, set_errors] = useState<Record<string, string>>({});
  const [active_tab, set_active_tab] = useState<TabId>("basic");

  const is_edit_mode = !!contact;

  const preview_name = useMemo(() => {
    return (
      `${form_data.first_name} ${form_data.last_name}`.trim() || "New Contact"
    );
  }, [form_data.first_name, form_data.last_name]);

  const preview_email = useMemo(() => {
    return form_data.emails.find((e) => e.trim()) || "";
  }, [form_data.emails]);

  useEffect(() => {
    if (contact) {
      set_form_data({
        first_name: contact.first_name,
        last_name: contact.last_name,
        emails: contact.emails.length > 0 ? contact.emails : [""],
        phone: contact.phone || "",
        company: contact.company || "",
        job_title: contact.job_title || "",
        notes: contact.notes || "",
        relationship: contact.relationship,
        birthday: contact.birthday || "",
        social_links: contact.social_links || {},
        address: contact.address || {},
        is_favorite: contact.is_favorite,
        avatar_url: contact.avatar_url,
      });
    } else {
      set_form_data(initial_form_data);
    }
    set_errors({});
    set_active_tab("basic");
  }, [contact, is_open]);

  const handle_change = (field: keyof ContactFormData, value: unknown) => {
    set_form_data((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      set_errors((prev) => {
        const next = { ...prev };

        delete next[field];

        return next;
      });
    }
  };

  const handle_email_change = (index: number, value: string) => {
    const new_emails = [...form_data.emails];

    new_emails[index] = value;
    set_form_data((prev) => ({ ...prev, emails: new_emails }));
    if (errors.emails) {
      set_errors((prev) => {
        const next = { ...prev };

        delete next.emails;

        return next;
      });
    }
  };

  const add_email_field = () => {
    if (form_data.emails.length >= MAX_EMAILS) return;
    set_form_data((prev) => ({ ...prev, emails: [...prev.emails, ""] }));
  };

  const remove_email_field = (index: number) => {
    if (form_data.emails.length > 1) {
      const new_emails = form_data.emails.filter((_, i) => i !== index);

      set_form_data((prev) => ({ ...prev, emails: new_emails }));
    }
  };

  const handle_address_change = (field: string, value: string) => {
    set_form_data((prev) => ({
      ...prev,
      address: { ...prev.address, [field]: value },
    }));
  };

  const handle_social_change = (field: string, value: string) => {
    set_form_data((prev) => ({
      ...prev,
      social_links: { ...prev.social_links, [field]: value },
    }));
  };

  const validate_form = (): boolean => {
    const new_errors: Record<string, string> = {};

    if (!form_data.first_name.trim() && !form_data.last_name.trim()) {
      new_errors.first_name = "At least one name is required";
    }

    const valid_emails = form_data.emails.filter((email) => email.trim());

    if (valid_emails.length === 0) {
      new_errors.emails = "At least one email is required";
    } else {
      const invalid_email = valid_emails.find(
        (email) => !EMAIL_REGEX.test(email),
      );

      if (invalid_email) {
        new_errors.emails = "Please enter valid email addresses";
      }
    }

    set_errors(new_errors);

    return Object.keys(new_errors).length === 0;
  };

  const handle_submit = async () => {
    if (!validate_form() || is_loading) return;

    const cleaned_data: ContactFormData = {
      ...form_data,
      emails: form_data.emails.filter((email) => email.trim()),
    };

    await on_submit(cleaned_data);
  };

  const handle_close = () => {
    if (is_loading) return;
    on_close();
  };

  const base_tabs: { id: TabId; label: string }[] = [
    { id: "basic", label: "Basic" },
    { id: "details", label: "Details" },
    { id: "address", label: "Address" },
    { id: "social", label: "Social" },
  ];

  const edit_tabs: { id: TabId; label: string }[] = [
    { id: "photo", label: "Photo" },
    { id: "files", label: "Files" },
    { id: "fields", label: "Fields" },
  ];

  const tabs = is_edit_mode ? [...base_tabs, ...edit_tabs] : base_tabs;
  const tab_count = tabs.length;

  return (
    <AnimatePresence>
      {is_open && (
        <motion.div
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          style={{ backgroundColor: "var(--modal-overlay)" }}
          transition={{ duration: 0.15 }}
          onClick={handle_close}
        >
          <motion.div
            animate={{ scale: 1, opacity: 1 }}
            className="relative w-full max-w-lg rounded-xl border shadow-2xl overflow-hidden"
            exit={{ scale: 0.96, opacity: 0 }}
            initial={{ scale: 0.96, opacity: 0 }}
            style={{
              backgroundColor: "var(--modal-bg)",
              borderColor: "var(--border-primary)",
            }}
            transition={{ duration: 0.15 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-4 px-6 pt-6 pb-4">
              <div className="relative">
                <ProfileAvatar
                  email={preview_email}
                  image_url={form_data.avatar_url}
                  name={preview_name}
                  size="xl"
                />
                <button
                  className={cn(
                    "absolute -bottom-1 -right-1 p-0.5 rounded transition-colors",
                    form_data.is_favorite
                      ? "text-amber-400"
                      : "text-[var(--text-muted)] hover:text-amber-400",
                  )}
                  type="button"
                  onClick={() =>
                    handle_change("is_favorite", !form_data.is_favorite)
                  }
                >
                  <StarIcon
                    className={cn(
                      "w-[18px] h-[18px]",
                      form_data.is_favorite && "fill-current",
                    )}
                  />
                </button>
              </div>
              <div className="flex-1 min-w-0">
                <h2
                  className="text-lg font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  {is_edit_mode ? "Edit Contact" : "New Contact"}
                </h2>
                <p
                  className="text-[13px] mt-0.5 truncate"
                  style={{ color: "var(--text-muted)" }}
                >
                  {preview_name !== "New Contact"
                    ? preview_name
                    : "Enter contact details"}
                </p>
              </div>
              <button
                className="p-2 -mr-2 -mt-2 rounded-lg transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                onClick={handle_close}
              >
                <XMarkIcon
                  className="w-5 h-5"
                  style={{ color: "var(--text-muted)" }}
                />
              </button>
            </div>

            <div className="px-6 pb-3">
              <div
                className="relative flex p-1 rounded-lg overflow-x-auto"
                style={{ backgroundColor: "var(--bg-secondary)" }}
              >
                <motion.div
                  animate={{
                    left: `calc(${tabs.findIndex((t) => t.id === active_tab)} * (100% - 8px) / ${tab_count} + 4px)`,
                  }}
                  className="absolute top-1 bottom-1 rounded-md"
                  initial={false}
                  style={{
                    backgroundColor: "var(--bg-primary)",
                    width: `calc((100% - 8px) / ${tab_count})`,
                  }}
                  transition={{ type: "tween", duration: 0.2, ease: "easeOut" }}
                />
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    className="relative z-10 flex-1 px-2 py-1.5 text-[11px] font-medium rounded-md transition-colors duration-150 whitespace-nowrap"
                    style={{
                      color:
                        active_tab === tab.id
                          ? "var(--text-primary)"
                          : "var(--text-muted)",
                    }}
                    onClick={() => set_active_tab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="px-6 pb-4 min-h-[280px]">
              <AnimatePresence mode="wait">
                {active_tab === "basic" && (
                  <motion.div
                    key="basic"
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    initial={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <div className="space-y-4">
                      <div
                        className="flex items-center gap-2 pb-2 border-b"
                        style={{ borderColor: "var(--border-secondary)" }}
                      >
                        <UserIcon
                          className="w-4 h-4"
                          style={{ color: "var(--text-muted)" }}
                        />
                        <span
                          className="text-[11px] font-medium uppercase tracking-wider"
                          style={{ color: "var(--text-muted)" }}
                        >
                          Name
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label
                            className="block text-[11px] font-medium mb-1.5"
                            htmlFor="contact-first-name"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            First name
                          </label>
                          <Input
                            // eslint-disable-next-line jsx-a11y/no-autofocus
                            autoFocus
                            className={`h-9 text-[13px] ${errors.first_name ? "border-red-500 focus:ring-red-500/20" : ""}`}
                            id="contact-first-name"
                            placeholder="John"
                            value={form_data.first_name}
                            onChange={(e) =>
                              handle_change("first_name", e.target.value)
                            }
                          />
                        </div>
                        <div>
                          <label
                            className="block text-[11px] font-medium mb-1.5"
                            htmlFor="contact-last-name"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            Last name
                          </label>
                          <Input
                            className="h-9 text-[13px]"
                            id="contact-last-name"
                            placeholder="Doe"
                            value={form_data.last_name}
                            onChange={(e) =>
                              handle_change("last_name", e.target.value)
                            }
                          />
                        </div>
                      </div>
                      {errors.first_name && (
                        <p className="text-[11px] text-red-500">
                          {errors.first_name}
                        </p>
                      )}

                      <div
                        className="flex items-center gap-2 pb-2 border-b mt-6"
                        style={{ borderColor: "var(--border-secondary)" }}
                      >
                        <EnvelopeIcon
                          className="w-4 h-4"
                          style={{ color: "var(--text-muted)" }}
                        />
                        <span
                          className="text-[11px] font-medium uppercase tracking-wider"
                          style={{ color: "var(--text-muted)" }}
                        >
                          Email
                        </span>
                      </div>
                      <div className="space-y-2">
                        {form_data.emails.map((email, index) => (
                          <div key={index} className="flex items-center gap-2">
                            <Input
                              className={`h-9 text-[13px] flex-1 ${errors.emails ? "border-red-500 focus:ring-red-500/20" : ""}`}
                              placeholder="email@example.com"
                              type="email"
                              value={email}
                              onChange={(e) =>
                                handle_email_change(index, e.target.value)
                              }
                            />
                            {form_data.emails.length > 1 && (
                              <button
                                className="p-2 rounded-lg transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                                type="button"
                                onClick={() => remove_email_field(index)}
                              >
                                <XMarkIcon
                                  className="h-4 w-4"
                                  style={{ color: "var(--text-muted)" }}
                                />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      {errors.emails && (
                        <p className="text-[11px] text-red-500">
                          {errors.emails}
                        </p>
                      )}
                      {form_data.emails.length < MAX_EMAILS && (
                        <button
                          className="flex items-center gap-1.5 text-[12px] font-medium py-1 transition-colors hover:opacity-70"
                          style={{ color: "var(--text-muted)" }}
                          type="button"
                          onClick={add_email_field}
                        >
                          <PlusIcon className="h-3.5 w-3.5" />
                          Add another email ({form_data.emails.length}/
                          {MAX_EMAILS})
                        </button>
                      )}
                    </div>
                  </motion.div>
                )}

                {active_tab === "details" && (
                  <motion.div
                    key="details"
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    initial={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <div className="space-y-4">
                      <div
                        className="flex items-center gap-2 pb-2 border-b"
                        style={{ borderColor: "var(--border-secondary)" }}
                      >
                        <PhoneIcon
                          className="w-4 h-4"
                          style={{ color: "var(--text-muted)" }}
                        />
                        <span
                          className="text-[11px] font-medium uppercase tracking-wider"
                          style={{ color: "var(--text-muted)" }}
                        >
                          Phone
                        </span>
                      </div>
                      <Input
                        className="h-9 text-[13px]"
                        placeholder="+1 555 123 4567"
                        type="tel"
                        value={form_data.phone}
                        onChange={(e) => handle_change("phone", e.target.value)}
                      />

                      <div
                        className="flex items-center gap-2 pb-2 border-b mt-6"
                        style={{ borderColor: "var(--border-secondary)" }}
                      >
                        <BuildingOffice2Icon
                          className="w-4 h-4"
                          style={{ color: "var(--text-muted)" }}
                        />
                        <span
                          className="text-[11px] font-medium uppercase tracking-wider"
                          style={{ color: "var(--text-muted)" }}
                        >
                          Work
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label
                            className="block text-[11px] font-medium mb-1.5"
                            htmlFor="contact-company"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            Company
                          </label>
                          <Input
                            className="h-9 text-[13px]"
                            id="contact-company"
                            placeholder="Acme Inc."
                            value={form_data.company}
                            onChange={(e) =>
                              handle_change("company", e.target.value)
                            }
                          />
                        </div>
                        <div>
                          <label
                            className="block text-[11px] font-medium mb-1.5"
                            htmlFor="contact-job-title"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            Job title
                          </label>
                          <Input
                            className="h-9 text-[13px]"
                            id="contact-job-title"
                            placeholder="Software Engineer"
                            value={form_data.job_title}
                            onChange={(e) =>
                              handle_change("job_title", e.target.value)
                            }
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 mt-4">
                        <div>
                          <div
                            className="flex items-center gap-2 pb-2 border-b mb-3"
                            style={{ borderColor: "var(--border-secondary)" }}
                          >
                            <CalendarIcon
                              className="w-4 h-4"
                              style={{ color: "var(--text-muted)" }}
                            />
                            <span
                              className="text-[11px] font-medium uppercase tracking-wider"
                              style={{ color: "var(--text-muted)" }}
                            >
                              Birthday
                            </span>
                          </div>
                          <Input
                            className="h-9 text-[13px]"
                            type="date"
                            value={form_data.birthday}
                            onChange={(e) =>
                              handle_change("birthday", e.target.value)
                            }
                          />
                        </div>
                        <div>
                          <div
                            className="flex items-center gap-2 pb-2 border-b mb-3"
                            style={{ borderColor: "var(--border-secondary)" }}
                          >
                            <BriefcaseIcon
                              className="w-4 h-4"
                              style={{ color: "var(--text-muted)" }}
                            />
                            <span
                              className="text-[11px] font-medium uppercase tracking-wider"
                              style={{ color: "var(--text-muted)" }}
                            >
                              Relationship
                            </span>
                          </div>
                          <Select
                            value={form_data.relationship}
                            onValueChange={(value) =>
                              handle_change("relationship", value)
                            }
                          >
                            <SelectTrigger className="h-9 text-[13px] dark:bg-[#121212] dark:hover:bg-[#121212] dark:data-[state=open]:bg-[#121212]">
                              <SelectValue placeholder="Select..." />
                            </SelectTrigger>
                            <SelectContent className="dark:bg-[#121212]">
                              {RELATIONSHIPS.map((rel) => (
                                <SelectItem key={rel.value} value={rel.value}>
                                  {rel.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div
                        className="flex items-center gap-2 pb-2 border-b mt-6"
                        style={{ borderColor: "var(--border-secondary)" }}
                      >
                        <DocumentTextIcon
                          className="w-4 h-4"
                          style={{ color: "var(--text-muted)" }}
                        />
                        <span
                          className="text-[11px] font-medium uppercase tracking-wider"
                          style={{ color: "var(--text-muted)" }}
                        >
                          Notes
                        </span>
                      </div>
                      <textarea
                        className="w-full px-3 py-2.5 rounded-lg text-[13px] resize-none outline-none border transition-colors focus:ring-2 focus:ring-blue-500/20"
                        placeholder="Add notes about this contact..."
                        rows={3}
                        style={{
                          backgroundColor: "var(--bg-tertiary)",
                          borderColor: "var(--border-secondary)",
                          color: "var(--text-primary)",
                        }}
                        value={form_data.notes}
                        onChange={(e) => handle_change("notes", e.target.value)}
                      />
                    </div>
                  </motion.div>
                )}

                {active_tab === "address" && (
                  <motion.div
                    key="address"
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    initial={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <div className="space-y-4">
                      <div
                        className="flex items-center gap-2 pb-2 border-b"
                        style={{ borderColor: "var(--border-secondary)" }}
                      >
                        <MapPinIcon
                          className="w-4 h-4"
                          style={{ color: "var(--text-muted)" }}
                        />
                        <span
                          className="text-[11px] font-medium uppercase tracking-wider"
                          style={{ color: "var(--text-muted)" }}
                        >
                          Address
                        </span>
                      </div>
                      <div>
                        <label
                          className="block text-[11px] font-medium mb-1.5"
                          htmlFor="contact-street"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          Street
                        </label>
                        <Input
                          className="h-9 text-[13px]"
                          id="contact-street"
                          placeholder="123 Main Street"
                          value={form_data.address?.street || ""}
                          onChange={(e) =>
                            handle_address_change("street", e.target.value)
                          }
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label
                            className="block text-[11px] font-medium mb-1.5"
                            htmlFor="contact-city"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            City
                          </label>
                          <Input
                            className="h-9 text-[13px]"
                            id="contact-city"
                            placeholder="San Francisco"
                            value={form_data.address?.city || ""}
                            onChange={(e) =>
                              handle_address_change("city", e.target.value)
                            }
                          />
                        </div>
                        <div>
                          <label
                            className="block text-[11px] font-medium mb-1.5"
                            htmlFor="contact-state"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            State/Province
                          </label>
                          <Input
                            className="h-9 text-[13px]"
                            id="contact-state"
                            placeholder="California"
                            value={form_data.address?.state || ""}
                            onChange={(e) =>
                              handle_address_change("state", e.target.value)
                            }
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label
                            className="block text-[11px] font-medium mb-1.5"
                            htmlFor="contact-postal-code"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            Postal code
                          </label>
                          <Input
                            className="h-9 text-[13px]"
                            id="contact-postal-code"
                            placeholder="94102"
                            value={form_data.address?.postal_code || ""}
                            onChange={(e) =>
                              handle_address_change(
                                "postal_code",
                                e.target.value,
                              )
                            }
                          />
                        </div>
                        <div>
                          <label
                            className="block text-[11px] font-medium mb-1.5"
                            htmlFor="contact-country"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            Country
                          </label>
                          <Input
                            className="h-9 text-[13px]"
                            id="contact-country"
                            placeholder="United States"
                            value={form_data.address?.country || ""}
                            onChange={(e) =>
                              handle_address_change("country", e.target.value)
                            }
                          />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {active_tab === "social" && (
                  <motion.div
                    key="social"
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    initial={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <div className="space-y-4">
                      <div
                        className="flex items-center gap-2 pb-2 border-b"
                        style={{ borderColor: "var(--border-secondary)" }}
                      >
                        <GlobeAltIcon
                          className="w-4 h-4"
                          style={{ color: "var(--text-muted)" }}
                        />
                        <span
                          className="text-[11px] font-medium uppercase tracking-wider"
                          style={{ color: "var(--text-muted)" }}
                        >
                          Social Links
                        </span>
                      </div>
                      <div>
                        <label
                          className="block text-[11px] font-medium mb-1.5"
                          htmlFor="contact-website"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          Website
                        </label>
                        <Input
                          className="h-9 text-[13px]"
                          id="contact-website"
                          placeholder="https://example.com"
                          value={form_data.social_links?.website || ""}
                          onChange={(e) =>
                            handle_social_change("website", e.target.value)
                          }
                        />
                      </div>
                      <div>
                        <label
                          className="block text-[11px] font-medium mb-1.5"
                          htmlFor="contact-linkedin"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          LinkedIn
                        </label>
                        <Input
                          className="h-9 text-[13px]"
                          id="contact-linkedin"
                          placeholder="linkedin.com/in/username"
                          value={form_data.social_links?.linkedin || ""}
                          onChange={(e) =>
                            handle_social_change("linkedin", e.target.value)
                          }
                        />
                      </div>
                      <div>
                        <label
                          className="block text-[11px] font-medium mb-1.5"
                          htmlFor="contact-twitter"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          Twitter / X
                        </label>
                        <Input
                          className="h-9 text-[13px]"
                          id="contact-twitter"
                          placeholder="@username"
                          value={form_data.social_links?.twitter || ""}
                          onChange={(e) =>
                            handle_social_change("twitter", e.target.value)
                          }
                        />
                      </div>
                      <div>
                        <label
                          className="block text-[11px] font-medium mb-1.5"
                          htmlFor="contact-github"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          GitHub
                        </label>
                        <Input
                          className="h-9 text-[13px]"
                          id="contact-github"
                          placeholder="github.com/username"
                          value={form_data.social_links?.github || ""}
                          onChange={(e) =>
                            handle_social_change("github", e.target.value)
                          }
                        />
                      </div>
                    </div>
                  </motion.div>
                )}

                {active_tab === "photo" && is_edit_mode && contact && (
                  <motion.div
                    key="photo"
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    initial={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <div className="space-y-4">
                      <div
                        className="flex items-center gap-2 pb-2 border-b"
                        style={{ borderColor: "var(--border-secondary)" }}
                      >
                        <PhotoIcon
                          className="w-4 h-4"
                          style={{ color: "var(--text-muted)" }}
                        />
                        <span
                          className="text-[11px] font-medium uppercase tracking-wider"
                          style={{ color: "var(--text-muted)" }}
                        >
                          Profile Photo
                        </span>
                      </div>
                      <ContactPhotoUpload
                        contact_id={contact.id}
                        current_photo={current_photo}
                        disabled={is_loading}
                        on_photo_change={on_photo_change || (() => {})}
                      />
                    </div>
                  </motion.div>
                )}

                {active_tab === "files" && is_edit_mode && contact && (
                  <motion.div
                    key="files"
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    initial={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <div className="space-y-4">
                      <div
                        className="flex items-center gap-2 pb-2 border-b"
                        style={{ borderColor: "var(--border-secondary)" }}
                      >
                        <PaperClipIcon
                          className="w-4 h-4"
                          style={{ color: "var(--text-muted)" }}
                        />
                        <span
                          className="text-[11px] font-medium uppercase tracking-wider"
                          style={{ color: "var(--text-muted)" }}
                        >
                          Attachments
                        </span>
                      </div>
                      <ContactAttachmentsPanel
                        attachments={attachments}
                        contact_id={contact.id}
                        disabled={is_loading}
                        on_attachments_change={
                          on_attachments_change || (() => {})
                        }
                      />
                    </div>
                  </motion.div>
                )}

                {active_tab === "fields" && is_edit_mode && contact && (
                  <motion.div
                    key="fields"
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    initial={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <div className="space-y-4">
                      <div
                        className="flex items-center gap-2 pb-2 border-b"
                        style={{ borderColor: "var(--border-secondary)" }}
                      >
                        <AdjustmentsHorizontalIcon
                          className="w-4 h-4"
                          style={{ color: "var(--text-muted)" }}
                        />
                        <span
                          className="text-[11px] font-medium uppercase tracking-wider"
                          style={{ color: "var(--text-muted)" }}
                        >
                          Custom Fields
                        </span>
                      </div>
                      <ContactCustomFields
                        contact_id={contact.id}
                        disabled={is_loading}
                        field_values={custom_field_values}
                        on_field_values_change={
                          on_custom_field_values_change || (() => {})
                        }
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div
              className="px-6 py-5 flex items-center justify-center gap-3 border-t"
              style={{ borderColor: "var(--border-primary)" }}
            >
              <button
                className="flex-1 h-12 text-[15px] font-medium rounded-xl transition-colors hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-50 border"
                disabled={is_loading}
                style={{
                  color: "var(--text-secondary)",
                  borderColor: "var(--border-primary)",
                  backgroundColor: "var(--bg-secondary)",
                }}
                onClick={handle_close}
              >
                Cancel
              </button>
              <button
                className="flex-1 h-12 text-[15px] font-semibold rounded-xl flex items-center justify-center transition-all duration-150 hover:brightness-110 disabled:opacity-50"
                disabled={is_loading}
                style={{
                  background:
                    "linear-gradient(to bottom, #6b8aff 0%, #4f6ef7 50%, #3b5ae8 100%)",
                  color: "#ffffff",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  borderBottom: "1px solid rgba(0, 0, 0, 0.15)",
                }}
                onClick={handle_submit}
              >
                {is_loading && (
                  <ArrowPathIcon className="w-4 h-4 mr-2 animate-spin" />
                )}
                {is_edit_mode ? "Save Changes" : "Add Contact"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
