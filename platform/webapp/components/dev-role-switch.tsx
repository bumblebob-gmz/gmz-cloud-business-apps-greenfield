'use client';

import { useEffect, useState } from 'react';
import { type DevRole, getDevRole, setDevRole } from '@/lib/dev-auth-client';

const roles: DevRole[] = ['admin', 'technician', 'readonly'];
const ENABLE_DEV_ROLE_SWITCH = process.env.NEXT_PUBLIC_ENABLE_DEV_ROLE_SWITCH === 'true';

export function DevRoleSwitch() {
  if (!ENABLE_DEV_ROLE_SWITCH) return null;
  const [role, setRole] = useState<DevRole>('technician');

  useEffect(() => {
    setRole(getDevRole());
  }, []);

  return (
    <label className="mt-4 block text-xs text-slate-600">
      <span className="mb-1 block font-semibold uppercase tracking-wide text-slate-500">Dev role</span>
      <select
        value={role}
        onChange={(event) => {
          const nextRole = event.target.value as DevRole;
          setRole(nextRole);
          setDevRole(nextRole);
        }}
        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
      >
        {roles.map((entry) => (
          <option key={entry} value={entry}>
            {entry}
          </option>
        ))}
      </select>
    </label>
  );
}
