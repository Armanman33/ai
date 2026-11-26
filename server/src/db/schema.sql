PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL DEFAULT 'کاربر پیداش',
  notifications_enabled INTEGER NOT NULL DEFAULT 0,
  is_demo INTEGER NOT NULL DEFAULT 0,
  is_suspended INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS otp_codes (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  used_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_otp_phone ON otp_codes(phone, created_at);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS safe_points (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('metro', 'partner')),
  area TEXT NOT NULL,
  address TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  hours TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS found_items (
  id TEXT PRIMARY KEY,
  finder_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('electronics', 'bag', 'keys', 'id_documents', 'bank_cards', 'jewelry_watch', 'clothing', 'other')),
  description TEXT NOT NULL DEFAULT '',
  area_name TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  found_at TEXT NOT NULL,
  image_path TEXT NOT NULL,
  blurred_image_path TEXT NOT NULL,
  delivery_method TEXT NOT NULL CHECK(delivery_method IN ('courier', 'safe_point')),
  safe_point_id TEXT REFERENCES safe_points(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'claimed', 'delivered', 'expired', 'removed')),
  expires_at TEXT NOT NULL,
  near_expiry_notified INTEGER NOT NULL DEFAULT 0,
  relist_count INTEGER NOT NULL DEFAULT 0,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_found_items_status_expires ON found_items(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_found_items_finder ON found_items(finder_id);
CREATE INDEX IF NOT EXISTS idx_found_items_category ON found_items(category);

CREATE TABLE IF NOT EXISTS item_questions (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES found_items(id) ON DELETE CASCADE,
  question_index INTEGER NOT NULL CHECK(question_index IN (1, 2, 3)),
  question_text TEXT NOT NULL,
  answer_encrypted TEXT NOT NULL,
  answer_normalized TEXT NOT NULL,
  UNIQUE(item_id, question_index)
);
CREATE INDEX IF NOT EXISTS idx_item_questions_item ON item_questions(item_id);

CREATE TABLE IF NOT EXISTS lost_alerts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('electronics', 'bag', 'keys', 'id_documents', 'bank_cards', 'jewelry_watch', 'clothing', 'other')),
  area_name TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  radius_meters INTEGER NOT NULL DEFAULT 2000,
  lost_date TEXT NOT NULL,
  time_slot TEXT NOT NULL DEFAULT 'all_day',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'expired', 'resolved')),
  expires_at TEXT NOT NULL,
  near_expiry_notified INTEGER NOT NULL DEFAULT 0,
  relist_count INTEGER NOT NULL DEFAULT 0,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lost_alerts_status_expires ON lost_alerts(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_lost_alerts_user ON lost_alerts(user_id);

-- Permanent server-side 3-strike lockout per (user_id, item_id)
CREATE TABLE IF NOT EXISTS ownership_attempts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES found_items(id) ON DELETE CASCADE,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  permanently_blocked INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, item_id)
);

CREATE TABLE IF NOT EXISTS ownership_claims (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES found_items(id) ON DELETE CASCADE,
  loser_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  finder_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'rejected' CHECK(status IN ('pending_review', 'rejected', 'verified', 'cancelled')),
  answers_json TEXT NOT NULL,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  verified_at TEXT,
  verified_by TEXT CHECK(verified_by IN ('auto', 'finder')),
  finder_note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_claims_item ON ownership_claims(item_id);
CREATE INDEX IF NOT EXISTS idx_claims_loser ON ownership_claims(loser_id);
CREATE INDEX IF NOT EXISTS idx_claims_finder ON ownership_claims(finder_id);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL REFERENCES ownership_claims(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  is_system INTEGER NOT NULL DEFAULT 0,
  read_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_claim ON chat_messages(claim_id, created_at);

CREATE TABLE IF NOT EXISTS deliveries (
  id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL UNIQUE REFERENCES ownership_claims(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES found_items(id) ON DELETE CASCADE,
  method TEXT NOT NULL CHECK(method IN ('courier', 'safe_point')),
  safe_point_id TEXT REFERENCES safe_points(id),
  courier_destination_masked TEXT,
  courier_destination_encrypted TEXT,
  status TEXT NOT NULL DEFAULT 'pending_coordination' CHECK(status IN (
    'pending_coordination',
    'courier_requested',
    'handed_to_courier',
    'safe_point_selected',
    'received_at_safe_point',
    'delivered'
  )),
  handover_code_hash TEXT,
  handover_code_encrypted TEXT,
  handover_code_used_at TEXT,
  pickup_code_hash TEXT,
  pickup_code_encrypted TEXT,
  pickup_code_used_at TEXT,
  safe_point_operator_name TEXT,
  safe_point_receipt_no TEXT,
  final_receipt_no TEXT,
  handed_over_at TEXT,
  delivered_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  link_path TEXT NOT NULL DEFAULT '/',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, created_at);

CREATE TABLE IF NOT EXISTS sms_logs (
  id TEXT PRIMARY KEY,
  recipient_phone TEXT NOT NULL,
  event_type TEXT NOT NULL,
  message TEXT NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id TEXT REFERENCES found_items(id) ON DELETE CASCADE,
  reported_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'reviewed', 'resolved')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_blocks (
  id TEXT PRIMARY KEY,
  blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  UNIQUE(blocker_id, blocked_id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('item', 'alert', 'claim', 'delivery')),
  entity_id TEXT NOT NULL,
  actor_id TEXT,
  actor_role TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id, created_at);
