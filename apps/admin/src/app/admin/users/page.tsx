import { listAdminUsers } from '@/lib/admin-users';
import { requireAdmin } from '@/lib/admin';
import { AdminUserList } from '@/components/admin/AdminUserList';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  await requireAdmin();

  const users = await listAdminUsers();

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-lg font-medium tracking-tight">Users</h2>
        <p className="text-sm text-stone-500">
          {users.length} total. Click into a user to see their wardrobe, outfits, chats, and AI
          history.
        </p>
      </header>

      <AdminUserList users={users} />
    </div>
  );
}
