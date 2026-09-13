PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  telegram_user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  method TEXT NOT NULL,
  amount_rub INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(telegram_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS entitlements (
  telegram_user_id TEXT PRIMARY KEY,
  plan TEXT NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  starts_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  provider_payment_id TEXT,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_entitlements_expiry ON entitlements(status, expires_at);
