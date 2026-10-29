import { Suspense } from "react";
import { Card, Loading, Badge } from "@/components/ui";
import { getDb } from "@/db/client";
import { requirePharmacy } from "@/lib/auth";
import { can, canManageRole, ROLES } from "@/server/auth/permissions";
import { listPharmacyUsers } from "@/server/users";
import { toggleUserAction } from "./actions";
import { UserForm } from "./user-form";

export default function UsersPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Users />
    </Suspense>
  );
}

async function Users() {
  const session = await requirePharmacy();
  if (!can(session.role, "users.manage")) return <p className="text-sm text-red-700">You do not have access to user management.</p>;

  const list = await listPharmacyUsers(getDb(), session.pharmacy.id);
  const assignableRoles = ROLES.filter((r) => canManageRole(session.role, r));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Users</h1>
      <Card title="Add user">
        <UserForm assignableRoles={assignableRoles} />
      </Card>
      <Card title="Users of this pharmacy">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="py-2 pr-4">Username</th>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Role</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {list.map((u) => (
                <tr key={u.userId} className="border-t border-slate-100">
                  <td className="py-2 pr-4 font-mono">{u.username}</td>
                  <td className="py-2 pr-4">{u.fullName}</td>
                  <td className="py-2 pr-4"><Badge tone="info" className="uppercase">{u.role}</Badge></td>
                  <td className="py-2 pr-4"><Badge tone={u.isActive ? "success" : "neutral"}>{u.isActive ? "Active" : "Inactive"}</Badge></td>
                  <td className="py-2 text-right">
                    {u.userId !== session.user.id && canManageRole(session.role, u.role) && (
                      <form action={toggleUserAction}>
                        <input type="hidden" name="userId" value={u.userId} />
                        <input type="hidden" name="activate" value={String(!u.isActive)} />
                        <button className="text-emerald-700 underline">{u.isActive ? "Deactivate" : "Activate"}</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
