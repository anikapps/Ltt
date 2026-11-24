export type AdminRole = 'super_admin' | 'trip_organizer' | 'tour_manager' | 'responder' | 'main_admin' | 'tour_leader' | 'assistant_leader';
export type SharingStatus = 'sharing' | 'disabled' | 'offline' | 'unavailable';
export type TripStatus = 'upcoming' | 'active' | 'completed' | 'cancelled' | 'archived';

export type AssistanceCategory =
  | 'Lost / separated from group'
  | 'Medical assistance'
  | 'Accident / injury'
  | 'Transport assistance'
  | 'Safety / security concern'
  | 'Cannot find meeting point'
  | 'Other';

export type AssistancePriority = 'Normal' | 'High' | 'Critical';
export type AlertStatus =
  | 'New'
  | 'Acknowledged'
  | 'Assigned'
  | 'Responding'
  | 'Resolved'
  | 'Closed'
  | 'Cancelled'
  | 'active'
  | 'responding'
  | 'resolved';

export interface ItineraryItem {
  id: string;
  day_label: string;
  time_label: string;
  title: string;
  location_name: string;
  /** Tourist-facing instructions (canonical field written by the itinerary builder). */
  instructions: string;
  /** Legacy alias kept so older local stores and Supabase rows still render. */
  notes?: string;
}

export interface FlightInfo {
  id: string;
  airline: string;
  flight_number: string;
  route: string;
  departure_time: string;
  arrival_time: string;
  terminal: string;
  baggage_allowance: string;
}

export interface ChecklistItem {
  id: string;
  label: string;
  category: 'Documents' | 'Health' | 'Packing' | 'Connectivity';
  required: boolean;
}

export interface TripEssentialHub {
  hotel_name: string;
  hotel_address: string;
  hotel_phone: string;
  hotel_lat?: number | null;
  hotel_lng?: number | null;
  airport_name: string;
  airport_terminal: string;
  airport_lat?: number | null;
  airport_lng?: number | null;
  organizer_hotline: string;
  local_emergency_police: string;
  local_emergency_medical: string;
  embassy_name: string;
  embassy_phone: string;
  destination_tips?: string;
  flights?: FlightInfo[];
  checklist?: ChecklistItem[];
  itinerary?: ItineraryItem[];
}

export interface Trip {
  id: string;
  name: string;
  destination: string;
  start_date: string;
  end_date: string;
  max_tourists: number;
  status: TripStatus;
  organizer_contact: string;
  stale_threshold_seconds: number;
  update_interval_seconds: number;
  retention_days: number;
  separation_threshold_meters?: number;
  require_passport?: boolean;
  verification_mode?: string;
  essentials?: TripEssentialHub;
  /** Top-level daily schedule (local store & seed data; Supabase keeps it inside essentials). */
  itinerary?: ItineraryItem[];
  created_at: string;
  ended_at?: string | null;
  archived_at?: string | null;
}

export interface TripAdmin {
  id: string;
  trip_id: string;
  admin_email: string;
  admin_name: string;
  role: AdminRole;
  added_at: string;
}

export interface PassengerRosterRecord {
  id: string;
  trip_id: string;
  serial_no: number;
  full_name_display: string;
  normalized_name: string;
  passport_hash: string;
  passport_masked: string;
  contact_hash: string;
  contact_number_admin: string;
  subgroup_name: string;
  is_claimed: boolean;
  claimed_member_id: string | null;
  claimed_at: string | null;
  created_at: string;
}

export interface TripInvite {
  id: string;
  trip_id: string;
  token: string;
  invitation_code: string;
  is_revoked: boolean;
  expires_at: string;
  created_at: string;
}

export interface TripMember {
  id: string;
  trip_id: string;
  roster_id: string | null;
  tourist_code: string;
  display_name: string;
  subgroup_name: string;
  contact_info?: string | null;
  passport_masked?: string | null;
  emergency_contact?: string | null;
  sharing_enabled: boolean;
  consent_granted?: boolean;
  consent_updated_at?: string | null;
  session_token_hash?: string | null;
  session_revoked?: boolean;
  joined_at: string;
  last_seen_at: string | null;
}

export interface TouristLocation {
  member_id: string;
  trip_id: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  sharing_status: SharingStatus;
  location_source?: 'gps' | 'network' | 'manual';
  permission_status?: string;
  captured_at: string;
  updated_at: string;
}

export interface LocationHistoryRecord {
  id: string;
  trip_id: string;
  member_id: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  captured_at: string;
  received_at: string;
}

export interface MeetingPoint {
  id: string;
  trip_id: string;
  title: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
  is_active: boolean;
  created_at: string;
  /** Supabase column name. */
  notes?: string | null;
  /** Hydrated alias used by client components. */
  description?: string | null;
  /** Supabase column name. */
  scheduled_at?: string | null;
  /** Hydrated alias used by client components. */
  scheduled_time?: string | null;
  subgroup_name?: string | null;
  created_by?: string;
}

export interface HeadcountResponseItem {
  member_id: string;
  tourist_code: string;
  display_name: string;
  subgroup_name: string;
  status: 'present' | 'needs_help';
  latitude: number | null;
  longitude: number | null;
  responded_at: string;
}

export interface HeadcountSession {
  id: string;
  trip_id: string;
  title: string;
  subgroup_name: string | null;
  status: 'open' | 'closed';
  created_by: string;
  created_at: string;
  closed_at: string | null;
  responses: HeadcountResponseItem[];
}

export interface AnnouncementItem {
  id: string;
  trip_id: string | null;
  title: string;
  body: string;
  priority: 'normal' | 'important' | 'urgent';
  subgroup_name: string | null;
  target_member_id?: string | null;
  destinations?: Array<'essentials' | 'notifications' | 'push' | 'chat'>;
  is_archived?: boolean;
  expires_at?: string | null;
  created_by: string;
  created_at: string;
  updated_at?: string | null;
  read_by_member_ids: string[];
}

export interface ChatReaction {
  emoji: string;
  member_ids: string[];
}

export interface GroupChatMessage {
  id: string;
  trip_id: string;
  sender_id: string;
  sender_name: string;
  sender_code: string;
  sender_role: 'tourist' | 'admin' | 'system';
  message: string;
  message_type?: 'chat' | 'announcement';
  reply_to_id?: string | null;
  reply_to_preview?: string | null;
  is_pinned?: boolean;
  reactions?: ChatReaction[];
  attachment_name?: string | null;
  attachment_url?: string | null;
  edited_at?: string | null;
  deleted_at?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  created_at: string;
}

export interface NotificationItem {
  id: string;
  trip_id: string;
  member_id?: string | null;
  title: string;
  body: string;
  priority: 'normal' | 'important' | 'urgent';
  is_read: boolean;
  created_at: string;
}

export interface AssistanceMessage {
  id: string;
  sender_role: 'tourist' | 'admin' | 'organizer' | 'responder';
  sender_name: string;
  message: string;
  created_at: string;
}

export interface EmergencyAlert {
  id: string;
  trip_id: string;
  member_id: string;
  tourist_code: string;
  /** Canonical DB column (assistance_requests.passenger_name). */
  passenger_name: string;
  /** Hydrated alias produced by both data layers. */
  display_name: string;
  subgroup_name: string;
  contact_details: string;
  category: AssistanceCategory;
  priority: AssistancePriority;
  /** Hydrated alias of the assistance_requests.description column. */
  message: string;
  /** Original free-text note supplied by the tourist. */
  note?: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  status: AlertStatus;
  assigned_responder?: string | null;
  internal_notes?: string | null;
  resolution_notes?: string | null;
  messages: AssistanceMessage[];
  created_at: string;
  acknowledged_at?: string | null;
  acknowledged_by?: string | null;
  resolved_at: string | null;
  resolved_by?: string | null;
}

export interface AuditLog {
  id: string;
  trip_id: string | null;
  actor_label: string;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
}

export interface SafeTouristPeer {
  member_id: string;
  tourist_code: string;
  display_name: string;
  subgroup_name: string;
  sharing_enabled: boolean;
  effective_status: SharingStatus;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  last_seen_at: string | null;
  is_me: boolean;
  location_updated_at?: string | null;
  possible_separation?: boolean;
}

export interface AdminPassengerView {
  roster_id: string;
  member_id: string;
  serial_no: number;
  tourist_code: string;
  full_name_display: string;
  /** Alias of full_name_display consumed across the admin console. */
  display_name: string;
  subgroup_name: string;
  passport_masked: string;
  contact_number_admin: string;
  is_claimed: boolean;
  joined_at: string | null;
  sharing_enabled: boolean;
  effective_status: SharingStatus | 'not_joined';
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  last_seen_at: string | null;
  location_updated_at?: string | null;
  has_active_alert: boolean;
  active_alert_id: string | null;
  possible_separation?: boolean;
  outside_safe_zone?: boolean;
  distance_from_meeting_meters?: number | null;
  emergency_contact?: string | null;
}
