import { supabase } from '@/integrations/supabase/client';

export type ActionType = 
  | 'auth' 
  | 'sale' 
  | 'product' 
  | 'customer' 
  | 'supplier' 
  | 'category'
  | 'settings'
  | 'user_management';

export interface LogActivityParams {
  action: string;
  actionType: ActionType;
  details?: Record<string, any>;
}

export async function logActivity({ action, actionType, details }: LogActivityParams) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) return;

    await supabase.from('activity_logs').insert({
      user_id: user.id,
      user_email: user.email,
      action,
      action_type: actionType,
      details: details || {},
    });
  } catch (error) {
    console.error('Failed to log activity:', error);
  }
}

// Convenience functions for common actions
export const ActivityLogger = {
  login: () => logActivity({
    action: 'User logged in',
    actionType: 'auth',
  }),
  
  logout: () => logActivity({
    action: 'User logged out',
    actionType: 'auth',
  }),
  
  saleCreated: (saleId: string, amount: number, itemCount: number) => logActivity({
    action: `Sale completed: $${amount.toFixed(2)} (${itemCount} items)`,
    actionType: 'sale',
    details: { sale_id: saleId, amount, item_count: itemCount },
  }),
  
  productAdded: (productName: string, productId: string) => logActivity({
    action: `Product added: ${productName}`,
    actionType: 'product',
    details: { product_id: productId, product_name: productName },
  }),
  
  productUpdated: (productName: string, productId: string) => logActivity({
    action: `Product updated: ${productName}`,
    actionType: 'product',
    details: { product_id: productId, product_name: productName },
  }),
  
  productDeleted: (productName: string) => logActivity({
    action: `Product deleted: ${productName}`,
    actionType: 'product',
    details: { product_name: productName },
  }),
  
  customerAdded: (customerName: string) => logActivity({
    action: `Customer added: ${customerName}`,
    actionType: 'customer',
    details: { customer_name: customerName },
  }),
  
  customerUpdated: (customerName: string) => logActivity({
    action: `Customer updated: ${customerName}`,
    actionType: 'customer',
    details: { customer_name: customerName },
  }),
  
  supplierAdded: (supplierName: string) => logActivity({
    action: `Supplier added: ${supplierName}`,
    actionType: 'supplier',
    details: { supplier_name: supplierName },
  }),
  
  categoryAdded: (categoryName: string) => logActivity({
    action: `Category added: ${categoryName}`,
    actionType: 'category',
    details: { category_name: categoryName },
  }),
  
  roleUpdated: (targetEmail: string, newRole: string) => logActivity({
    action: `User role updated: ${targetEmail} → ${newRole}`,
    actionType: 'user_management',
    details: { target_email: targetEmail, new_role: newRole },
  }),
  
  dataBackup: () => logActivity({
    action: 'Database backup created',
    actionType: 'settings',
  }),
  
  dataRestore: () => logActivity({
    action: 'Database restored from backup',
    actionType: 'settings',
  }),
  
  dataReset: () => logActivity({
    action: 'Database reset performed',
    actionType: 'settings',
  }),
};
