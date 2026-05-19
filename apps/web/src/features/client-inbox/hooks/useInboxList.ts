import { useQuery } from "@tanstack/react-query";

import { listLiveInboxMessages } from "../api/liveAdapter";
import type { ClientInboxLiveListParams } from "../types/api";

export const CLIENT_INBOX_LIVE_QUERY_KEY = ["client-inbox-live"] as const;

export function useInboxList(params: ClientInboxLiveListParams) {
  return useQuery({
    queryKey: [...CLIENT_INBOX_LIVE_QUERY_KEY, "messages", params],
    queryFn: ({ signal }) => listLiveInboxMessages(params, { signal }),
  });
}
