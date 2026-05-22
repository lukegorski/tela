import { listAdminUsers } from '@/lib/admin-users';
import { requireAdmin } from '@/lib/admin';
import { AdminUserList } from '@/components/admin/AdminUserList';

export const dynamic = 'force-dynamic';

export default async function AdminChatPage() {
  await requireAdmin();

  const users = await listAdminUsers();

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-lg font-medium tracking-tight">Chat conversations</h2>
        <p className="text-sm text-stone-500">
          Select a user to view their chat history with the AI stylist.
        </p>
      </header>

      <AdminUserList users={users} hrefBuilder={(id) => `/admin/users/${id}?tab=chats`} />
    </div>
  );
}
