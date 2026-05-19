import {
  cancelClientInboxGmailExport,
  getClientInboxMessage,
  listClientInboxMessages,
  requestClientInboxGmailExport,
  updateClientInboxDraft,
} from "../../../lib/api-client";
import type {
  ClientInboxDraftEditPayload,
  ClientInboxLiveDetail,
  ClientInboxLiveListData,
  ClientInboxLiveListParams,
} from "../types/api";

type LiveAdapterOptions = {
  signal?: AbortSignal;
};

export function listLiveInboxMessages(
  params: ClientInboxLiveListParams,
  options: LiveAdapterOptions = {},
): Promise<ClientInboxLiveListData> {
  return listClientInboxMessages(params, options);
}

export function getLiveInboxMessage(
  mailItemId: string,
  options: LiveAdapterOptions = {},
): Promise<ClientInboxLiveDetail> {
  return getClientInboxMessage(mailItemId, options);
}

export function updateLiveInboxDraft(mailItemId: string, input: ClientInboxDraftEditPayload) {
  return updateClientInboxDraft(mailItemId, input);
}

export function requestLiveInboxGmailExport(mailItemId: string) {
  return requestClientInboxGmailExport(mailItemId);
}

export function cancelLiveInboxGmailExport(mailItemId: string) {
  return cancelClientInboxGmailExport(mailItemId);
}
