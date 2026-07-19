/**
 * Database types for FleetInvoice.
 * Mirrors supabase/migrations/00001_initial_schema.sql
 * Shaped for @supabase/supabase-js typed clients.
 */

export type UserRole = "admin" | "driver";

export type TripStatus = "pending" | "approved" | "rejected" | "invoiced";

export type PricingStatus = "calculated" | "needs_pricing" | "manual_override";

export type InvoiceStatus = "draft" | "issued" | "paid" | "void";

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  created_at: string;
}

export interface Driver {
  id: string;
  profile_id: string;
  employee_number: string;
  phone: string | null;
  license_number: string | null;
  vehicle_id: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Company {
  id: string;
  company_name: string;
  billing_address: string | null;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Vehicle {
  id: string;
  registration: string;
  make: string;
  model: string;
  capacity: number | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Area {
  id: string;
  name: string;
  zone: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PricingRule {
  id: string;
  company_id: string;
  rule_name: string;
  pickup_area_id: string;
  destination_area_id: string;
  areas_visited: string[];
  minimum_passengers: number;
  maximum_passengers: number;
  vehicle_id: string | null;
  price: number;
  priority: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PricingRuleWithDetails extends PricingRule {
  company_name: string;
  pickup_area_name: string;
  destination_area_name: string;
  areas_visited_names: string[];
  vehicle_label: string;
}

export interface PricingHistory {
  id: string;
  trip_id: string;
  old_price: number | null;
  new_price: number;
  changed_by: string | null;
  changed_at: string;
  reason: string;
}

export interface Trip {
  id: string;
  driver_id: string;
  company_id: string;
  vehicle_id: string;
  trip_date: string;
  trip_time: string;
  pickup_area: string;
  destination_area: string;
  areas_visited: string[];
  passengers: number;
  notes: string | null;
  status: TripStatus;
  calculated_price: number | null;
  pricing_rule_id: string | null;
  price_locked: boolean;
  price_calculated_at: string | null;
  pricing_status: PricingStatus;
  created_at: string;
  updated_at: string;
}

/** Trip row with joined display labels for driver UI (no pricing fields exposed in RPCs). */
export interface TripWithDetails {
  id: string;
  driver_id: string;
  company_id: string;
  vehicle_id: string;
  trip_date: string;
  trip_time: string;
  pickup_area: string;
  destination_area: string;
  areas_visited: string[];
  passengers: number;
  notes: string | null;
  status: TripStatus;
  created_at: string;
  updated_at: string;
  company_name: string;
  vehicle_label: string;
}

/** Admin trip view includes hidden calculated price and pricing metadata. */
export interface AdminTripWithDetails extends Trip {
  company_name: string;
  vehicle_label: string;
  driver_name: string;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  week_start: string;
  week_end: string;
  status: InvoiceStatus;
  created_at: string;
  updated_at: string;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  trip_id: string;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: {
          id: string;
          email: string;
          full_name?: string;
          role?: UserRole;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string;
          role?: UserRole;
          created_at?: string;
        };
        Relationships: [];
      };
      drivers: {
        Row: Driver;
        Insert: {
          id?: string;
          profile_id: string;
          employee_number: string;
          phone?: string | null;
          license_number?: string | null;
          vehicle_id?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          employee_number?: string;
          phone?: string | null;
          license_number?: string | null;
          vehicle_id?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "drivers_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "drivers_vehicle_id_fkey";
            columns: ["vehicle_id"];
            isOneToOne: false;
            referencedRelation: "vehicles";
            referencedColumns: ["id"];
          },
        ];
      };
      companies: {
        Row: Company;
        Insert: {
          id?: string;
          company_name: string;
          billing_address?: string | null;
          contact_person?: string | null;
          phone?: string | null;
          email?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          company_name?: string;
          billing_address?: string | null;
          contact_person?: string | null;
          phone?: string | null;
          email?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      vehicles: {
        Row: Vehicle;
        Insert: {
          id?: string;
          registration: string;
          make: string;
          model: string;
          capacity?: number | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          registration?: string;
          make?: string;
          model?: string;
          capacity?: number | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      areas: {
        Row: Area;
        Insert: {
          id?: string;
          name: string;
          zone?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          zone?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      pricing_rules: {
        Row: PricingRule;
        Insert: {
          id?: string;
          company_id: string;
          rule_name?: string;
          pickup_area_id: string;
          destination_area_id: string;
          areas_visited?: string[];
          minimum_passengers: number;
          maximum_passengers: number;
          vehicle_id?: string | null;
          price: number;
          priority?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          rule_name?: string;
          pickup_area_id?: string;
          destination_area_id?: string;
          areas_visited?: string[];
          minimum_passengers?: number;
          maximum_passengers?: number;
          vehicle_id?: string | null;
          price?: number;
          priority?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pricing_rules_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pricing_rules_pickup_area_id_fkey";
            columns: ["pickup_area_id"];
            isOneToOne: false;
            referencedRelation: "areas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pricing_rules_destination_area_id_fkey";
            columns: ["destination_area_id"];
            isOneToOne: false;
            referencedRelation: "areas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pricing_rules_vehicle_id_fkey";
            columns: ["vehicle_id"];
            isOneToOne: false;
            referencedRelation: "vehicles";
            referencedColumns: ["id"];
          },
        ];
      };
      trips: {
        Row: Trip;
        Insert: {
          id?: string;
          driver_id: string;
          company_id: string;
          vehicle_id: string;
          trip_date: string;
          trip_time: string;
          pickup_area: string;
          destination_area: string;
          areas_visited?: string[];
          passengers: number;
          notes?: string | null;
          status?: TripStatus;
          calculated_price?: number | null;
          pricing_rule_id?: string | null;
          price_locked?: boolean;
          price_calculated_at?: string | null;
          pricing_status?: PricingStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          driver_id?: string;
          company_id?: string;
          vehicle_id?: string;
          trip_date?: string;
          trip_time?: string;
          pickup_area?: string;
          destination_area?: string;
          areas_visited?: string[];
          passengers?: number;
          notes?: string | null;
          status?: TripStatus;
          calculated_price?: number | null;
          pricing_rule_id?: string | null;
          price_locked?: boolean;
          price_calculated_at?: string | null;
          pricing_status?: PricingStatus;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trips_driver_id_fkey";
            columns: ["driver_id"];
            isOneToOne: false;
            referencedRelation: "drivers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trips_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trips_vehicle_id_fkey";
            columns: ["vehicle_id"];
            isOneToOne: false;
            referencedRelation: "vehicles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trips_pricing_rule_id_fkey";
            columns: ["pricing_rule_id"];
            isOneToOne: false;
            referencedRelation: "pricing_rules";
            referencedColumns: ["id"];
          },
        ];
      };
      pricing_history: {
        Row: PricingHistory;
        Insert: {
          id?: string;
          trip_id: string;
          old_price?: number | null;
          new_price: number;
          changed_by?: string | null;
          changed_at?: string;
          reason: string;
        };
        Update: {
          id?: string;
          trip_id?: string;
          old_price?: number | null;
          new_price?: number;
          changed_by?: string | null;
          changed_at?: string;
          reason?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pricing_history_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pricing_history_changed_by_fkey";
            columns: ["changed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      invoices: {
        Row: Invoice;
        Insert: {
          id?: string;
          invoice_number: string;
          week_start: string;
          week_end: string;
          status?: InvoiceStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          invoice_number?: string;
          week_start?: string;
          week_end?: string;
          status?: InvoiceStatus;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      invoice_items: {
        Row: InvoiceItem;
        Insert: {
          id?: string;
          invoice_id: string;
          trip_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          invoice_id?: string;
          trip_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey";
            columns: ["invoice_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invoice_items_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_logs: {
        Row: AuditLog;
        Insert: {
          id?: string;
          user_id?: string | null;
          action: string;
          entity_type?: string | null;
          entity_id?: string | null;
          metadata?: Record<string, unknown>;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          action?: string;
          entity_type?: string | null;
          entity_id?: string | null;
          metadata?: Record<string, unknown>;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "audit_logs_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      get_user_role: {
        Args: Record<PropertyKey, never>;
        Returns: UserRole;
      };
      is_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      current_driver_id: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      list_active_companies: {
        Args: Record<PropertyKey, never>;
        Returns: { id: string; company_name: string }[];
      };
      list_my_trips: {
        Args: Record<PropertyKey, never>;
        Returns: TripWithDetails[];
      };
      get_my_trip: {
        Args: { p_trip_id: string };
        Returns: TripWithDetails[];
      };
      list_admin_trips: {
        Args: Record<PropertyKey, never>;
        Returns: AdminTripWithDetails[];
      };
      get_admin_trip: {
        Args: { p_trip_id: string };
        Returns: AdminTripWithDetails[];
      };
      preview_trip_price: {
        Args: {
          p_company_id: string;
          p_pickup_area_name: string;
          p_destination_area_name: string;
          p_areas_visited: string[];
          p_passengers: number;
          p_vehicle_id: string;
        };
        Returns: {
          matched_rule_id: string | null;
          calculated_price: number | null;
          reason: string;
          pricing_status: PricingStatus;
        }[];
      };
      override_trip_price: {
        Args: {
          p_trip_id: string;
          p_new_price: number;
          p_reason: string;
        };
        Returns: Trip;
      };
      match_pricing_rule: {
        Args: {
          p_company_id: string;
          p_pickup_area_id: string;
          p_destination_area_id: string;
          p_areas_visited: string[];
          p_passengers: number;
          p_vehicle_id: string;
        };
        Returns: (PricingRule & { reason: string })[];
      };
    };
    Enums: {
      user_role: UserRole;
      trip_status: TripStatus;
      invoice_status: InvoiceStatus;
      pricing_status: PricingStatus;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];

/** Placeholder to keep Json available for future JSON columns. */
export type { Json };
