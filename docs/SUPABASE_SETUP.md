# Supabase Setup Guide for Burst Line Online

## Step 1: Create Supabase Account

1. Go to https://supabase.com
2. Sign up with your email
3. Create a new project:
   - Name: `burst-line-online`
   - Password: Create a strong password (save this!)
   - Region: Europe (Frankfurt or London recommended for EU latency)
4. Wait for project to initialize (~2 minutes)

## Step 2: Get Your API Keys

1. In Supabase dashboard, go to **Settings → API**
2. Copy these values and save them:
   - `SUPABASE_URL`: Your project URL
   - `SUPABASE_ANON_KEY`: Anon key (public, safe for client)
   - `SUPABASE_SERVICE_KEY`: Service key (private, for server only)

## Step 3: Create Database Tables

1. Go to **SQL Editor**
2. Click **New Query**
3. Paste the entire contents of `database-schema.sql` (provided separately)
4. Click **Run**
5. Verify all tables are created in the **Tables** section

## Step 4: Set Up Row-Level Security (RLS)

For production security, enable RLS policies:
1. Go to **Authentication → Policies**
2. For `users` table:
   - Users can read own row
   - Users can update own row
3. For `user_progression` table:
   - Users can read/write own rows
4. For `matches` table:
   - Users can read own matches
   - Service role can write (server inserts matches)

## Step 5: Environment Variables

Create `.env` file in your project root:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_KEY=your-service-key-here
JWT_SECRET=your-jwt-secret-here
NODE_ENV=production
PORT=3000
```

## Step 6: Install Node Dependencies

```bash
npm install @supabase/supabase-js
npm install jsonwebtoken
npm install bcryptjs
npm install dotenv
```

## Testing Connection

Run: `node test-supabase.js` to verify connection works.

---

## Troubleshooting

- **Connection refused**: Check SUPABASE_URL is correct
- **Auth failed**: Verify API keys match your project
- **Table not found**: Run SQL schema again, check table names match exactly
- **RLS blocking**: Disable RLS temporarily during development (can enable later)

---

## Next Steps

Once tables are created, proceed to:
1. Update `server.js` with Supabase integration
2. Implement authentication endpoints
3. Add progression tracking
4. Build React Native app
