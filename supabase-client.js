// supabase-client.js
// Initialize Supabase client for server-side operations

const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY; // Use service key for server

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env file');
  process.exit(1);
}

// Create Supabase client with service role (full admin access)
const supabase = createClient(supabaseUrl, supabaseServiceKey);

console.log('✅ Supabase client initialized');

// ============================================================
// USER AUTHENTICATION FUNCTIONS
// ============================================================

/**
 * Register a new user
 * @param {string} email
 * @param {string} username
 * @param {string} password
 * @returns {object} { user, token, error }
 */
async function registerUser(email, username, password) {
  try {
    // Check if user exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .or(`email.eq.${email},username.eq.${username}`)
      .single();

    if (existingUser) {
      return { error: 'Email or username already taken' };
    }

    // Hash password
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const { data, error } = await supabase
      .from('users')
      .insert([
        {
          email,
          username,
          password_hash: hashedPassword,
          version: 'free'
        }
      ])
      .select()
      .single();

    if (error) throw error;

    // Create progression record
    await supabase
      .from('user_progression')
      .insert([{ user_id: data.id, total_stars: 0, monthly_stars: 0 }]);

    // Generate JWT token
    const token = generateToken(data.id, data.email);

    return {
      user: {
        id: data.id,
        email: data.email,
        username: data.username,
        version: data.version
      },
      token,
      error: null
    };
  } catch (err) {
    console.error('Register error:', err.message);
    return { error: err.message };
  }
}

/**
 * Login user
 * @param {string} email
 * @param {string} password
 * @returns {object} { user, token, error }
 */
async function loginUser(email, password) {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !data) {
      return { error: 'User not found' };
    }

    // Compare password
    const bcrypt = require('bcryptjs');
    const passwordMatch = await bcrypt.compare(password, data.password_hash);

    if (!passwordMatch) {
      return { error: 'Invalid password' };
    }

    // Update last login
    await supabase
      .from('users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', data.id);

    // Generate JWT token
    const token = generateToken(data.id, data.email);

    return {
      user: {
        id: data.id,
        email: data.email,
        username: data.username,
        version: data.version
      },
      token,
      error: null
    };
  } catch (err) {
    console.error('Login error:', err.message);
    return { error: err.message };
  }
}

/**
 * Verify JWT token and get user
 * @param {string} token
 * @returns {object} { user, error }
 */
function verifyToken(token) {
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return { user: decoded, error: null };
  } catch (err) {
    return { error: 'Invalid token' };
  }
}

/**
 * Generate JWT token
 * @param {string} userId
 * @param {string} email
 * @returns {string} JWT token
 */
function generateToken(userId, email) {
  const jwt = require('jsonwebtoken');
  return jwt.sign(
    { id: userId, email },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
}

// ============================================================
// PROGRESSION FUNCTIONS
// ============================================================

/**
 * Add stars to user progression
 * @param {string} userId
 * @param {number} starsAmount
 * @returns {object} { success, error }
 */
async function addUserStars(userId, starsAmount) {
  try {
    const { error } = await supabase.rpc('add_user_stars', {
      p_user_id: userId,
      p_stars: starsAmount
    });

    if (error) throw error;

    return { success: true, error: null };
  } catch (err) {
    console.error('Add stars error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Get user progression
 * @param {string} userId
 * @returns {object} progression data or error
 */
async function getUserProgression(userId) {
  try {
    const { data, error } = await supabase
      .from('user_progression')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) throw error;

    return { progression: data, error: null };
  } catch (err) {
    console.error('Get progression error:', err.message);
    return { error: err.message };
  }
}

// ============================================================
// MATCH LOGGING FUNCTIONS
// ============================================================

/**
 * Log a completed match
 * @param {object} matchData
 * @returns {object} { success, error }
 */
async function logMatch(matchData) {
  try {
    const {
      userId,
      gameMode,
      matchType,
      botType,
      botPersonality,
      playerCount,
      result,
      starsEarned,
      unitsDestroyed,
      enemiesEliminated,
      finalRank,
      matchDurationSeconds
    } = matchData;

    const { error } = await supabase
      .from('matches')
      .insert([
        {
          user_id: userId,
          game_mode: gameMode,
          match_type: matchType,
          bot_type: botType,
          bot_personality: botPersonality,
          player_count: playerCount,
          result,
          stars_earned: starsEarned,
          units_destroyed: unitsDestroyed,
          enemies_eliminated: enemiesEliminated,
          final_rank: finalRank,
          match_duration_seconds: matchDurationSeconds
        }
      ]);

    if (error) throw error;

    return { success: true, error: null };
  } catch (err) {
    console.error('Log match error:', err.message);
    return { success: false, error: err.message };
  }
}

// ============================================================
// LEADERBOARD FUNCTIONS
// ============================================================

/**
 * Get current month leaderboard
 * @param {number} limit - number of top players to return
 * @returns {array} leaderboard entries or error
 */
async function getMonthlyLeaderboard(limit = 100) {
  try {
    const firstOfMonth = new Date();
    firstOfMonth.setDate(1);
    firstOfMonth.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('monthly_leaderboards')
      .select('*, users(username, version)')
      .eq('month_year', firstOfMonth.toISOString().split('T')[0])
      .order('total_stars', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return { leaderboard: data, error: null };
  } catch (err) {
    console.error('Get leaderboard error:', err.message);
    return { error: err.message };
  }
}

/**
 * Reset monthly progression (called at month boundary via cron)
 * @returns {object} { success, error }
 */
async function resetMonthlyProgression() {
  try {
    const { error } = await supabase.rpc('reset_monthly_progression');

    if (error) throw error;

    console.log('✅ Monthly progression reset completed');
    return { success: true, error: null };
  } catch (err) {
    console.error('Reset monthly error:', err.message);
    return { success: false, error: err.message };
  }
}

// ============================================================
// USER FUNCTIONS
// ============================================================

/**
 * Get user by ID
 * @param {string} userId
 * @returns {object} user data or error
 */
async function getUser(userId) {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) throw error;

    return { user: data, error: null };
  } catch (err) {
    console.error('Get user error:', err.message);
    return { error: err.message };
  }
}

/**
 * Update user version (free → premium)
 * @param {string} userId
 * @param {string} newVersion
 * @returns {object} { success, error }
 */
async function updateUserVersion(userId, newVersion) {
  try {
    const { error } = await supabase
      .from('users')
      .update({
        version: newVersion,
        version_purchased_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (error) throw error;

    return { success: true, error: null };
  } catch (err) {
    console.error('Update version error:', err.message);
    return { success: false, error: err.message };
  }
}

// ============================================================
// ANALYTICS FUNCTIONS
// ============================================================

/**
 * Log an analytics event
 * @param {object} eventData
 * @returns {object} { success, error }
 */
async function logAnalyticsEvent(eventData) {
  try {
    const { userId, eventType, eventData: data, appVersion, deviceType } = eventData;

    const { error } = await supabase
      .from('analytics_events')
      .insert([
        {
          user_id: userId,
          event_type: eventType,
          event_data: data,
          app_version: appVersion,
          device_type: deviceType
        }
      ]);

    if (error) throw error;

    return { success: true, error: null };
  } catch (err) {
    console.error('Log analytics error:', err.message);
    return { success: false, error: err.message };
  }
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  supabase,
  // Auth
  registerUser,
  loginUser,
  verifyToken,
  generateToken,
  // Progression
  addUserStars,
  getUserProgression,
  // Matches
  logMatch,
  // Leaderboard
  getMonthlyLeaderboard,
  resetMonthlyProgression,
  // Users
  getUser,
  updateUserVersion,
  // Analytics
  logAnalyticsEvent
};
