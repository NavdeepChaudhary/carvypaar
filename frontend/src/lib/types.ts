/** Types mirroring the backend Pydantic schemas. */

export type UserRole = "buyer" | "seller" | "admin";

export interface User {
  id: number;
  email: string;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
  bio: string | null;
  location: string | null;
  role: UserRole;
  is_active: boolean;
  is_verified: boolean;
  has_password: boolean;
  has_google: boolean;
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  expires_in: number;
  user: User;
}

export interface RegisterPayload {
  email: string;
  password: string;
  full_name: string;
  role: "buyer" | "seller";
  phone?: string;
}

export interface ProfileUpdate {
  full_name?: string;
  phone?: string;
  bio?: string;
  location?: string;
}

// ---------------------------------------------------------------- listings
export type FuelType = "petrol" | "diesel" | "electric" | "hybrid" | "cng" | "lpg";
export type Transmission = "manual" | "automatic" | "semi_automatic";
export type BodyType =
  | "sedan" | "hatchback" | "suv" | "coupe" | "convertible" | "wagon" | "pickup" | "van" | "minivan";
export type CarCondition = "new" | "excellent" | "good" | "fair" | "poor";
export type ListingType = "sale" | "auction";
export type ListingStatus = "pending" | "active" | "sold" | "rejected" | "inactive";

export interface PublicUser {
  id: number;
  full_name: string;
  avatar_url: string | null;
  location: string | null;
  role: UserRole;
  created_at: string;
}

export interface ListingImage {
  id: number;
  url: string;
  position: number;
}

export interface ListingCard {
  id: number;
  title: string;
  make: string;
  model: string;
  year: number;
  mileage: number;
  fuel_type: FuelType;
  transmission: Transmission;
  body_type: BodyType;
  condition: CarCondition;
  location: string;
  price: number;
  listing_type: ListingType;
  status: ListingStatus;
  cover_image: string | null;
  image_count: number;
  views_count: number;
  created_at: string;
  is_favorite: boolean;
  auction_id: number | null;
  estimated_price: number | null;
  price_rating: PriceRating | null;
}

export interface ListingDetail extends ListingCard {
  color: string;
  description: string;
  features: string[];
  images: ListingImage[];
  seller: PublicUser;
  favorites_count: number;
  updated_at: string;
  is_owner: boolean;
  price_insight: PriceInsight | null;
}

/** Body for create (all required) and update (partial). */
export interface ListingInput {
  title: string;
  make: string;
  model: string;
  year: number;
  mileage: number;
  fuel_type: FuelType;
  transmission: Transmission;
  body_type: BodyType;
  condition: CarCondition;
  color: string;
  location: string;
  price: number;
  description: string;
  features: string[];
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface MakeModels {
  make: string;
  count: number;
  models: string[];
}

// ---------------------------------------------------------------- interactions
export type OfferStatus = "pending" | "accepted" | "rejected" | "withdrawn";

export interface Offer {
  id: number;
  listing_id: number;
  listing_title: string;
  listing_price: number;
  cover_image: string | null;
  buyer: PublicUser;
  amount: number;
  message: string | null;
  status: OfferStatus;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: number;
  listing_id: number;
  listing_title: string;
  sender: PublicUser;
  recipient: PublicUser;
  body: string;
  read_at: string | null;
  created_at: string;
}

// ---------------------------------------------------------------- auctions
export type AuctionStatus = "scheduled" | "live" | "ended" | "cancelled";

export interface AuctionState {
  id: number;
  listing_id: number;
  status: AuctionStatus;
  starting_price: number;
  bid_increment: number;
  current_price: number | null;
  min_next_bid: number;
  bid_count: number;
  start_time: string;
  end_time: string;
  original_end_time: string;
  extended: boolean;
  has_reserve: boolean;
  reserve_met: boolean | null;
  leading_bidder_id: number | null;
  winner_id: number | null;
  final_price: number | null;
  server_time: string;
}

export interface Bid {
  id: number;
  auction_id: number;
  amount: number;
  created_at: string;
  bidder: { id: number; display_name: string };
}

export interface AuctionCard {
  auction: AuctionState;
  listing: ListingCard;
}

export interface AuctionDetail {
  auction: AuctionState;
  listing: ListingDetail;
  bids: Bid[];
  is_seller: boolean;
  my_max_bid: number | null;
  watchers: number;
}

export interface BidResult {
  bid: Bid;
  auction: AuctionState;
  extended: boolean;
}

export type BidOutcome = "upcoming" | "leading" | "outbid" | "won" | "lost" | "cancelled";

export interface MyBid {
  auction: AuctionState;
  listing: ListingCard;
  my_max_bid: number;
  outcome: BidOutcome;
}

export interface AuctionCreate {
  starting_price: number;
  reserve_price?: number;
  bid_increment: number;
  start_time?: string;
  end_time: string;
}

export type NotificationType =
  | "outbid" | "auction_won" | "auction_ended" | "offer_received" | "offer_updated"
  | "message" | "listing_approved" | "listing_rejected" | "system";

export interface AppNotification {
  id: number;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  data: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
}

// ---------------------------------------------------------------- AI price predictor
export type PriceRating = "great_deal" | "fair" | "overpriced";
export type PriceConfidence = "high" | "medium" | "low";

export interface PriceFactor {
  key: string;
  label: string;
  value: string;
  impact: number;
  direction: "up" | "down";
}

export interface PriceInsight {
  estimated_price: number;
  low: number;
  high: number;
  confidence: PriceConfidence;
  rating: PriceRating | null;
  delta_pct: number | null;
  factors: PriceFactor[];
  model_version: string;
}

export interface PricePredictRequest {
  make: string;
  model: string;
  year: number;
  mileage: number;
  fuel_type: FuelType;
  transmission: Transmission;
  body_type: BodyType;
  condition: CarCondition;
  location: string;
  asking_price?: number;
}

export interface PricePrediction {
  estimated_price: number;
  low: number;
  high: number;
  interval: number;
  confidence: PriceConfidence;
  factors: PriceFactor[];
  deal: { rating: PriceRating; asking_price: number; delta: number; delta_pct: number } | null;
  unseen: string[];
  model_version: string;
  currency: "INR";
}

export interface ModelInfo {
  available: boolean;
  version?: string;
  trained_at?: string;
  rows?: number;
  sources?: Record<string, number>;
  metrics?: Record<string, number>;
  feature_importance?: Record<string, number>;
  interval?: number;
  message?: string;
}

// ---------------------------------------------------------------- admin
export interface DailyPoint {
  date: string;
  listings: number;
  users: number;
  bids: number;
}

export interface AdminStats {
  users_total: number;
  users_by_role: Record<string, number>;
  users_new_7d: number;
  users_new_prev_7d: number;
  listings_by_status: Record<string, number>;
  listings_new_7d: number;
  listings_new_prev_7d: number;
  pending_review: number;
  auctions_by_status: Record<string, number>;
  bids_total: number;
  bids_7d: number;
  gmv: number;
  gmv_7d: number;
  daily: DailyPoint[];
  top_makes: { label: string; count: number }[];
}

export interface PublicStats {
  active_listings: number;
  live_auctions: number;
  auctions_closed: number;
  members: number;
}

export interface AdminListingRow {
  listing: ListingCard;
  seller_id: number;
  seller_name: string;
  seller_email: string;
  updated_at: string;
}

export interface AdminUserRow {
  user: User;
  listings: number;
  bids: number;
  last_login_at: string | null;
}

export interface AdminAuctionRow {
  auction: AuctionState;
  listing_id: number;
  listing_title: string;
  seller_name: string;
  cover_image: string | null;
}
