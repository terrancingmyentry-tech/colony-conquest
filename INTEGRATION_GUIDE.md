# Burst Line Online - Full Integration Guide

## Phase 1: Database Setup ✅

### Step 1: Create Supabase Project
1. Go to https://supabase.com
2. Sign up and create new project `burst-line-online`
3. Choose Europe region (Frankfurt or London)
4. Wait for initialization

### Step 2: Run Database Schema
1. In Supabase dashboard, go to **SQL Editor**
2. Click **New Query**
3. Copy entire contents of `database-schema.sql`
4. Paste and click **Run**
5. All tables should now be created

### Step 3: Get API Keys
1. Go to **Settings → API**
2. Copy:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_KEY`

### Step 4: Set Up Environment
1. Copy `.env.example` to `.env`
2. Fill in:
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=eyJ...
   SUPABASE_SERVICE_KEY=eyJ...
   JWT_SECRET=your-super-secret-key-min-32-chars
   ```

### Step 5: Install Dependencies
```bash
npm install
```

### Step 6: Test Connection
```bash
npm test
```

If all tests pass ✅, proceed to Phase 2.

---

## Phase 2: Server Integration (In Progress)

The following files have been created:

### Files Created:
- ✅ `database-schema.sql` - Database structure
- ✅ `supabase-client.js` - Supabase integration module
- ✅ `package.json` - Dependencies
- ✅ `.env.example` - Environment template
- ✅ `test-supabase.js` - Connection test

### Files to Update:
- ⏳ `server.js` - Add authentication endpoints, match logging, progression tracking
- ⏳ `public/game-client.js` - Add login/register UI, token handling
- ⏳ `public/index.html` - Add auth screens, version display

---

## API Endpoints (To Be Implemented)

### Authentication
```
POST /api/auth/register
  Body: { email, username, password }
  Returns: { user, token }

POST /api/auth/login
  Body: { email, password }
  Returns: { user, token }

POST /api/auth/verify
  Headers: { Authorization: Bearer <token> }
  Returns: { user }
```

### Game Data
```
POST /api/match/log
  Body: { matchData }
  Returns: { success }

GET /api/progression/:userId
  Returns: { progression }

GET /api/leaderboard/monthly
  Returns: { leaderboard }

POST /api/user/version/upgrade
  Body: { userId, version }
  Returns: { success }
```

---

## Next Tasks (In Order)

### Task 1: Update server.js
- Import supabase-client
- Add REST endpoints for auth
- Add match logging endpoint
- Add leaderboard endpoint
- Version-gating for premium features

### Task 2: Update game-client.js
- Remove guest login (require account)
- Add login/register forms
- Token-based authentication
- Version detection (free vs premium)
- Match end → send stats to server

### Task 3: Update index.html
- Add login/register screens
- Version badge display
- Hide premium features for free users

### Task 4: Bot Personality System
- Extend AI with 5 personality types
- Random selection on bot spawn

### Task 5: React Native Migration
- Create React Native project
- Port authentication screens
- Port game canvas
- Add offline support
- Add in-app purchases

---

## Testing Checklist

After completing Phase 2, test:

- [ ] Register new user
- [ ] Login with existing user
- [ ] Invalid credentials rejected
- [ ] Match end → stars awarded
- [ ] Leaderboard updates
- [ ] Monthly reset works
- [ ] Free version only sees training bots
- [ ] Premium version sees all bots
- [ ] Cross-play works (free + premium together)

---

## Important Notes

1. **JWT_SECRET** - Must be minimum 32 characters, same across all instances
2. **Service Key** - Never expose in client code (server only)
3. **Anon Key** - Safe for client (use in React Native)
4. **Rate Limiting** - Consider adding for production
5. **Backups** - Supabase auto-backs up data

---

## Troubleshooting

### "Table not found" error
- Run database-schema.sql again
- Check table names match exactly

### "Invalid API key" error
- Verify SUPABASE_SERVICE_KEY (not anon key)
- Check URL format: `https://xxx.supabase.co`

### "Connection refused"
- Supabase project might be paused
- Check dashboard → settings → pause

### "JWT verification failed"
- JWT_SECRET mismatch
- Token might be expired

---

## Support Resources

- Supabase Docs: https://supabase.com/docs
- Socket.io Guide: https://socket.io/docs/v4/socket-io-client-api/
- React Native: https://reactnative.dev/

---

Continue to next phase when ready! 🚀
