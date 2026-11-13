export interface CartItem {
  product: any;
  cartKey?: string;
  quantity: number;
  customPrice: number;
  imei?: string | null;
  availableImeis?: string[];
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
