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
      blog_posts: {
        Row: {
          author_id: string | null
          body: string
          cover_url: string | null
          created_at: string
          excerpt: string
          id: string
          published: boolean
          published_at: string | null
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body?: string
          cover_url?: string | null
          created_at?: string
          excerpt?: string
          id?: string
          published?: boolean
          published_at?: string | null
          slug: string
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          cover_url?: string | null
          created_at?: string
          excerpt?: string
          id?: string
          published?: boolean
          published_at?: string | null
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      booking_passengers: {
        Row: {
          created_at: string
          date_of_birth: string | null
          first_name: string
          flight_booking_id: string
          id: string
          last_name: string
          nationality: string | null
          passenger_type: string
          passport_expiry: string | null
          passport_number: string | null
          ticket_number: string | null
          title: string | null
        }
        Insert: {
          created_at?: string
          date_of_birth?: string | null
          first_name: string
          flight_booking_id: string
          id?: string
          last_name: string
          nationality?: string | null
          passenger_type?: string
          passport_expiry?: string | null
          passport_number?: string | null
          ticket_number?: string | null
          title?: string | null
        }
        Update: {
          created_at?: string
          date_of_birth?: string | null
          first_name?: string
          flight_booking_id?: string
          id?: string
          last_name?: string
          nationality?: string | null
          passenger_type?: string
          passport_expiry?: string | null
          passport_number?: string | null
          ticket_number?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_passengers_flight_booking_id_fkey"
            columns: ["flight_booking_id"]
            isOneToOne: false
            referencedRelation: "flight_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_payments: {
        Row: {
          amount: number
          booking_id: string | null
          created_at: string
          currency: string
          failure_reason: string | null
          flight_booking_id: string | null
          id: string
          method: string | null
          provider: string
          raw: Json | null
          status: string
          transaction_reference: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          booking_id?: string | null
          created_at?: string
          currency?: string
          failure_reason?: string | null
          flight_booking_id?: string | null
          id?: string
          method?: string | null
          provider?: string
          raw?: Json | null
          status?: string
          transaction_reference?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          booking_id?: string | null
          created_at?: string
          currency?: string
          failure_reason?: string | null
          flight_booking_id?: string | null
          id?: string
          method?: string | null
          provider?: string
          raw?: Json | null
          status?: string
          transaction_reference?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_payments_flight_booking_id_fkey"
            columns: ["flight_booking_id"]
            isOneToOne: false
            referencedRelation: "flight_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_pricing: {
        Row: {
          booking_id: string | null
          created_at: string
          currency: string
          customer_price: number
          duffel_booking_reference: string | null
          duffel_offer_id: string | null
          duffel_order_id: string | null
          id: string
          markup_amount: number
          pricing_rule_id: string | null
          pricing_rule_name: string | null
          supplier_price: number
          updated_at: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          currency?: string
          customer_price: number
          duffel_booking_reference?: string | null
          duffel_offer_id?: string | null
          duffel_order_id?: string | null
          id?: string
          markup_amount?: number
          pricing_rule_id?: string | null
          pricing_rule_name?: string | null
          supplier_price: number
          updated_at?: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          currency?: string
          customer_price?: number
          duffel_booking_reference?: string | null
          duffel_offer_id?: string | null
          duffel_order_id?: string | null
          id?: string
          markup_amount?: number
          pricing_rule_id?: string | null
          pricing_rule_name?: string | null
          supplier_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_pricing_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_pricing_pricing_rule_id_fkey"
            columns: ["pricing_rule_id"]
            isOneToOne: false
            referencedRelation: "pricing_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_segments: {
        Row: {
          aircraft: string | null
          airline: string | null
          airline_code: string | null
          arrival_datetime: string | null
          cabin_class: string | null
          created_at: string
          departure_datetime: string | null
          destination_code: string | null
          direction: string
          duration_minutes: number | null
          flight_booking_id: string
          flight_number: string | null
          id: string
          origin_code: string | null
          provider: string | null
          provider_reference: string | null
          segment_index: number
          status: string | null
        }
        Insert: {
          aircraft?: string | null
          airline?: string | null
          airline_code?: string | null
          arrival_datetime?: string | null
          cabin_class?: string | null
          created_at?: string
          departure_datetime?: string | null
          destination_code?: string | null
          direction?: string
          duration_minutes?: number | null
          flight_booking_id: string
          flight_number?: string | null
          id?: string
          origin_code?: string | null
          provider?: string | null
          provider_reference?: string | null
          segment_index?: number
          status?: string | null
        }
        Update: {
          aircraft?: string | null
          airline?: string | null
          airline_code?: string | null
          arrival_datetime?: string | null
          cabin_class?: string | null
          created_at?: string
          departure_datetime?: string | null
          destination_code?: string | null
          direction?: string
          duration_minutes?: number | null
          flight_booking_id?: string
          flight_number?: string | null
          id?: string
          origin_code?: string | null
          provider?: string | null
          provider_reference?: string | null
          segment_index?: number
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_segments_flight_booking_id_fkey"
            columns: ["flight_booking_id"]
            isOneToOne: false
            referencedRelation: "flight_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          created_at: string
          currency: string
          details: Json
          duffel_booking_reference: string | null
          duffel_order_id: string | null
          id: string
          payment_status: string
          reference: string
          status: string
          total_amount: number
          travel_date: string | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          details?: Json
          duffel_booking_reference?: string | null
          duffel_order_id?: string | null
          id?: string
          payment_status?: string
          reference: string
          status?: string
          total_amount?: number
          travel_date?: string | null
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          details?: Json
          duffel_booking_reference?: string | null
          duffel_order_id?: string | null
          id?: string
          payment_status?: string
          reference?: string
          status?: string
          total_amount?: number
          travel_date?: string | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      flight_bookings: {
        Row: {
          booking_id: string
          booking_status: string
          cabin_class: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          currency: string
          customer_total: number | null
          departure_date: string | null
          destination_code: string | null
          id: string
          markup_total: number | null
          origin_code: string | null
          payment_status: string
          pnr: string | null
          pricing_rule_id: string | null
          pricing_rule_name: string | null
          provider: string
          provider_booking_reference: string | null
          provider_offer_id: string | null
          return_date: string | null
          supplier_total: number | null
          ticket_status: string
          trip_type: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          booking_id: string
          booking_status?: string
          cabin_class?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          currency?: string
          customer_total?: number | null
          departure_date?: string | null
          destination_code?: string | null
          id?: string
          markup_total?: number | null
          origin_code?: string | null
          payment_status?: string
          pnr?: string | null
          pricing_rule_id?: string | null
          pricing_rule_name?: string | null
          provider?: string
          provider_booking_reference?: string | null
          provider_offer_id?: string | null
          return_date?: string | null
          supplier_total?: number | null
          ticket_status?: string
          trip_type?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          booking_id?: string
          booking_status?: string
          cabin_class?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          currency?: string
          customer_total?: number | null
          departure_date?: string | null
          destination_code?: string | null
          id?: string
          markup_total?: number | null
          origin_code?: string | null
          payment_status?: string
          pnr?: string | null
          pricing_rule_id?: string | null
          pricing_rule_name?: string | null
          provider?: string
          provider_booking_reference?: string | null
          provider_offer_id?: string | null
          return_date?: string | null
          supplier_total?: number | null
          ticket_status?: string
          trip_type?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flight_bookings_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flight_bookings_pricing_rule_id_fkey"
            columns: ["pricing_rule_id"]
            isOneToOne: false
            referencedRelation: "pricing_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      flight_provider_logs: {
        Row: {
          action: string
          created_at: string
          duration_ms: number | null
          endpoint: string | null
          error_code: string | null
          error_message: string | null
          http_status: number | null
          id: string
          meta: Json | null
          provider: string
          provider_reference: string | null
          request_at: string
          response_at: string | null
          success: boolean
        }
        Insert: {
          action: string
          created_at?: string
          duration_ms?: number | null
          endpoint?: string | null
          error_code?: string | null
          error_message?: string | null
          http_status?: number | null
          id?: string
          meta?: Json | null
          provider: string
          provider_reference?: string | null
          request_at?: string
          response_at?: string | null
          success?: boolean
        }
        Update: {
          action?: string
          created_at?: string
          duration_ms?: number | null
          endpoint?: string | null
          error_code?: string | null
          error_message?: string | null
          http_status?: number | null
          id?: string
          meta?: Json | null
          provider?: string
          provider_reference?: string | null
          request_at?: string
          response_at?: string | null
          success?: boolean
        }
        Relationships: []
      }
      flight_results: {
        Row: {
          aircraft: string | null
          airline: string | null
          airline_code: string | null
          arrival_datetime: string | null
          bookable: boolean
          cabin_class: string | null
          created_at: string
          currency: string | null
          customer_price: number | null
          departure_datetime: string | null
          destination: string | null
          destination_code: string | null
          duration_minutes: number | null
          flight_number: string | null
          id: string
          markup_amount: number | null
          origin: string | null
          origin_code: string | null
          pricing_rule_id: string | null
          provider: string
          provider_reference: string | null
          raw: Json | null
          search_id: string
          status: string | null
          stops: number
          supplier_price: number | null
        }
        Insert: {
          aircraft?: string | null
          airline?: string | null
          airline_code?: string | null
          arrival_datetime?: string | null
          bookable?: boolean
          cabin_class?: string | null
          created_at?: string
          currency?: string | null
          customer_price?: number | null
          departure_datetime?: string | null
          destination?: string | null
          destination_code?: string | null
          duration_minutes?: number | null
          flight_number?: string | null
          id?: string
          markup_amount?: number | null
          origin?: string | null
          origin_code?: string | null
          pricing_rule_id?: string | null
          provider: string
          provider_reference?: string | null
          raw?: Json | null
          search_id: string
          status?: string | null
          stops?: number
          supplier_price?: number | null
        }
        Update: {
          aircraft?: string | null
          airline?: string | null
          airline_code?: string | null
          arrival_datetime?: string | null
          bookable?: boolean
          cabin_class?: string | null
          created_at?: string
          currency?: string | null
          customer_price?: number | null
          departure_datetime?: string | null
          destination?: string | null
          destination_code?: string | null
          duration_minutes?: number | null
          flight_number?: string | null
          id?: string
          markup_amount?: number | null
          origin?: string | null
          origin_code?: string | null
          pricing_rule_id?: string | null
          provider?: string
          provider_reference?: string | null
          raw?: Json | null
          search_id?: string
          status?: string | null
          stops?: number
          supplier_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "flight_results_pricing_rule_id_fkey"
            columns: ["pricing_rule_id"]
            isOneToOne: false
            referencedRelation: "pricing_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flight_results_search_id_fkey"
            columns: ["search_id"]
            isOneToOne: false
            referencedRelation: "flight_searches"
            referencedColumns: ["id"]
          },
        ]
      }
      flight_searches: {
        Row: {
          adults: number
          cabin_class: string
          cache_key: string | null
          children: number
          created_at: string
          departure_date: string
          destination_code: string
          error_message: string | null
          expires_at: string
          id: string
          infants: number
          origin_code: string
          provider: string
          result_count: number
          return_date: string | null
          status: string
          trip_type: string
          user_id: string | null
        }
        Insert: {
          adults?: number
          cabin_class?: string
          cache_key?: string | null
          children?: number
          created_at?: string
          departure_date: string
          destination_code: string
          error_message?: string | null
          expires_at?: string
          id?: string
          infants?: number
          origin_code: string
          provider: string
          result_count?: number
          return_date?: string | null
          status?: string
          trip_type?: string
          user_id?: string | null
        }
        Update: {
          adults?: number
          cabin_class?: string
          cache_key?: string | null
          children?: number
          created_at?: string
          departure_date?: string
          destination_code?: string
          error_message?: string | null
          expires_at?: string
          id?: string
          infants?: number
          origin_code?: string
          provider?: string
          result_count?: number
          return_date?: string | null
          status?: string
          trip_type?: string
          user_id?: string | null
        }
        Relationships: []
      }
      newsletter_subscribers: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          name?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string | null
        }
        Relationships: []
      }
      pricing_audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          created_at: string
          id: string
          new_value: Json | null
          old_value: Json | null
          pricing_rule_id: string | null
          pricing_rule_name: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          pricing_rule_id?: string | null
          pricing_rule_name?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          pricing_rule_id?: string | null
          pricing_rule_name?: string | null
        }
        Relationships: []
      }
      pricing_rules: {
        Row: {
          airline_code: string | null
          cabin_class: string | null
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          destination_airport: string | null
          id: string
          is_active: boolean
          is_domestic: boolean | null
          markup_amount: number
          markup_type: string
          max_ticket_price: number | null
          min_ticket_price: number | null
          name: string
          origin_airport: string | null
          priority: number
          rule_type: string
          updated_at: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          airline_code?: string | null
          cabin_class?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          destination_airport?: string | null
          id?: string
          is_active?: boolean
          is_domestic?: boolean | null
          markup_amount?: number
          markup_type?: string
          max_ticket_price?: number | null
          min_ticket_price?: number | null
          name: string
          origin_airport?: string | null
          priority?: number
          rule_type?: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          airline_code?: string | null
          cabin_class?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          destination_airport?: string | null
          id?: string
          is_active?: boolean
          is_domestic?: boolean | null
          markup_amount?: number
          markup_type?: string
          max_ticket_price?: number | null
          min_ticket_price?: number | null
          name?: string
          origin_airport?: string | null
          priority?: number
          rule_type?: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      quotes: {
        Row: {
          created_at: string
          currency: string
          details: Json
          id: string
          status: string
          total_amount: number
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          details?: Json
          id?: string
          status?: string
          total_amount?: number
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          details?: Json
          id?: string
          status?: string
          total_amount?: number
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      flight_quote_requests: {
        Row: {
          adults: number
          cabin_class: string
          children: number
          created_at: string
          customer_email: string
          customer_name: string
          customer_phone: string
          departure_date: string
          destination: string
          dedupe_key: string
          id: string
          idempotency_key: string
          infants: number
          internal_notes: string
          origin: string
          reference: string
          request_hash: string
          return_date: string | null
          special_requests: string
          status: string
          trip_type: string
          updated_at: string
        }
        Insert: {
          adults: number
          cabin_class: string
          children: number
          created_at?: string
          customer_email: string
          customer_name: string
          customer_phone: string
          departure_date: string
          destination: string
          dedupe_key: string
          id?: string
          idempotency_key: string
          infants: number
          internal_notes?: string
          origin: string
          reference: string
          request_hash: string
          return_date?: string | null
          special_requests?: string
          status?: string
          trip_type: string
          updated_at?: string
        }
        Update: {
          internal_notes?: string
          status?: string
        }
        Relationships: []
      }
      site_content: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      request_booking_cancellation: {
        Args: { p_booking_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "agent" | "user"
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
      app_role: ["admin", "agent", "user"],
    },
  },
} as const
