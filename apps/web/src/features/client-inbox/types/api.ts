import type { ClientInboxMessageDetail, ClientInboxMessagesData } from "../../../lib/api-client";

export type ClientInboxLiveTab = "all" | "needs_review" | "hot" | "ready_draft" | "ignored";

export type ClientInboxLiveSort = "newest";

export type ClientInboxLiveListData = ClientInboxMessagesData;

export type ClientInboxLiveListItem = ClientInboxMessagesData["items"][number];

export type ClientInboxLiveDetail = ClientInboxMessageDetail;

export type ClientInboxLiveListParams = {
  tab: ClientInboxLiveTab;
  sort: ClientInboxLiveSort;
  limit: 20;
};

export type ClientInboxDraftEditPayload = {
  subject: string;
  bodyText: string;
};
