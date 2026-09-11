export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string
          action_type: string
          created_at: string
          details: Json | null
          id: string
          ip_address: string | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          action_type: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          action_type?: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      backup_history: {
        Row: {
          cloud_ok: boolean
          cloud_url: string | null
          counts: Json
          created_at: string
          download_ok: boolean
          error: string | null
          filename: string | null
          id: string
          ran_at: string
          tables: string[]
          total_records: number
          trigger_type: string
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          cloud_ok?: boolean
          cloud_url?: string | null
          counts?: Json
          created_at?: string
          download_ok?: boolean
          error?: string | null
          filename?: string | null
          id?: string
          ran_at?: string
          tables?: string[]
          total_records?: number
          trigger_type?: string
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          cloud_ok?: boolean
          cloud_url?: string | null
          counts?: Json
          created_at?: string
          download_ok?: boolean
          error?: string | null
          filename?: string | null
          id?: string
          ran_at?: string
          tables?: string[]
          total_records?: number
          trigger_type?: string
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      customer_ledger_entries: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          customer_id: string
          description: string | null
          entry_date: string
          entry_type: string
          id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          created_by?: string | null
          customer_id: string
          description?: string | null
          entry_date?: string
          entry_type?: string
          id?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string
          description?: string | null
          entry_date?: string
          entry_type?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          photo_url: string | null
          purchase_count: number | null
          total_purchases: number | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          photo_url?: string | null
          purchase_count?: number | null
          total_purchases?: number | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          photo_url?: string | null
          purchase_count?: number | null
          total_purchases?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      due_payments: {
        Row: {
          amount: number
          collected_by: string | null
          created_at: string
          id: string
          notes: string | null
          payment_method: string
          sale_id: string
        }
        Insert: {
          amount: number
          collected_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          payment_method?: string
          sale_id: string
        }
        Update: {
          amount?: number
          collected_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          payment_method?: string
          sale_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "due_payments_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      investment_entries: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          entry_date: string
          entry_type: string
          id: string
          notes: string | null
          purpose: string | null
          sector_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          entry_date?: string
          entry_type?: string
          id?: string
          notes?: string | null
          purpose?: string | null
          sector_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          entry_date?: string
          entry_type?: string
          id?: string
          notes?: string | null
          purpose?: string | null
          sector_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "investment_entries_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "investment_sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      investment_incomes: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          income_date: string
          notes: string | null
          purpose: string | null
          sector_id: string
          source: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          income_date?: string
          notes?: string | null
          purpose?: string | null
          sector_id: string
          source?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          income_date?: string
          notes?: string | null
          purpose?: string | null
          sector_id?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "investment_incomes_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "investment_sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      investment_sectors: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_default: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          barcode: string | null
          battery: string | null
          brand: string | null
          category_id: string | null
          condition: string | null
          cost: number
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          imei: string | null
          low_stock_threshold: number
          model: string | null
          name: string
          price: number
          ram: string | null
          sku: string | null
          stock_quantity: number
          storage: string | null
          supplier_id: string | null
          supplier_mobile: string | null
          supplier_name: string | null
          supplier_nid: string | null
          supplier_photo_url: string | null
          unit: string | null
          updated_at: string
          warranty_expiry_date: string | null
          warranty_status: string | null
        }
        Insert: {
          barcode?: string | null
          battery?: string | null
          brand?: string | null
          category_id?: string | null
          condition?: string | null
          cost?: number
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          imei?: string | null
          low_stock_threshold?: number
          model?: string | null
          name: string
          price?: number
          ram?: string | null
          sku?: string | null
          stock_quantity?: number
          storage?: string | null
          supplier_id?: string | null
          supplier_mobile?: string | null
          supplier_name?: string | null
          supplier_nid?: string | null
          supplier_photo_url?: string | null
          unit?: string | null
          updated_at?: string
          warranty_expiry_date?: string | null
          warranty_status?: string | null
        }
        Update: {
          barcode?: string | null
          battery?: string | null
          brand?: string | null
          category_id?: string | null
          condition?: string | null
          cost?: number
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          imei?: string | null
          low_stock_threshold?: number
          model?: string | null
          name?: string
          price?: number
          ram?: string | null
          sku?: string | null
          stock_quantity?: number
          storage?: string | null
          supplier_id?: string | null
          supplier_mobile?: string | null
          supplier_name?: string | null
          supplier_nid?: string | null
          supplier_photo_url?: string | null
          unit?: string | null
          updated_at?: string
          warranty_expiry_date?: string | null
          warranty_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      purchase_items: {
        Row: {
          created_at: string
          id: string
          product_id: string
          purchase_id: string
          quantity: number
          received_quantity: number | null
          total_cost: number
          unit_cost: number
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          purchase_id: string
          quantity: number
          received_quantity?: number | null
          total_cost: number
          unit_cost: number
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          purchase_id?: string
          quantity?: number
          received_quantity?: number | null
          total_cost?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      purchases: {
        Row: {
          created_at: string
          expected_date: string | null
          id: string
          notes: string | null
          purchase_number: string
          status: string | null
          supplier_id: string | null
          total_amount: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expected_date?: string | null
          id?: string
          notes?: string | null
          purchase_number: string
          status?: string | null
          supplier_id?: string | null
          total_amount?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expected_date?: string | null
          id?: string
          notes?: string | null
          purchase_number?: string
          status?: string | null
          supplier_id?: string | null
          total_amount?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      restore_history: {
        Row: {
          created_at: string
          error: string | null
          id: string
          pre_backup_url: string | null
          ran_at: string
          results: Json
          source_filename: string | null
          source_url: string | null
          success: boolean
          tables: string[]
          total_processed: number
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          pre_backup_url?: string | null
          ran_at?: string
          results?: Json
          source_filename?: string | null
          source_url?: string | null
          success?: boolean
          tables?: string[]
          total_processed?: number
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          pre_backup_url?: string | null
          ran_at?: string
          results?: Json
          source_filename?: string | null
          source_url?: string | null
          success?: boolean
          tables?: string[]
          total_processed?: number
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      return_audit_logs: {
        Row: {
          action: string
          amount_delta: number | null
          created_at: string
          id: string
          new_status: string | null
          notes: Json | null
          previous_status: string | null
          product_id: string | null
          quantity: number | null
          return_id: string
          return_type: string
          stock_delta: number | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          amount_delta?: number | null
          created_at?: string
          id?: string
          new_status?: string | null
          notes?: Json | null
          previous_status?: string | null
          product_id?: string | null
          quantity?: number | null
          return_id: string
          return_type: string
          stock_delta?: number | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          amount_delta?: number | null
          created_at?: string
          id?: string
          new_status?: string | null
          notes?: Json | null
          previous_status?: string | null
          product_id?: string | null
          quantity?: number | null
          return_id?: string
          return_type?: string
          stock_delta?: number | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      returns: {
        Row: {
          cash_refunded: number
          created_at: string
          customer_credit: number
          due_adjusted: number
          exchange_sale_id: string | null
          id: string
          processed_by: string | null
          product_id: string
          quantity: number
          reason_code: string
          reason_notes: string | null
          refund_amount: number
          refund_mode: string
          sale_id: string
          sale_item_id: string
          status: string
          updated_at: string
        }
        Insert: {
          cash_refunded?: number
          created_at?: string
          customer_credit?: number
          due_adjusted?: number
          exchange_sale_id?: string | null
          id?: string
          processed_by?: string | null
          product_id: string
          quantity: number
          reason_code: string
          reason_notes?: string | null
          refund_amount?: number
          refund_mode?: string
          sale_id: string
          sale_item_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          cash_refunded?: number
          created_at?: string
          customer_credit?: number
          due_adjusted?: number
          exchange_sale_id?: string | null
          id?: string
          processed_by?: string | null
          product_id?: string
          quantity?: number
          reason_code?: string
          reason_notes?: string | null
          refund_amount?: number
          refund_mode?: string
          sale_id?: string
          sale_item_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "returns_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_sale_item_id_fkey"
            columns: ["sale_item_id"]
            isOneToOne: false
            referencedRelation: "sale_items"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_items: {
        Row: {
          condition: string | null
          created_at: string
          id: string
          product_id: string
          quantity: number
          sale_id: string
          total_price: number
          unit_price: number
        }
        Insert: {
          condition?: string | null
          created_at?: string
          id?: string
          product_id: string
          quantity: number
          sale_id: string
          total_price: number
          unit_price: number
        }
        Update: {
          condition?: string | null
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
          sale_id?: string
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          created_at: string
          customer_id: string | null
          customer_photo_url: string | null
          due_amount: number
          id: string
          instant_customer_name: string | null
          instant_customer_phone: string | null
          notes: string | null
          paid_amount: number
          payment_method: string | null
          status: string | null
          total_amount: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          customer_photo_url?: string | null
          due_amount?: number
          id?: string
          instant_customer_name?: string | null
          instant_customer_phone?: string | null
          notes?: string | null
          paid_amount?: number
          payment_method?: string | null
          status?: string | null
          total_amount?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          customer_photo_url?: string | null
          due_amount?: number
          id?: string
          instant_customer_name?: string | null
          instant_customer_phone?: string | null
          notes?: string | null
          paid_amount?: number
          payment_method?: string | null
          status?: string | null
          total_amount?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_settings: {
        Row: {
          barcode_format: string
          cloudinary_cloud_name: string
          cloudinary_upload_preset: string
          created_at: string
          default_paper_size: string
          favicon_url: string | null
          id: string
          logo_url: string | null
          print_item_barcodes: boolean
          pwa_background_color: string
          pwa_short_name: string
          pwa_theme_color: string
          shop_address: string | null
          shop_name: string
          shop_phone: string | null
          shop_subtitle: string | null
          updated_at: string
        }
        Insert: {
          barcode_format?: string
          cloudinary_cloud_name?: string
          cloudinary_upload_preset?: string
          created_at?: string
          default_paper_size?: string
          favicon_url?: string | null
          id?: string
          logo_url?: string | null
          print_item_barcodes?: boolean
          pwa_background_color?: string
          pwa_short_name?: string
          pwa_theme_color?: string
          shop_address?: string | null
          shop_name?: string
          shop_phone?: string | null
          shop_subtitle?: string | null
          updated_at?: string
        }
        Update: {
          barcode_format?: string
          cloudinary_cloud_name?: string
          cloudinary_upload_preset?: string
          created_at?: string
          default_paper_size?: string
          favicon_url?: string | null
          id?: string
          logo_url?: string | null
          print_item_barcodes?: boolean
          pwa_background_color?: string
          pwa_short_name?: string
          pwa_theme_color?: string
          shop_address?: string | null
          shop_name?: string
          shop_phone?: string | null
          shop_subtitle?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      supplier_returns: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          product_id: string
          quantity: number
          reason: string
          return_amount: number
          status: string
          supplier_id: string | null
          supplier_name: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          product_id: string
          quantity?: number
          reason?: string
          return_amount?: number
          status?: string
          supplier_id?: string | null
          supplier_name?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          product_id?: string
          quantity?: number
          reason?: string
          return_amount?: number
          status?: string
          supplier_id?: string | null
          supplier_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          photo_url: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          photo_url?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          photo_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "manager" | "staff"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "manager", "staff"],
    },
  },
} as const
