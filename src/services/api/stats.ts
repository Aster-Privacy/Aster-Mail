import { api_client, type ApiResponse } from "./client";

export interface MailStats {
  inbox: number;
  unread: number;
  starred: number;
  sent: number;
  drafts: number;
  scheduled: number;
  archived: number;
  spam: number;
  trash: number;
  storage_bytes: number;
}

export async function get_mail_stats(): Promise<ApiResponse<MailStats>> {
  return api_client.get<MailStats>("/mail/stats");
}
