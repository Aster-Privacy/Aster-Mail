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
import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronLeftIcon } from "@heroicons/react/20/solid";

import {
  BACK_BUTTON_CLASS,
  BACK_BUTTON_STYLE,
} from "@/components/auth/mobile_auth_motion";

const LAST_UPDATED = "February 17, 2026";

const SECTIONS = [
  {
    heading: "Information We Collect",
    body: "We collect the minimum amount of information necessary to provide the Service:\n\n\u2022 Email address: required for account creation and email delivery\n\u2022 Encrypted email content: stored only in encrypted form that we cannot read\n\u2022 Encrypted contacts and settings: stored only in encrypted form\n\u2022 Basic account metadata: account creation date, plan type, storage usage\n\u2022 Payment information: processed by our payment provider; we do not store credit card numbers\n\nWe do not collect:\n\n\u2022 IP addresses (not stored permanently; used only transiently for rate limiting)\n\u2022 Device fingerprints or tracking identifiers\n\u2022 Browsing history or usage analytics\n\u2022 Location data\n\u2022 Any third-party tracking data",
  },
  {
    heading: "How We Use Information",
    body: "The limited information we collect is used exclusively to:\n\n\u2022 Deliver and route email messages\n\u2022 Maintain your account and provide customer support\n\u2022 Process payments for paid plans\n\u2022 Send essential service notifications (security alerts, account changes)\n\u2022 Prevent abuse and enforce our Terms of Service\n\nWe never use your data for advertising, profiling, behavioral analysis, or any purpose other than providing the email service you signed up for. We do not sell, rent, license, or otherwise share your personal information with third parties for their marketing purposes.",
  },
  {
    heading: "End-to-End Encryption and Zero-Knowledge Architecture",
    body: "Aster Mail is built on a zero-knowledge architecture. This is a core design principle, not an optional feature:\n\n\u2022 All email content is encrypted on your device before being transmitted to our servers\n\u2022 Your encryption keys are derived from your password and never leave your device in plaintext form\n\u2022 We cannot read, scan, or analyze your emails, contacts, calendar entries, or settings\n\u2022 Messages between Aster users are protected with the Signal protocol, providing forward secrecy\n\u2022 Messages to external recipients use PGP encryption when the recipient supports it\n\u2022 Your private key is encrypted with AES-256-GCM using a key derived via BLAKE3\n\u2022 We cannot comply with requests to produce the plaintext content of your communications because we do not possess the ability to decrypt them\n\nThis means that even in the event of a server breach, a legal order, or a rogue employee, your data remains protected because we simply cannot access it.",
  },
  {
    heading: "Data Storage and Security",
    body: "Your encrypted data is stored on servers located in the European Union, subject to GDPR protections. We implement comprehensive security measures including:\n\n\u2022 Full disk encryption on all servers\n\u2022 Strict access controls and audit logging for all infrastructure\n\u2022 Regular independent security assessments and penetration testing\n\u2022 No logging of email content or metadata beyond what is strictly necessary for message delivery\n\u2022 Network-level isolation between services\n\nSensitive cryptographic material is zeroized from memory after use and is never written to persistent storage in plaintext. Our server infrastructure is designed so that no single employee has access to all systems simultaneously.",
  },
  {
    heading: "Third-Party Services",
    body: "We minimize our use of third-party services to protect your privacy. We do not use:\n\n\u2022 Third-party analytics or tracking services\n\u2022 Advertising networks or data brokers\n\u2022 Social media tracking pixels or widgets\n\u2022 External CDN services for user content\n\u2022 Any service that would require sharing your data with third parties\n\nPayment processing is handled by trusted payment providers who receive only the information necessary to process your transaction. Payment providers do not have access to your email content, encryption keys, or account data. We do not share any data with payment providers beyond what is required to complete the transaction.",
  },
  {
    heading: "Cookies and Local Storage",
    body: "Aster Mail uses only essential cookies and local storage required for the Service to function. These include:\n\n\u2022 Authentication tokens to keep you signed in\n\u2022 Encrypted key material stored locally on your device\n\u2022 User preferences such as theme and language settings\n\nWe do not use tracking cookies, advertising cookies, or any form of cross-site tracking. We do not participate in any advertising networks or cookie-based tracking systems.",
  },
  {
    heading: "Data Retention",
    body: "We retain your encrypted data only for as long as your account is active. When you delete your account:\n\n\u2022 A 30-day grace period allows you to cancel the deletion and export your data\n\u2022 After the grace period, all data is permanently and irreversibly deleted from our primary systems\n\u2022 This includes emails, contacts, calendar entries, settings, encryption keys, and all associated metadata\n\u2022 Backups containing your data are purged within 30 days of account deletion\n\nYou can export all your data at any time through your Aster Portal settings before deletion. We provide exports in standard formats (MBOX for emails, vCard for contacts, JSON for settings) to ensure portability.",
  },
  {
    heading: "Your Rights",
    body: "Regardless of your jurisdiction, we provide the following rights to all users:\n\n\u2022 Access: export a complete copy of all your data at any time through your Portal settings\n\u2022 Rectification: update your account information at any time\n\u2022 Erasure: permanently delete your account and all associated data\n\u2022 Portability: export your data in standard, machine-readable formats\n\u2022 Objection: contact us to object to any specific data processing activity\n\u2022 Restriction: request that we limit processing of your data while a concern is resolved\n\nFor users in the European Economic Area, these rights are guaranteed under the General Data Protection Regulation (GDPR). For users in California, additional rights under the California Consumer Privacy Act (CCPA) apply. We do not discriminate against users who exercise their privacy rights.",
  },
  {
    heading: "Law Enforcement and Government Requests",
    body: "Due to our zero-knowledge architecture, we are technically unable to provide the plaintext content of your communications to any third party, including law enforcement and government agencies.\n\nIf we receive a valid legal request, we can only provide the limited unencrypted metadata we possess, such as your email address, account creation date, and plan type. We cannot provide the contents of your emails, contacts, or files because they are encrypted with keys we do not possess.\n\nWe will notify affected users of any legal requests for their data unless we are legally prohibited from doing so. We publish a transparency report detailing the number and types of requests we receive.",
  },
  {
    heading: "Children's Privacy",
    body: "Aster Mail is not intended for children under the age of 16. We do not knowingly collect personal information from children under 16. If you believe a child under 16 has created an account, please contact us and we will promptly delete the account and all associated data.",
  },
  {
    heading: "International Data Transfers",
    body: "Your encrypted data is stored in the European Union. If you access the Service from outside the EU, your data is transmitted to and stored in the EU. Because all user content is end-to-end encrypted before it leaves your device, the risk associated with data transfer is minimal, as the data is unreadable without your encryption keys regardless of where it is stored or transmitted.",
  },
  {
    heading: "Changes to This Policy",
    body: "We may update this Privacy Policy from time to time. We will notify users of material changes via email or through the Service at least 30 days before changes take effect. The date at the top of this page indicates when the policy was last updated.\n\nWe will never change this policy in a way that reduces the privacy protections afforded to your data without providing explicit notice and obtaining your consent. Any change that would weaken our zero-knowledge architecture or introduce data collection beyond what is described here will require active opt-in from affected users.",
  },
  {
    heading: "Contact",
    body: "If you have questions about this Privacy Policy or our privacy practices, you may contact us at:\n\nAster Communications Inc.\nEmail: privacy@astermail.org\nSupport: Available through your Aster Portal",
  },
];

export default function PrivacyPolicyPage() {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Privacy Policy | Aster Mail";
  }, []);

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="fixed inset-0 overflow-y-auto transition-colors duration-200 bg-surf-secondary"
      initial={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="max-w-3xl mx-auto px-6 py-12 pb-16">
        <div className="relative flex items-center justify-center mb-8">
          <motion.button
            className={`${BACK_BUTTON_CLASS} absolute left-0`}
            style={BACK_BUTTON_STYLE}
            type="button"
            onClick={() => navigate(-1)}
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </motion.button>
          <Link className="flex-shrink-0" to="/register">
            <img
              alt="Aster"
              className="h-8"
              decoding="async"
              draggable={false}
              src="/text_logo.png"
            />
          </Link>
        </div>

        <div className="mb-8">
          <h1 className="text-2xl font-bold text-txt-primary">
            Privacy Policy
          </h1>
          <p className="mt-2 text-xs text-txt-muted">
            Last updated: {LAST_UPDATED}
          </p>
        </div>

        <div className="rounded-xl border p-5 mb-5 bg-surf-card border-edge-primary">
          <p className="text-sm text-txt-secondary leading-relaxed">
            At Aster Communications Inc., privacy is the foundation of
            everything we build. This Privacy Policy explains how we handle your
            data when you use Aster Mail and related services. Our guiding
            principle is simple: your data belongs to you, and we should never
            be able to access it.
          </p>
        </div>

        <div className="space-y-4">
          {SECTIONS.map((section, index) => (
            <div
              key={index}
              className="rounded-xl border p-5 bg-surf-card border-edge-primary"
            >
              <h2 className="text-base font-semibold text-txt-primary mb-2">
                {`${index + 1}. ${section.heading}`}
              </h2>
              <p className="text-sm text-txt-secondary leading-relaxed whitespace-pre-line">
                {section.body}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-8 pb-8 flex items-center justify-between text-xs text-txt-muted">
          <Link
            className="transition-colors hover:text-txt-secondary"
            to="/terms"
          >
            View Terms of Service &rarr;
          </Link>
          <span>&copy; 2026 Aster Communications Inc.</span>
        </div>
      </div>
    </motion.div>
  );
}
