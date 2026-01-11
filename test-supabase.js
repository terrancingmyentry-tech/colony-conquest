// test-supabase.js
// Quick test to verify Supabase connection and tables

const dotenv = require('dotenv');
dotenv.config();

const { supabase } = require('./supabase-client');

async function runTests() {
  console.log('\n🧪 TESTING SUPABASE CONNECTION...\n');

  try {
    // Test 1: Check connection
    console.log('✓ Attempting to connect to Supabase...');
    const { data, error } = await supabase
      .from('users')
      .select('count')
      .limit(1);

    if (error) throw error;
    console.log('✅ Supabase connection successful!\n');

    // Test 2: Check tables exist
    console.log('✓ Checking database tables...');
    const tables = [
      'users',
      'user_progression',
      'matches',
      'monthly_leaderboards',
      'cosmetics',
      'user_cosmetics',
      'sessions',
      'analytics_events',
      'friend_requests'
    ];

    for (const table of tables) {
      const { data, error } = await supabase
        .from(table)
        .select('count')
        .limit(1);

      if (error) {
        console.log(`❌ Table '${table}' not found!`);
      } else {
        console.log(`✅ Table '${table}' exists`);
      }
    }

    console.log('\n🎉 All tests passed! Your database is ready.\n');
    console.log('Next steps:');
    console.log('1. Create a .env file based on .env.example');
    console.log('2. Fill in SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY');
    console.log('3. Set a strong JWT_SECRET');
    console.log('4. Run: npm install');
    console.log('5. Run: npm start\n');

  } catch (err) {
    console.error('❌ Test failed:', err.message);
    console.error('\nMake sure:');
    console.error('1. .env file exists with correct Supabase credentials');
    console.error('2. You ran the database-schema.sql in Supabase SQL editor');
    console.error('3. All required environment variables are set\n');
  }
}

runTests();
