/**
 * Generated database types placeholder.
 * Run `npm run db:types` after applying migrations against a local Supabase instance.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: {
      generate_trips: {
        Args: {
          p_organisation_id: string;
          p_from: string;
          p_to: string;
          p_schedule_id?: string | null;
        };
        Returns: number;
      };
      assign_trip: {
        Args: {
          p_trip_id: string;
          p_driver_id: string;
          p_vehicle_id?: string | null;
        };
        Returns: string;
      };
      transition_trip: {
        Args: {
          p_trip_id: string;
          p_event:
            | "assigned"
            | "started"
            | "arrived_stop"
            | "completed"
            | "cancelled";
          p_notes?: string | null;
          p_metadata?: Json;
        };
        Returns: Record<string, unknown>;
      };
      current_driver_id: {
        Args: { org_id: string };
        Returns: string | null;
      };
      log_fuel_fillup: {
        Args: {
          p_organisation_id: string;
          p_vehicle_id: string;
          p_odometer_km: number;
          p_litres: number;
          p_company_id?: string | null;
          p_driver_id?: string | null;
          p_filled_at?: string | null;
          p_unit_price?: number | null;
          p_station_name?: string | null;
          p_notes?: string | null;
        };
        Returns: Record<string, unknown>;
      };
      generate_weekly_fuel_invoice: {
        Args: {
          p_organisation_id: string;
          p_company_id: string;
          p_week_start: string;
        };
        Returns: Record<string, unknown>;
      };
    };
    Enums: {
      app_role:
        | "platform_owner"
        | "organisation_admin"
        | "manager"
        | "dispatcher"
        | "supervisor"
        | "company_manager"
        | "driver"
        | "employee";
      entity_status: "active" | "inactive" | "suspended";
      membership_status: "active" | "invited" | "suspended";
      invitation_status: "pending" | "accepted" | "revoked" | "expired";
      vehicle_type:
        | "sedan"
        | "suv"
        | "van"
        | "minibus"
        | "bus"
        | "truck"
        | "other";
      vehicle_doc_type: "license_disk" | "insurance" | "roadworthy" | "other";
      notification_channel: "email" | "sms" | "push";
      notification_status:
        | "pending"
        | "processing"
        | "sent"
        | "failed"
        | "skipped";
      trip_status:
        | "planned"
        | "assigned"
        | "in_progress"
        | "completed"
        | "cancelled";
      trip_event_type:
        | "assigned"
        | "started"
        | "arrived_stop"
        | "completed"
        | "cancelled";
      invoice_status: "draft" | "issued" | "void";
      invoice_line_type: "fuel";
    };
  };
};
