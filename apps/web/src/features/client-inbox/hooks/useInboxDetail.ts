import { useQuery } from "@tanstack/react-query";

import { getLiveInboxMessage } from "../api/liveAdapter";
import { CLIENT_INBOX_LIVE_QUERY_KEY } from "./useInboxList";

export function useInboxDetail(mailItemId: string | null) {
  return useQuery({
    queryKey: [...CLIENT_INBOX_LIVE_QUERY_KEY, "message-detail", mailItemId],
    queryFn: ({ signal }) => {
      if (!mailItemId) {
        throw new Error("A selected message is required.");
      }

      return getLiveInboxMessage(mailItemId, { signal });
    },
    enabled: Boolean(mailItemId),
  });
}
