import { api_client, type ApiResponse } from "./client";

interface DeleteAccountRequest {
  password_hash: string;
}

interface DeleteAccountResponse {
  success: boolean;
  message: string;
}

export async function delete_account(
  password_hash: string,
): Promise<ApiResponse<DeleteAccountResponse>> {
  const response = await api_client.delete<DeleteAccountResponse>("/core/v1/account", {
    data: { password_hash },
  });

  if (response.data?.success) {
    api_client.set_authenticated(false);
  }

  return response;
}

export type { DeleteAccountRequest, DeleteAccountResponse };
