import { listAdminUsers } from '@/lib/admin-users';
import { requireAdmin } from '@/lib/admin';
import { AdminUserList } from '@/components/admin/AdminUserList';

export const dynamic = 'force-dynamic';

export default async function AdminChatPage() {
  await requireAdmin();

  const allUsers = await listAdminUsers();
  const chatUsers = allUsers
    .filter((u) => u.chatMessageCount > 0)
    .sort((a, b) => b.chatMessageCount - a.chatMessageCount);

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-lg font-medium tracking-tight">Chat conversations</h2>
        <p className="text-sm text-stone-500">
          {chatUsers.length === 0
            ? 'No chat activity yet.'
            : `${chatUsers.length} user${chatUsers.length === 1 ? '' : 's'} with chat history, sorted by message count. Click a row to read their conversations.`}
        </p>
      </header>

      {chatUsers.length > 0 && (
        <AdminUserList users={chatUsers} hrefBuilder={(id) => `/admin/users/${id}?tab=chats`} />
      )}
    </div>
  );
}
