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
    heading: "Agreement to Terms",
    body: 'By creating an account, accessing, or using any Aster service ("Service"), you agree to be bound by these Terms of Service ("Terms") and our Privacy Policy. If you are accepting these Terms on behalf of an organization, you represent that you have authority to bind that organization. If you do not agree, do not use the Service.',
  },
  {
    heading: "Description of Service",
    body: 'Aster Mail is an end-to-end encrypted email service operated by Aster Communications Inc. ("Aster", "we", "us"). The Service includes the Aster Mail web application, Aster Portal, and any associated desktop and mobile applications. We provide encrypted email, contacts, calendar, and file storage built on a zero-knowledge architecture where your content is encrypted on your device before reaching our servers.',
  },
  {
    heading: "Account Registration and Security",
    body: "You must provide a valid email address to create an account. You agree to provide accurate information and to keep your account credentials secure. You are solely responsible for all activity under your account.\n\nAster Mail operates on a zero-knowledge encryption model. Your encryption keys are derived from your password and stored only on your devices in encrypted form. We do not have access to your password or private keys. If you lose your password and have not configured account recovery options, we cannot restore access to your encrypted data. This is a fundamental security property of the Service, not a limitation.",
  },
  {
    heading: "Acceptable Use",
    body: "You agree to use the Service only for lawful purposes and in compliance with all applicable laws. You must not use the Service to:\n\n\u2022 Send unsolicited bulk email, spam, or phishing messages\n\u2022 Transmit malware, viruses, or any code designed to harm\n\u2022 Harass, abuse, threaten, or impersonate any person\n\u2022 Violate the intellectual property rights of others\n\u2022 Engage in any activity that is illegal under applicable law\n\u2022 Attempt to gain unauthorized access to the Service, other accounts, or connected systems\n\u2022 Interfere with or disrupt the integrity or performance of the Service\n\nBecause we cannot read the content of your encrypted messages, enforcement of these terms is based on metadata patterns, abuse reports from recipients, and other signals that do not require access to message content.",
  },
  {
    heading: "User Content and Ownership",
    body: "You retain all rights to the content you create, send, receive, and store through the Service. Aster does not claim any ownership over your content. Because your content is end-to-end encrypted, we cannot access, use, or monetize it.\n\nYou grant Aster only the limited technical permissions necessary to operate the Service on your behalf, such as storing your encrypted data on our servers and transmitting your encrypted messages to their intended recipients.",
  },
  {
    heading: "Encryption and Zero-Knowledge Architecture",
    body: "The Service is designed so that Aster has zero knowledge of the content of your emails, contacts, files, and settings. All user content is encrypted on the client side using keys derived from your credentials. We do not hold, escrow, or have the ability to reconstruct your private encryption keys.\n\nThis architecture means:\n\n\u2022 We cannot read, scan, or analyze the content of your messages\n\u2022 We cannot comply with requests to produce the plaintext content of your communications\n\u2022 We cannot recover your data if you lose access to your encryption keys\n\u2022 Targeted advertising based on email content is technically impossible\n\nWe will never introduce backdoors, key escrow mechanisms, or any feature that would compromise the zero-knowledge property of the Service.",
  },
  {
    heading: "Free and Paid Plans",
    body: "The Service is available through free and paid subscription plans. Free accounts are subject to storage and feature limitations as described on our pricing page. Paid plans are billed in advance on a monthly or annual basis.\n\nYou may cancel your paid subscription at any time. Upon cancellation, you will retain access to paid features through the end of your current billing period. We do not provide refunds for partial billing periods except where required by applicable law.\n\nWe reserve the right to modify pricing with at least 30 days notice. Price changes will not apply to your current billing period.",
  },
  {
    heading: "Open Source Software",
    body: "Aster Mail client applications are licensed under the AGPLv3 v3.0 (AGPL-3.0). The source code is publicly available for inspection, audit, and contribution. This transparency is a deliberate choice to allow independent verification of our security and privacy claims.\n\nThird-party open source components included in the Service are subject to their respective licenses.",
  },
  {
    heading: "Service Availability",
    body: "We strive to maintain high availability of the Service but do not guarantee uninterrupted access. The Service may be temporarily unavailable due to maintenance, updates, or circumstances beyond our control.\n\nWe reserve the right to modify, suspend, or discontinue any part of the Service with reasonable notice. If we discontinue the Service entirely, we will provide at least 90 days notice and the ability to export all your data.",
  },
  {
    heading: "Account Suspension and Termination",
    body: "You may delete your account at any time through your Aster Portal settings. Upon requesting deletion, your account enters a 30-day grace period during which you may cancel the deletion and export your data. After the grace period, all data associated with your account is permanently and irreversibly destroyed.\n\nWe may suspend or terminate your account if we reasonably determine that you have violated these Terms. Where possible, we will provide notice and an opportunity to export your data before termination. In cases of severe abuse, we may act immediately to protect the Service and its users.\n\nUpon termination for any reason, your right to use the Service ceases immediately. Sections of these Terms that by their nature should survive termination will remain in effect.",
  },
  {
    heading: "Disclaimer of Warranties",
    body: 'THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, OR STATUTORY. TO THE MAXIMUM EXTENT PERMITTED BY LAW, ASTER DISCLAIMS ALL WARRANTIES, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, AND ANY WARRANTIES ARISING FROM COURSE OF DEALING OR USAGE OF TRADE.\n\nWe do not warrant that the Service will be uninterrupted, error-free, or completely secure. While we implement strong encryption and security measures, no system can guarantee absolute security.',
  },
  {
    heading: "Limitation of Liability",
    body: "TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, ASTER SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, DATA, USE, OR GOODWILL, ARISING FROM OR RELATED TO YOUR USE OF THE SERVICE.\n\nOUR TOTAL LIABILITY FOR ALL CLAIMS ARISING FROM OR RELATED TO THE SERVICE SHALL NOT EXCEED THE AMOUNT YOU PAID TO ASTER IN THE TWELVE (12) MONTHS PRECEDING THE EVENT GIVING RISE TO THE CLAIM, OR ONE HUNDRED U.S. DOLLARS ($100), WHICHEVER IS GREATER.\n\nThese limitations apply regardless of the theory of liability and even if Aster has been advised of the possibility of such damages. Some jurisdictions do not allow the exclusion of certain warranties or limitation of certain damages, so some of the above may not apply to you.",
  },
  {
    heading: "Indemnification",
    body: "You agree to indemnify and hold harmless Aster, its officers, directors, employees, and agents from any claims, damages, losses, or expenses (including reasonable legal fees) arising from your use of the Service, your violation of these Terms, or your violation of any rights of a third party.",
  },
  {
    heading: "Governing Law and Dispute Resolution",
    body: "These Terms are governed by the laws of the State of Delaware, United States, without regard to its conflict of law provisions. The United Nations Convention on Contracts for the International Sale of Goods does not apply.\n\nAny dispute arising from or relating to these Terms or the Service shall first be attempted to be resolved through good-faith negotiation. If negotiation fails, the dispute shall be resolved through binding arbitration under the rules of the American Arbitration Association, with arbitration taking place in Wilmington, Delaware. Each party shall bear its own costs.\n\nNothing in this section prevents either party from seeking injunctive or other equitable relief in any court of competent jurisdiction.",
  },
  {
    heading: "Changes to These Terms",
    body: "We may revise these Terms from time to time. For material changes, we will notify you at least 30 days before the revised Terms take effect by sending a notice to the email address associated with your account or by displaying a prominent notice within the Service.\n\nYour continued use of the Service after the effective date of revised Terms constitutes your acceptance. If you do not agree to the revised Terms, you must stop using the Service and may delete your account.",
  },
  {
    heading: "Severability",
    body: "If any provision of these Terms is found to be unenforceable or invalid by a court of competent jurisdiction, that provision will be enforced to the maximum extent permissible, and the remaining provisions will remain in full force and effect.",
  },
  {
    heading: "Contact",
    body: "If you have questions about these Terms of Service, you may contact us at:\n\nAster Communications Inc.\nEmail: legal@astermail.org\nSupport: Available through your Aster Portal",
  },
];

export default function TermsOfServicePage() {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Terms of Service | Aster Mail";
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
            Terms of Service
          </h1>
          <p className="mt-2 text-xs text-txt-muted">
            Effective date: {LAST_UPDATED}
          </p>
        </div>

        <div className="rounded-xl border p-5 mb-5 bg-surf-card border-edge-primary">
          <p className="text-sm text-txt-secondary leading-relaxed">
            Welcome to Aster Mail, operated by Aster Communications Inc. These
            Terms of Service constitute a legally binding agreement between you
            and Aster Communications Inc. governing your use of our end-to-end
            encrypted email service and related products. Please read these
            terms carefully before using our services.
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
            to="/privacy"
          >
            View Privacy Policy &rarr;
          </Link>
          <span>&copy; 2026 Aster Communications Inc.</span>
        </div>
      </div>
    </motion.div>
  );
}
