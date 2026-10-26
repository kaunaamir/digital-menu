import type { OrderStatus, WorkflowEnd } from './status';
export interface RestaurantSettings {
  tax_percent: number; service_charge_percent: number; min_order_amount: number;
  payments: { counter: boolean; table: boolean; online: boolean };
  workflow_end: WorkflowEnd; prep_time_minutes: number; require_name: boolean; require_phone: boolean; closed_message: string;
}
export interface Restaurant {
  id: string; name: string; slug: string; logo_url: string | null; cover_image_url: string | null; description: string | null;
  address: string | null; phone: string | null; currency: string; timezone: string; opening_hours: { text?: string };
  is_accepting_orders: boolean; settings: RestaurantSettings;
}
export interface AddOnOption { id: string; name: string; price: number; is_available: boolean; display_order: number }
export interface AddOnGroup { id: string; name: string; minimum_selections: number; maximum_selections: number; is_required: boolean; display_order: number; add_on_options: AddOnOption[] }
export interface Variant { id: string; name: string; price_adjustment: number; is_active: boolean; display_order: number }
export interface MenuItem {
  id: string; category_id: string; name: string; description: string | null; image_url: string | null; price: number;
  original_price: number | null; dietary_type: 'veg' | 'non_veg' | 'vegan' | 'egg'; is_spicy: boolean; allergens: string[];
  preparation_time: number | null; is_available: boolean; display_order: number;
  menu_item_variants: Variant[]; add_on_groups: AddOnGroup[];
}
export interface Category { id: string; name: string; description: string | null; display_order: number; is_active: boolean; menu_items: MenuItem[] }
export interface OrderItemRow {
  id: string; item_name_snapshot: string; quantity: number; unit_price_snapshot: number; line_total: number;
  selected_variant_snapshot: { name: string } | null; selected_add_ons_snapshot: { name: string }[]; special_instructions: string | null;
}
export interface OrderRow {
  id: string; order_number: number; status: OrderStatus; payment_method: 'counter' | 'table' | 'online'; payment_status: 'pending' | 'paid' | 'failed';
  subtotal: number; tax_amount: number; service_charge: number; discount_amount: number; total_amount: number; promo_code: string | null;
  customer_name: string | null; customer_phone: string | null; order_notes: string | null; status_reason: string | null;
  created_at: string; table_id: string; tables: { display_name: string } | null; order_items: OrderItemRow[];
}
