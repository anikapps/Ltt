export type TripStatus = 'upcoming' | 'active' | 'completed';

export type StaffRole =
  | 'super_admin'
  | 'trip_organizer'
  | 'tour_manager'
  | 'responder'
  | 'main_admin'
  | 'tour_leader'
  | 'assistant_leader';

export type AdminRole = StaffRole;

export type SharingStatus = 'sharing' | 'disabled' | 'offline' | 'unavailable';

export type AssistanceCategory =
  | 'Lost / separated from group'
  | 'Medical assistance'
  | 'Accident / injury'
  | 'Transport assistance'
  | 'Safety / security concern'
  | 'Cannot find meeting point'
  | 'Other';

export type AssistancePriority = 'Normal' | 'High' | 'Critical';

export type AssistanceStatus =
  | 'New'
  | 'Acknowledged'
  | 'Assigned'
  | 'Responding'
  | 'Resolved'
  | 'Closed'
  | 'Cancelled';

export type AlertStatus = 'active' | 'acknowledged' | 'resolved' | AssistanceStatus;

export interface ItineraryItem {
  id: string;
  day_label: string;
  time_label: string;
  title: string;
  location_name: string;
  instructions: string;
}

export interface Trip {
  id: string;
  name: string;
  destination: string;
  start_date: string;
  end_date: string;
  max_tourists: number;
  status: TripStatus;
  organizer_contact?: string;
  stale_threshold_seconds?: number;
  update_interval_seconds?: number;
  retention_days?: number;
  separation_threshold_meters?: number;
  verification_mode?: 'strict_roster';
  itinerary?: ItineraryItem[];
  essentials?: TripEssentialHub;
  created_at: string;
  ended_at?: string | null;
}

export interface TripAdmin {
  id: string;
  trip_id: string;
  admin_email: string;
  admin_name: string;
  role: StaffRole;
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
  subgroup_name?: string;
  is_claimed: boolean;
  claimed_member_id?: string | null;
  claimed_at?: string | null;
  created_at: string;
}

export interface TripInvite {
  id: string;
  trip_id: string;
  token: string;
  invitation_code?: string;
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
  nationality?: string;
  emergency_contact?: string | null;
  sharing_enabled: boolean;
  consent_granted?: boolean;
  session_token_hash: string;
  joined_at: string;
  last_seen_at: string;
}

export interface TouristLocation {
  member_id: string;
  trip_id: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  speed?: number | null;
  heading?: number | null;
  sharing_status: SharingStatus;
  updated_at: string;
}

export interface MeetingPoint {
  id: string;
  trip_id: string;
  title: string;
  latitude: number;
  longitude: number;
  notes: string;
  scheduled_at: string;
  radius_meters: number;
  is_active: boolean;
  created_at: string;
}

export interface HeadcountResponseItem {
  member_id: string;
  display_name: string;
  status: 'present' | 'needs_help';
  responded_at: string;
}

export interface HeadcountSession {
  id: string;
  trip_id: string;
  title: string;
  subgroup_name: string;
  status: 'open' | 'closed';
  created_by: string;
  created_at: string;
  closed_at?: string | null;
  responses: HeadcountResponseItem[];
}

export interface AnnouncementItem {
  id: string;
  trip_id: string;
  title: string;
  body: string;
  subgroup_name: string;
  priority: 'normal' | 'important' | 'urgent';
  created_by: string;
  created_at: string;
  read_by_member_ids: string[];
}

export interface AssistanceMessage {
  id: string;
  request_id: string;
  sender_name: string;
  sender_role: 'tourist' | 'organizer' | 'responder';
  message: string;
  created_at: string;
}

export interface EmergencyAlert {
  id: string;
  trip_id: string;
  member_id: string;
  tourist_code?: string;
  passenger_name: string;
  subgroup_name?: string;
  contact_details: string;
  category?: AssistanceCategory;
  priority?: AssistancePriority;
  note?: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  status: AlertStatus;
  assigned_responder?: string | null;
  internal_notes?: string | null;
  resolution_notes?: string | null;
  messages?: AssistanceMessage[];
  created_at: string;
  acknowledged_at?: string | null;
  acknowledged_by?: string | null;
  resolved_at?: string | null;
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
  last_seen_at: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  location_updated_at: string | null;
  possible_separation?: boolean;
}

export interface AdminPassengerView extends SafeTouristPeer {
  roster_id: string;
  serial_no: number;
  is_claimed: boolean;
  passport_masked: string;
  contact_number_admin: string;
  emergency_contact?: string | null;
}


export interface TripEssentialHub {
  hotel_name: string;
  hotel_address: string;
  hotel_phone: string;
  hotel_lat: number;
  hotel_lng: number;
  airport_name: string;
  airport_terminal: string;
  airport_lat: number;
  airport_lng: number;
  organizer_name: string;
  organizer_phone: string;
  local_emergency_police: string;
  local_emergency_medical: string;
  embassy_name: string;
  embassy_phone: string;
}

export interface GroupChatMessage {
  id: string;
  trip_id: string;
  sender_id: string;
  sender_name: string;
  sender_code?: string;
  sender_role: 'tourist' | 'organizer' | 'responder';
  message: string;
  latitude?: number | null;
  longitude?: number | null;
  is_urgent?: boolean;
  created_at: string;
}
