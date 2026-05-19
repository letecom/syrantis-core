import "../styles/client-design-tokens.css";

import { InboxLayout, mockClientInbox } from "../features/client-inbox";

export function ClientInboxPreviewPage() {
  return <InboxLayout inbox={mockClientInbox} />;
}
