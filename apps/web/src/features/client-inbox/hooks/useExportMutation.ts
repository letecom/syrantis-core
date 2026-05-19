import { useMutation, useQueryClient } from "@tanstack/react-query";

import { cancelLiveInboxGmailExport, requestLiveInboxGmailExport } from "../api/liveAdapter";
import { CLIENT_INBOX_LIVE_QUERY_KEY } from "./useInboxList";

async function refetchInbox(queryClient: ReturnType<typeof useQueryClient>, mailItemId: string) {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: [...CLIENT_INBOX_LIVE_QUERY_KEY, "messages"],
    }),
    queryClient.invalidateQueries({
      queryKey: [...CLIENT_INBOX_LIVE_QUERY_KEY, "message-detail", mailItemId],
    }),
  ]);
}

export function useExportRequestMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (mailItemId: string) => requestLiveInboxGmailExport(mailItemId),
    onSuccess: async (_result, mailItemId) => {
      await refetchInbox(queryClient, mailItemId);
    },
  });
}

export function useExportCancelMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (mailItemId: string) => cancelLiveInboxGmailExport(mailItemId),
    onSuccess: async (_result, mailItemId) => {
      await refetchInbox(queryClient, mailItemId);
    },
  });
}
