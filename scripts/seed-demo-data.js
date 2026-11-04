/**
 * FinTrack Demo Data Seeder
 * Seeds demo user and transactions spread across October and November 2026.
 * 
 * Features:
 *   - Idempotent: checks for existing transactions before inserting, preventing duplicates on rerun.
 *   - Configures default alert threshold to ₹10,000 (1,000,000 paise).
 *   - Uses canonical INR decimal amounts that map to integer paise in storage.
 *
 * Usage:
 *   node scripts/seed-demo-data.js [gateway_url]
 * Default gateway_url: http://localhost:8000/api
 */

const GATEWAY_URL = process.argv[2] || process.env.VITE_API_GATEWAY_URL || 'http://localhost:8000/api';

const DEMO_USER = {
  name: 'Demo User',
  email: 'demo@fintrack.app',
  password: 'Demo@1234'
};

const SAMPLE_TRANSACTIONS = [
  // October 2026 Incomes
  { amount: 85000, type: 'income', category: 'Salary', date: '2026-10-01T09:00:00.000Z', note: 'Monthly Salary - Tech Corp' },
  { amount: 25000, type: 'income', category: 'Freelance / Consulting', date: '2026-10-15T14:30:00.000Z', note: 'Web App Consultation Project' },
  { amount: 5000, type: 'income', category: 'Investments / Dividends', date: '2026-10-20T11:00:00.000Z', note: 'Quarterly Mutual Fund Dividend' },

  // October 2026 Expenses
  { amount: 22000, type: 'expense', category: 'Rent & Housing', date: '2026-10-02T10:00:00.000Z', note: 'Apartment Monthly Rent (Crosses threshold)' },
  { amount: 8400, type: 'expense', category: 'Food & Dining', date: '2026-10-05T19:30:00.000Z', note: 'Groceries and weekly dinners' },
  { amount: 3500, type: 'expense', category: 'Utilities & Bills', date: '2026-10-08T12:00:00.000Z', note: 'Electricity and fiber internet bill' },
  { amount: 14500, type: 'expense', category: 'Shopping', date: '2026-10-12T16:45:00.000Z', note: 'Winter wardrobe and shoes (Crosses threshold)' },
  { amount: 2200, type: 'expense', category: 'Entertainment', date: '2026-10-18T20:15:00.000Z', note: 'Cinema tickets and OTT subscription' },
  { amount: 4800, type: 'expense', category: 'Transportation', date: '2026-10-22T08:30:00.000Z', note: 'Fuel and metro passes' },
  { amount: 16000, type: 'expense', category: 'Travel', date: '2026-10-28T07:00:00.000Z', note: 'Weekend resort getaway (Crosses threshold)' },

  // November 2026 Incomes
  { amount: 85000, type: 'income', category: 'Salary', date: '2026-11-01T09:00:00.000Z', note: 'Monthly Salary - Tech Corp' },
  { amount: 30000, type: 'income', category: 'Freelance / Consulting', date: '2026-11-03T16:00:00.000Z', note: 'Mobile UI redesign sprint' },

  // November 2026 Expenses
  { amount: 22000, type: 'expense', category: 'Rent & Housing', date: '2026-11-02T10:00:00.000Z', note: 'Apartment Monthly Rent (Crosses threshold)' },
  { amount: 9200, type: 'expense', category: 'Food & Dining', date: '2026-11-03T20:00:00.000Z', note: 'Organic supermarket groceries' },
  { amount: 3600, type: 'expense', category: 'Utilities & Bills', date: '2026-11-04T11:00:00.000Z', note: 'High-speed broadband and mobile post-paid' },
  { amount: 48000, type: 'expense', category: 'Shopping', date: '2026-11-04T15:30:00.000Z', note: 'New 4K Monitor and ergonomic chair (Crosses threshold)' }
];

async function seed() {
  console.log(`\n==============================================`);
  console.log(`🌱 FINTRACK DEMO DATA SEEDER`);
  console.log(`Connecting to Gateway: ${GATEWAY_URL}`);
  console.log(`==============================================\n`);

  try {
    // 1. Attempt login or register demo account
    console.log(`1. Authenticating Demo User (${DEMO_USER.email})...`);
    let accessToken = null;

    const loginRes = await fetch(`${GATEWAY_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: DEMO_USER.email, password: DEMO_USER.password })
    });

    const loginData = await loginRes.json();
    if (loginRes.ok && loginData.success) {
      accessToken = loginData.data.accessToken;
      console.log(`   ✓ Demo user already exists. Logged in successfully.`);
    } else {
      console.log(`   - Account not found. Registering new demo account...`);
      const regRes = await fetch(`${GATEWAY_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(DEMO_USER)
      });
      const regData = await regRes.json();
      if (!regRes.ok || !regData.success) {
        throw new Error(`Registration failed: ${regData.error?.message || regRes.statusText}`);
      }
      accessToken = regData.data.accessToken;
      console.log(`   ✓ Demo user registered successfully.`);
    }

    // 2. Set default alert threshold to 10,000 INR
    console.log(`\n2. Configuring Alert Threshold (₹10,000)...`);
    const threshRes = await fetch(`${GATEWAY_URL}/settings/threshold`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({ threshold: 10000 })
    });
    const threshData = await threshRes.json();
    if (threshRes.ok) {
      console.log(`   ✓ Threshold set to ₹${threshData.data?.threshold}`);
    }

    // 3. Fetch existing user transactions to enforce idempotency
    console.log(`\n3. Checking existing transactions to avoid duplicates...`);
    const existingRes = await fetch(`${GATEWAY_URL}/transactions?limit=100`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    const existingData = await existingRes.json();
    const existingList = (existingData.success && existingData.data?.transactions) || [];
    console.log(`   Found ${existingList.length} existing transactions in account.`);

    // 4. Insert sample transactions (skipping duplicates)
    console.log(`\n4. Seeding Transactions across Oct & Nov 2026...`);
    let createdCount = 0;
    let skippedCount = 0;

    for (const tx of SAMPLE_TRANSACTIONS) {
      const symbol = tx.type === 'income' ? '+' : '-';
      const alreadyExists = existingList.some(e => {
        const sameType = e.type === tx.type;
        const sameAmount = Math.abs(Number(e.amount) - Number(tx.amount)) < 0.001;
        const sameCategory = e.category === tx.category;
        const sameDate = e.date && e.date.substring(0, 10) === tx.date.substring(0, 10);
        return sameType && sameAmount && sameCategory && sameDate;
      });

      if (alreadyExists) {
        skippedCount++;
        console.log(`   - [${tx.date.substring(0, 10)}] ${symbol}₹${tx.amount.toLocaleString('en-IN')} (${tx.category}) already exists (skipped)`);
        continue;
      }

      const res = await fetch(`${GATEWAY_URL}/transactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify(tx)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        createdCount++;
        console.log(`   ✓ [${tx.date.substring(0, 10)}] ${symbol}₹${tx.amount.toLocaleString('en-IN')} (${tx.category}) - ${tx.note}`);
      } else {
        console.warn(`   ✗ Failed to create transaction:`, data.error?.message);
      }
    }

    console.log(`\n==============================================`);
    console.log(`🎉 Demo Seeding Completed Successfully!`);
    console.log(`   Transactions created: ${createdCount}`);
    console.log(`   Transactions skipped: ${skippedCount} (idempotent)`);
    console.log(`   Demo Email:    ${DEMO_USER.email}`);
    console.log(`   Demo Password: ${DEMO_USER.password}`);
    console.log(`   Threshold:     ₹10,000`);
    console.log(`==============================================\n`);
  } catch (err) {
    console.error(`\n❌ Seeding failed:`, err.message);
    console.log(`Note: Make sure API Gateway is running on ${GATEWAY_URL} before executing the seed script.\n`);
    process.exit(1);
  }
}

seed();
