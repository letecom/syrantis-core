import { useMutation, useQueryClient } from "@tanstack/react-query";

import { updateLiveInboxDraft } from "../api/liveAdapter";
import type { ClientInboxDraftEditPayload } from "../types/api";
import { CLIENT_INBOX_LIVE_QUERY_KEY } from "./useInboxList";

type DraftMutationInput = ClientInboxDraftEditPayload & {
  mailItemId: string;
};

export function useDraftMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ mailItemId, subject, bodyText }: DraftMutationInput) =>
      updateLiveInboxDraft(mailItemId, { subject, bodyText }),
    onSuccess: async (_result, input) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: [...CLIENT_INBOX_LIVE_QUERY_KEY, "messages"],
        }),
        queryClient.invalidateQueries({
          queryKey: [...CLIENT_INBOX_LIVE_QUERY_KEY, "message-detail", input.mailItemId],
        }),
      ]);
    },
  });
}
