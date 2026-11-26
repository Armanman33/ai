-- PostgreSQL / Supabase production migration schema for Peydash (پیداش)
-- Mirrors SQLite runtime schema 1:1 for seamless production migration.

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  phone VARCHAR(15) NOT NULL UNIQUE,
  display_name VARCHAR(80) NOT NULL DEFAULT 'کاربر پیداش',
  notifications_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  is_suspended BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS otp_codes (
  id UUID PRIMARY KEY,
  phone VARCHAR(15) NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts SMALLINT NOT NULL DEFAULT 0,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS safe_points (
  id VARCHAR(64) PRIMARY KEY,
  name TEXT NOT NULL,
  type VARCHAR(16) NOT NULL CHECK(type IN ('metro', 'partner')),
  area TEXT NOT NULL,
  address TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  hours TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS found_items (
  id UUID PRIMARY KEY,
  finder_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(120) NOT NULL,
  category VARCHAR(32) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  area_name VARCHAR(120) NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  found_at TIMESTAMPTZ NOT NULL,
  image_path TEXT NOT NULL,
  blurred_image_path TEXT NOT NULL,
  delivery_method VARCHAR(20) NOT NULL CHECK(delivery_method IN ('courier', 'safe_point')),
  safe_point_id VARCHAR(64) REFERENCES safe_points(id),
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  expires_at TIMESTAMPTZ NOT NULL,
  near_expiry_notified BOOLEAN NOT NULL DEFAULT FALSE,
  relist_count INTEGER NOT NULL DEFAULT 0,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS item_questions (
  id UUID PRIMARY KEY,
  item_id UUID NOT NULL REFERENCES found_items(id) ON DELETE CASCADE,
  question_index SMALLINT NOT NULL CHECK(question_index IN (1, 2, 3)),
  question_text TEXT NOT NULL,
  answer_encrypted TEXT NOT NULL,
  answer_normalized TEXT NOT NULL,
  UNIQUE(item_id, question_index)
);

CREATE TABLE IF NOT EXISTS lost_alerts (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(120) NOT NULL,
  category VARCHAR(32) NOT NULL,
  area_name VARCHAR(120) NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  radius_meters INTEGER NOT NULL DEFAULT 2000,
  lost_date VARCHAR(20) NOT NULL,
  time_slot VARCHAR(20) NOT NULL DEFAULT 'all_day',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  expires_at TIMESTAMPTZ NOT NULL,
  near_expiry_notified BOOLEAN NOT NULL DEFAULT FALSE,
  relist_count INTEGER NOT NULL DEFAULT 0,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ownership_attempts (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES found_items(id) ON DELETE CASCADE,
  failed_attempts SMALLINT NOT NULL DEFAULT 0,
  permanently_blocked BOOLEAN NOT NULL DEFAULT FALSE,
  last_attempt_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, item_id)
);

CREATE TABLE IF NOT EXISTS ownership_claims (
  id UUID PRIMARY KEY,
  item_id UUID NOT NULL REFERENCES found_items(id) ON DELETE CASCADE,
  loser_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  finder_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'rejected',
  answers_json JSONB NOT NULL,
  attempt_number SMALLINT NOT NULL DEFAULT 1,
  verified_at TIMESTAMPTZ,
  verified_by VARCHAR(16),
  finder_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY,
  claim_id UUID NOT NULL REFERENCES ownership_claims(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deliveries (
  id UUID PRIMARY KEY,
  claim_id UUID NOT NULL UNIQUE REFERENCES ownership_claims(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES found_items(id) ON DELETE CASCADE,
  method VARCHAR(20) NOT NULL,
  safe_point_id VARCHAR(64) REFERENCES safe_points(id),
  courier_destination_masked TEXT,
  courier_destination_encrypted TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'pending_coordination',
  handover_code_hash TEXT,
  handover_code_encrypted TEXT,
  handover_code_used_at TIMESTAMPTZ,
  pickup_code_hash TEXT,
  pickup_code_encrypted TEXT,
  pickup_code_used_at TIMESTAMPTZ,
  safe_point_operator_name TEXT,
  safe_point_receipt_no VARCHAR(64),
  final_receipt_no VARCHAR(64),
  handed_over_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(48) NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  link_path TEXT NOT NULL DEFAULT '/',
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sms_logs (
  id UUID PRIMARY KEY,
  recipient_phone VARCHAR(15) NOT NULL,
  event_type VARCHAR(48) NOT NULL,
  message TEXT NOT NULL,
  provider VARCHAR(32) NOT NULL,
  status VARCHAR(24) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY,
  reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id UUID REFERENCES found_items(id) ON DELETE CASCADE,
  reported_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  reason VARCHAR(64) NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  status VARCHAR(24) NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_blocks (
  id UUID PRIMARY KEY,
  blocker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(blocker_id, blocked_id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY,
  entity_type VARCHAR(24) NOT NULL,
  entity_id UUID NOT NULL,
  actor_id UUID,
  actor_role VARCHAR(24) NOT NULL,
  from_status VARCHAR(32),
  to_status VARCHAR(32) NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
