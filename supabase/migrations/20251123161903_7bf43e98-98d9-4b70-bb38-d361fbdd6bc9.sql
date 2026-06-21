-- Add DELETE policies for sales and sale_items tables
-- This allows authenticated users to delete their sales records

-- Policy for deleting sales
CREATE POLICY "Authenticated users can delete sales" 
ON sales 
FOR DELETE 
USING (auth.uid() IS NOT NULL);

-- Policy for deleting sale_items
CREATE POLICY "Authenticated users can delete sale items" 
ON sale_items 
FOR DELETE 
USING (auth.uid() IS NOT NULL);

-- Policy for deleting returns (already has INSERT and UPDATE, adding DELETE)
CREATE POLICY "Authenticated users can delete returns" 
ON returns 
FOR DELETE 
USING (auth.uid() IS NOT NULL);