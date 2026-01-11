-- ============================================================
-- BURST LINE ONLINE - DATABASE SCHEMA
-- PostgreSQL for Supabase
-- ============================================================

-- ============================================================
-- 1. USERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  version VARCHAR(20) NOT NULL DEFAULT 'free', -- 'free' or 'premium'
  version_purchased_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true,
  backup_discord_id VARCHAR(255), -- Optional Discord backup
  backup_email VARCHAR(255) -- Secondary email for security
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_version ON users(version);

-- ============================================================
-- 2. USER PROGRESSION TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS user_progression (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  total_stars INTEGER DEFAULT 0,
  monthly_stars INTEGER DEFAULT 0,
  last_monthly_reset TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id)
);

CREATE INDEX idx_progression_user ON user_progression(user_id);
CREATE INDEX idx_progression_stars ON user_progression(total_stars DESC);

-- ============================================================
-- 3. MATCHES TABLE (for stats, analytics, and replays)
-- ============================================================
CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_mode VARCHAR(50) NOT NULL, -- 'domination' or 'development'
  match_type VARCHAR(50) NOT NULL, -- 'ranked' or 'custom'
  bot_type VARCHAR(50), -- NULL if multiplayer; 'training', 'normal', 'advanced', 'grandmaster'
  bot_personality VARCHAR(50), -- 'thrower', 'defender', 'attacker', 'strategist', 'gambler'
  player_count INTEGER NOT NULL, -- Total players in match (including bots/humans)
  result VARCHAR(20) NOT NULL, -- 'win', 'loss', 'draw'
  stars_earned INTEGER DEFAULT 0,
  units_destroyed INTEGER DEFAULT 0,
  enemies_eliminated INTEGER DEFAULT 0,
  final_rank INTEGER, -- 1st place, 2nd, etc. NULL if loss
  match_duration_seconds INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_matches_user ON matches(user_id);
CREATE INDEX idx_matches_result ON matches(result);
CREATE INDEX idx_matches_game_mode ON matches(game_mode);
CREATE INDEX idx_matches_created ON matches(created_at DESC);

-- ============================================================
-- 4. MONTHLY LEADERBOARD TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS monthly_leaderboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month_year DATE NOT NULL, -- First day of the month (2025-11-01)
  total_stars INTEGER DEFAULT 0,
  rank INTEGER,
  is_tournament_winner BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, month_year)
);

CREATE INDEX idx_leaderboard_month ON monthly_leaderboards(month_year DESC);
CREATE INDEX idx_leaderboard_stars ON monthly_leaderboards(total_stars DESC);
CREATE INDEX idx_leaderboard_user_month ON monthly_leaderboards(user_id, month_year);

-- ============================================================
-- 5. COSMETICS TABLE (Unit skins, colors, themes)
-- ============================================================
CREATE TABLE IF NOT EXISTS cosmetics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  type VARCHAR(50) NOT NULL, -- 'unit_skin', 'color', 'theme'
  description TEXT,
  requires_premium BOOLEAN DEFAULT false,
  unlock_type VARCHAR(50) DEFAULT 'none', -- 'none' (default), 'stars', 'premium_only'
  stars_required INTEGER DEFAULT 0, -- If unlock_type = 'stars'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_cosmetics_type ON cosmetics(type);
CREATE INDEX idx_cosmetics_premium ON cosmetics(requires_premium);

-- ============================================================
-- 6. USER COSMETICS TABLE (Tracks what user owns/equips)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_cosmetics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cosmetic_id UUID NOT NULL REFERENCES cosmetics(id) ON DELETE CASCADE,
  equipped BOOLEAN DEFAULT false,
  unlocked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, cosmetic_id)
);

CREATE INDEX idx_user_cosmetics_user ON user_cosmetics(user_id);
CREATE INDEX idx_user_cosmetics_equipped ON user_cosmetics(equipped);

-- ============================================================
-- 7. SESSIONS TABLE (For authentication & tracking)
-- ============================================================
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(500) NOT NULL UNIQUE,
  ip_address VARCHAR(45),
  device_info VARCHAR(255),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_token ON sessions(token);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- ============================================================
-- 8. ANALYTICS TABLE (For tracking gameplay events)
-- ============================================================
CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  event_type VARCHAR(100) NOT NULL, -- 'game_start', 'game_end', 'button_click', etc.
  event_data JSONB, -- Flexible data structure
  app_version VARCHAR(20),
  device_type VARCHAR(50), -- 'android', 'ios', 'web'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_analytics_user ON analytics_events(user_id);
CREATE INDEX idx_analytics_type ON analytics_events(event_type);
CREATE INDEX idx_analytics_created ON analytics_events(created_at DESC);

-- ============================================================
-- 9. FRIEND REQUESTS / SOCIAL (Optional for future)
-- ============================================================
CREATE TABLE IF NOT EXISTS friend_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'accepted', 'rejected', 'blocked'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CHECK (requester_id != recipient_id)
);

CREATE INDEX idx_friend_requests_user ON friend_requests(recipient_id);

-- ============================================================
-- STORED PROCEDURES / FUNCTIONS
-- ============================================================

-- Reset monthly stars and create new leaderboard entry
CREATE OR REPLACE FUNCTION reset_monthly_progression()
RETURNS void AS $$
DECLARE
  current_month DATE;
BEGIN
  current_month := DATE_TRUNC('month', CURRENT_TIMESTAMP)::DATE;
  
  -- Create leaderboard entries for this month
  INSERT INTO monthly_leaderboards (user_id, month_year, total_stars, rank)
  SELECT 
    up.user_id,
    current_month,
    up.monthly_stars,
    ROW_NUMBER() OVER (ORDER BY up.monthly_stars DESC)
  FROM user_progression up
  WHERE up.monthly_stars > 0
  ON CONFLICT (user_id, month_year) DO NOTHING;
  
  -- Mark tournament winner (top player)
  UPDATE monthly_leaderboards
  SET is_tournament_winner = true
  WHERE month_year = current_month
  AND rank = 1;
  
  -- Reset monthly_stars for next month
  UPDATE user_progression
  SET monthly_stars = 0, last_monthly_reset = CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- Function to add stars to user
CREATE OR REPLACE FUNCTION add_user_stars(p_user_id UUID, p_stars INTEGER)
RETURNS void AS $$
BEGIN
  UPDATE user_progression
  SET total_stars = total_stars + p_stars,
      monthly_stars = monthly_stars + p_stars,
      updated_at = CURRENT_TIMESTAMP
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- INITIAL DATA / COSMETICS
-- ============================================================

-- Insert default cosmetics (free tier)
INSERT INTO cosmetics (name, type, description, requires_premium, unlock_type) VALUES
('Default Unit', 'unit_skin', 'Standard unit appearance', false, 'none'),
('Red Color', 'color', 'Red team color', false, 'none'),
('Blue Color', 'color', 'Blue team color', false, 'none'),
('Green Color', 'color', 'Green team color', false, 'none'),
('Standard Theme', 'theme', 'Standard game theme', false, 'none')
ON CONFLICT (name) DO NOTHING;

-- Premium cosmetics (need to be unlocked)
INSERT INTO cosmetics (name, type, description, requires_premium, unlock_type) VALUES
('Gold Unit', 'unit_skin', 'Premium golden unit appearance', true, 'premium_only'),
('Silver Unit', 'unit_skin', 'Premium silver unit appearance', true, 'premium_only'),
('Dark Theme', 'theme', 'Dark mode theme', true, 'stars'),
('Purple Color', 'color', 'Premium purple team color', true, 'stars')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- ROW-LEVEL SECURITY (Optional - Enable for Production)
-- ============================================================

-- ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE user_progression ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
-- 
-- -- Users can only see their own data
-- CREATE POLICY "users_read_own" ON users FOR SELECT
--   USING (auth.uid() = id);
-- 
-- CREATE POLICY "users_update_own" ON users FOR UPDATE
--   USING (auth.uid() = id);

-- ============================================================
-- END SCHEMA
-- ============================================================
