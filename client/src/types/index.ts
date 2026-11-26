export type ItemCategory =
  | 'electronics'
  | 'bag'
  | 'keys'
  | 'id_documents'
  | 'bank_cards'
  | 'jewelry_watch'
  | 'clothing'
  | 'other';

export interface CategoryMeta {
  id: ItemCategory;
  label: string;
  sensitive: boolean;
  safePointOnly: boolean;
  suggestedQuestions: string[];
}

export interface TehranPlace {
  id: string;
  name: string;
  district: string;
  lat: number;
  lng: number;
  type: 'neighborhood' | 'square' | 'metro' | 'landmark';
}

export interface SafePoint {
  id: string;
  name: string;
  type: 'metro' | 'partner';
  area: string;
  address: string;
  lat: number;
  lng: number;
  hours: string;
}

export interface MetaConfig {
  city: string;
  bounds: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
    centerLat: number;
    centerLng: number;
  };
  categories: CategoryMeta[];
  places: TehranPlace[];
  safePoints: SafePoint[];
  rules: {
    foundItemTtlDays: number;
    lostAlertTtlDays: number;
    maxWrongOwnershipAttempts: number;
    ownershipWarningText: string;
    deliverySecurityAdvisory: string;
  };
  smsMode: 'sandbox' | 'live';
}

export interface UserProfile {
  id: string;
  phoneMasked: string;
  displayName: string;
  notificationsEnabled: boolean;
}

export interface UserCounts {
  unreadNotifications: number;
  myAds: number;
  myActiveAlerts: number;
  incomingRequests: number;
  myRequests: number;
}

export interface SearchItem {
  id: string;
  title: string;
  category: ItemCategory;
  categoryLabel: string;
  isSensitive: boolean;
  areaName: string;
  lat: number;
  lng: number;
  distanceMeters: number | null;
  foundAt: string;
  deliveryMethod: 'courier' | 'safe_point';
  safePointName: string | null;
  status: string;
  expiresAt: string;
  createdAt: string;
  isDemo: boolean;
  imageUrl: string;
  imageIsBlurred: boolean;
  isMine: boolean;
  verifiedClaimId: string | null;
  permanentlyBlocked: boolean;
  remainingAttempts: number;
}

export interface ItemDetail extends SearchItem {
  safePointOnly: boolean;
  description: string;
  safePointId: string | null;
  finderLabel: string;
  failedAttempts: number;
  questions: { index: number; text: string; secretAnswer?: string }[];
}

export interface MyFoundItem {
  id: string;
  title: string;
  category: ItemCategory;
  categoryLabel: string;
  isSensitive: boolean;
  areaName: string;
  lat: number;
  lng: number;
  foundAt: string;
  deliveryMethod: 'courier' | 'safe_point';
  safePointId: string | null;
  safePointName: string | null;
  status: string;
  expiresAt: string;
  relistCount: number;
  createdAt: string;
  imageUrl: string;
  totalClaims: number;
  verifiedClaims: number;
  questions: { index: number; text: string }[];
  auditLogs: AuditLogEntry[];
}

export interface LostAlertItem {
  id: string;
  title: string;
  category: ItemCategory;
  categoryLabel: string;
  areaName: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  lostDate: string;
  timeSlot: 'morning' | 'noon' | 'evening' | 'night' | 'all_day';
  status: string;
  expiresAt: string;
  relistCount: number;
  createdAt: string;
  matchingItems: {
    id: string;
    title: string;
    areaName: string;
    foundAt: string;
    imageUrl: string;
  }[];
}

export interface IncomingClaim {
  id: string;
  itemId: string;
  itemTitle: string;
  itemCategoryLabel: string;
  itemArea: string;
  itemStatus: string;
  itemImageUrl: string;
  claimantName: string;
  status: string;
  attemptNumber: number;
  verifiedAt: string | null;
  finderNote: string | null;
  deliveryStatus: string | null;
  deliveryMethod: 'courier' | 'safe_point' | null;
  unreadMessages: number;
  createdAt: string;
  qaComparison: {
    index: number;
    question: string;
    expectedAnswer: string;
    submittedAnswer: string;
  }[];
}

export interface MyClaim {
  id: string;
  itemId: string;
  itemTitle: string;
  itemCategoryLabel: string;
  itemArea: string;
  itemStatus: string;
  itemImageUrl: string;
  finderName: string;
  status: string;
  attemptNumber: number;
  verifiedAt: string | null;
  finderNote: string | null;
  deliveryStatus: string | null;
  deliveryMethod: 'courier' | 'safe_point' | null;
  unreadMessages: number;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  entity_type: string;
  entity_id: string;
  actor_role: string;
  from_status: string | null;
  to_status: string;
  note: string;
  created_at: string;
}

export interface ClaimRoomData {
  id: string;
  status: string;
  verifiedAt: string | null;
  myRole: 'finder' | 'loser';
  peerName: string;
  isBlocked: boolean;
  item: {
    id: string;
    title: string;
    category: ItemCategory;
    categoryLabel: string;
    safePointOnly: boolean;
    description: string;
    areaName: string;
    foundAt: string;
    status: string;
    imageUrl: string;
  };
  delivery: {
    id: string;
    method: 'courier' | 'safe_point';
    status: string;
    safePoint: {
      id: string;
      name: string;
      area: string;
      address: string;
      hours: string;
    } | null;
    courierDestinationMasked: string | null;
    activeHandoverCode: string | null;
    activePickupCode: string | null;
    safePointOperatorName: string | null;
    safePointReceiptNo: string | null;
    finalReceiptNo: string | null;
    handedOverAt: string | null;
    deliveredAt: string | null;
    auditLogs: AuditLogEntry[];
  } | null;
}

export interface ChatMessage {
  id: string;
  isMine: boolean;
  isSystem: boolean;
  senderName: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  linkPath: string;
  isRead: boolean;
  createdAt: string;
}

export interface BlockedUser {
  id: string;
  displayName: string;
  reason: string;
  createdAt: string;
}
