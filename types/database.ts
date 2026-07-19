/**
 * Database types for FleetInvoice.
 * Mirrors supabase/migrations/00001_initial_schema.sql
 * Shaped for @supabase/supabase-js typed clients.
 */

export type UserRole = "admin" | "driver";

export type TripStatus = "pending" | "approved" | "rejected" | "invoiced";

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
  created_at: string;
  updated_at: string;
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
  created_at: string;
  updated_at: string;
}

/** Trip row with joined display labels for driver UI. */
export interface TripWithDetails extends Trip {
  company_name: string;
  vehicle_label: string;
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
          rule_name: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          rule_name?: string;
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
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          action?: string;
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
    };
    Enums: {
      user_role: UserRole;
      trip_status: TripStatus;
      invoice_status: InvoiceStatus;
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
