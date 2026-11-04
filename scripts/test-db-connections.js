// Safe verification script: Tests connection to all 3 independent MongoDB databases
// CRITICAL SECURITY: Does not print or reveal any URI, password, or host.

const path = require('path');
let mongoose;
try {
  mongoose = require('mongoose');
} catch {
  try {
    mongoose = require('../services/auth-service/node_modules/mongoose');
  } catch {
    mongoose = require('../services/transaction-service/node_modules/mongoose');
  }
}

// Auth Service Config
const authConfig = require('../services/auth-service/src/config/env');
// Transaction Service Config
const transConfig = require('../services/transaction-service/src/config/env');
// Notification Service Config
const notifConfig = require('../services/notification-service/src/config/env');

async function testAll() {
  console.log('Testing independent service database connections...\n');

  // 1. Auth Service
  const authConn = await mongoose.createConnection(authConfig.mongoUri, {
    dbName: authConfig.dbName,
    serverSelectionTimeoutMS: 8000
  }).asPromise();
  const authDbName = authConn.db.databaseName;
  const authUserCount = await authConn.collection('users').countDocuments();
  console.log(`[AUTH SERVICE]`);
  console.log(`- Configured: ${Boolean(authConfig.mongoUri)}`);
  console.log(`- Target DB Name: ${authConfig.dbName}`);
  console.log(`- Connected DB Name: ${authDbName}`);
  console.log(`- Connection Status: CONNECTED (Users count: ${authUserCount})`);
  await authConn.close();

  // 2. Transaction Service
  const transConn = await mongoose.createConnection(transConfig.mongoUri, {
    dbName: transConfig.dbName,
    serverSelectionTimeoutMS: 8000
  }).asPromise();
  const transDbName = transConn.db.databaseName;
  const txCount = await transConn.collection('transactions').countDocuments();
  console.log(`\n[TRANSACTION SERVICE]`);
  console.log(`- Configured: ${Boolean(transConfig.mongoUri)}`);
  console.log(`- Target DB Name: ${transConfig.dbName}`);
  console.log(`- Connected DB Name: ${transDbName}`);
  console.log(`- Connection Status: CONNECTED (Transactions count: ${txCount})`);
  await transConn.close();

  // 3. Notification Service
  const notifConn = await mongoose.createConnection(notifConfig.mongoUri, {
    dbName: notifConfig.dbName,
    serverSelectionTimeoutMS: 8000
  }).asPromise();
  const notifDbName = notifConn.db.databaseName;
  const notifCount = await notifConn.collection('notifications').countDocuments();
  const threshCount = await notifConn.collection('thresholds').countDocuments();
  console.log(`\n[NOTIFICATION SERVICE]`);
  console.log(`- Configured: ${Boolean(notifConfig.mongoUri)}`);
  console.log(`- Target DB Name: ${notifConfig.dbName}`);
  console.log(`- Connected DB Name: ${notifDbName}`);
  console.log(`- Connection Status: CONNECTED (Notifications count: ${notifCount}, Thresholds: ${threshCount})`);
  await notifConn.close();

  console.log('\nAll 3 independent database connections verified successfully!');
}

testAll().catch(err => {
  console.error('Connection test failed:', err.name, err.message ? err.message.replace(/mongodb(\+srv)?:\/\/[^@]+@/i, 'mongodb$1://****:****@') : '');
  process.exit(1);
});
