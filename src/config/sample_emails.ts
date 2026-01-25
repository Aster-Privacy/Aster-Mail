export interface Email {
  id: string;
  sender_name: string;
  sender_email: string;
  subject: string;
  preview: string;
  timestamp: string;
  is_unread: boolean;
  has_attachment: boolean;
  avatar_url: string;
}

export const sample_emails: Email[] = [
  {
    id: "1",
    sender_name: "Ava Thompson",
    sender_email: "ava.thompson@userflow.com",
    subject: "Re: Sitemap Refinements",
    preview:
      "Hello Team, I have gathered the latest updates regarding our project based on the recent feedback from our users. The focus is on enhancing usability, minimizing clutter, and ensuring a seamless experience for our primary users.",
    timestamp: "10:11 AM",
    is_unread: true,
    has_attachment: false,
    avatar_url: "https://i.pravatar.cc/150?u=ava",
  },
  {
    id: "2",
    sender_name: "Ethan Carter",
    sender_email: "eth-an.carter@userflow.com",
    subject: "Project Overview Update",
    preview:
      "Hi everyone, I've reviewed the navigation layout and introduced a new section for quick access to frequently used features. I also adjusted margins to align with our updated design standards. Please review and share your feedback.",
    timestamp: "10:26 AM",
    is_unread: true,
    has_attachment: true,
    avatar_url: "https://i.pravatar.cc/150?u=ethan",
  },
  {
    id: "3",
    sender_name: "Sophia Lee",
    sender_email: "sophia.lee@userflow.com",
    subject: "Design System Updates",
    preview:
      "The design team has completed the latest iteration on the component library. We've standardized colors, spacing, and typography. All files are ready for implementation.",
    timestamp: "09:45 AM",
    is_unread: false,
    has_attachment: true,
    avatar_url: "https://i.pravatar.cc/150?u=sophia",
  },
  {
    id: "4",
    sender_name: "Oliver from Nissan",
    sender_email: "oliver@nissan.com",
    subject: "Let's finalize these details during o...",
    preview:
      "Hi, let's finalize these details during our next call. I have some initial thoughts but want to discuss them with the full team first.",
    timestamp: "10:43 AM",
    is_unread: false,
    has_attachment: false,
    avatar_url: "https://i.pravatar.cc/150?u=oliver",
  },
  {
    id: "5",
    sender_name: "Luna from BrightCo",
    sender_email: "luna@brightco.com",
    subject: "UI/UX feedback from stakeholders",
    preview:
      "We've updated the newest UI/UX. Let me know your thoughts on the new interface design and any improvements you'd suggest.",
    timestamp: "09:30 AM",
    is_unread: false,
    has_attachment: false,
    avatar_url: "https://i.pravatar.cc/150?u=luna",
  },
];
