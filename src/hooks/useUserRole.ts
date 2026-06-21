import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type AppRole = 'admin' | 'manager' | 'staff';

export interface RolePermissions {
  canAccessSettings: boolean;
  canAccessReports: boolean;
  canAccessUserManagement: boolean;
  canManageProducts: boolean;
  canManageCustomers: boolean;
  canManageSuppliers: boolean;
  canManageCategories: boolean;
  canAccessPOS: boolean;
  canAccessSales: boolean;
  canAccessReturns: boolean;
  canAccessDashboard: boolean;
  canBackupRestore: boolean;
  canResetData: boolean;
}

const rolePermissions: Record<AppRole, RolePermissions> = {
  admin: {
    canAccessSettings: true,
    canAccessReports: true,
    canAccessUserManagement: true,
    canManageProducts: true,
    canManageCustomers: true,
    canManageSuppliers: true,
    canManageCategories: true,
    canAccessPOS: true,
    canAccessSales: true,
    canAccessReturns: true,
    canAccessDashboard: true,
    canBackupRestore: true,
    canResetData: true,
  },
  manager: {
    canAccessSettings: false,
    canAccessReports: false,
    canAccessUserManagement: false,
    canManageProducts: true,
    canManageCustomers: false,
    canManageSuppliers: false,
    canManageCategories: false,
    canAccessPOS: false,
    canAccessSales: true,
    canAccessReturns: false,
    canAccessDashboard: true,
    canBackupRestore: true,
    canResetData: false,
  },
  staff: {
    canAccessSettings: false,
    canAccessReports: false,
    canAccessUserManagement: false,
    canManageProducts: false,
    canManageCustomers: false,
    canManageSuppliers: false,
    canManageCategories: false,
    canAccessPOS: false,
    canAccessSales: true,
    canAccessReturns: false,
    canAccessDashboard: true,
    canBackupRestore: false,
    canResetData: false,
  },
};

export function useUserRole() {
  const [role, setRole] = useState<AppRole | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isManager, setIsManager] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<RolePermissions>(rolePermissions.staff);

  useEffect(() => {
    const fetchRole = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setLoading(false);
          return;
        }

        setUserId(user.id);

        const { data, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) {
          console.error('Error fetching role:', error);
        } else if (data) {
          const userRole = data.role as AppRole;
          setRole(userRole);
          setIsAdmin(userRole === 'admin');
          setIsManager(userRole === 'manager' || userRole === 'admin');
          setPermissions(rolePermissions[userRole] || rolePermissions.staff);
        } else {
          // Default to staff if no role found
          setRole('staff');
          setPermissions(rolePermissions.staff);
        }
      } catch (error) {
        console.error('Error in useUserRole:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchRole();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      fetchRole();
    });

    return () => subscription.unsubscribe();
  }, []);

  return { role, isAdmin, isManager, loading, userId, permissions };
}

