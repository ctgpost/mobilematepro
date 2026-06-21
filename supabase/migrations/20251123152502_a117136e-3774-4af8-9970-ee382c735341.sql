-- Add warranty tracking fields to products table
ALTER TABLE products
ADD COLUMN warranty_expiry_date DATE,
ADD COLUMN warranty_status TEXT DEFAULT 'no_warranty';

-- Add comment for warranty_status field
COMMENT ON COLUMN products.warranty_status IS 'Warranty status: no_warranty, active, expired, void';