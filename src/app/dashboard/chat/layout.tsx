/**
 * Fills the dashboard main flex column so the chat card can use flex-1 + min-h-0
 * and keep scrolling confined to the message list.
 */
export default function DashboardChatLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-0 w-full flex-1 flex-col">{children}</div>;
}
