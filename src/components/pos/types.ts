export interface CartItem {
  product: any;
  quantity: number;
  customPrice: number;
}

export interface Product {
  id: string;
  name: string;
  sku?: string;
  brand?: string;
  model?: string;
  barcode?: string;
  imei?: string;
  price: number;
  cost: number;
  stock_quantity: number;
  condition?: string;
}

export interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
}
