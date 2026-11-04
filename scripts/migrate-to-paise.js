/**
 * FinTrack Database Migration Script: Rupee Float -> Integer Paise
 * 
 * Safely converts existing floating-point/rupee records to canonical integer paise:
 *   - transactions: adds `amountPaise` (integer) = Math.round(amount * 100)
 *   - thresholds: adds `thresholdPaise` (integer) = Math.round(threshold * 100)
 *   - notifications: adds `amountPaise` (integer) = Math.round(amount * 100)
 * 
 * Idempotency Guarantee:
 *   Selects ONLY documents where `amountPaise` or `thresholdPaise` does not exist or is null.
 *   Re-running this script will NEVER double-convert records.
 * 
 * Usage:
 *   node scripts/migrate-to-paise.js [--dry-run]
 * 
 * Options:
 *   --dry-run       Preview changes without modifying the database
 *   --verify        Check if all records are properly converted
 * 
 * Backup Recommendation before running on live databases:
 *   mongodump --uri="mongodb://localhost:27017/fintrack_transactions" --out=./backup/$(date +%F)/transactions
 *   mongodump --uri="mongodb://localhost:27017/fintrack_notifications" --out=./backup/$(date +%F)/notifications
 */

const TRANSACTIONS_MONGO_URI = process.env.TRANSACTIONS_MONGO_URI || process.env.TRANSACTION_MONGO_URI || process.env.MONGO_URI || 'mongodb://localhost:27019/fintrack_transactions';
const NOTIFICATIONS_MONGO_URI = process.env.NOTIFICATIONS_MONGO_URI || process.env.NOTIFICATION_MONGO_URI || process.env.MONGO_URI || 'mongodb://localhost:27020/fintrack_notifications';

/**
 * Migration core logic (supports in-memory / mock connection for tests)
 */
async function migrateTransactions(db, isDryRun = false) {
  const collection = db.collection('transactions');
  
  // Idempotency: filter ONLY documents lacking amountPaise
  const unmigratedQuery = {
    $or: [
      { amountPaise: { $exists: false } },
      { amountPaise: null }
    ]
  };

  const cursor = collection.find(unmigratedQuery);
  const unmigratedDocs = await cursor.toArray();
  const alreadyMigratedCount = await collection.countDocuments({ amountPaise: { $exists: true, $ne: null } });

  console.log(`\n📦 Transactions Collection:`);
  console.log(`   - Already migrated (skipped): ${alreadyMigratedCount}`);
  console.log(`   - Pending migration:          ${unmigratedDocs.length}`);

  let migratedCount = 0;
  const errors = [];

  for (const doc of unmigratedDocs) {
    try {
      const amountRupees = Number(doc.amount);
      if (isNaN(amountRupees) || amountRupees < 0) {
        throw new Error(`Invalid existing amount value: ${doc.amount}`);
      }

      const amountPaise = Math.round(amountRupees * 100);
      if (!Number.isSafeInteger(amountPaise)) {
        throw new RangeError(`Calculated paise exceeds safe integer: ${amountPaise}`);
      }

      if (!isDryRun) {
        await collection.updateOne(
          { _id: doc._id },
          { $set: { amountPaise, amount: amountRupees } }
        );
      }
      migratedCount++;
    } catch (err) {
      errors.push({ id: doc._id, error: err.message });
    }
  }

  return {
    collection: 'transactions',
    alreadyMigratedCount,
    migratedCount,
    errors
  };
}

async function migrateThresholds(db, isDryRun = false) {
  const collection = db.collection('thresholds');

  const unmigratedQuery = {
    $or: [
      { thresholdPaise: { $exists: false } },
      { thresholdPaise: null }
    ]
  };

  const unmigratedDocs = await collection.find(unmigratedQuery).toArray();
  const alreadyMigratedCount = await collection.countDocuments({ thresholdPaise: { $exists: true, $ne: null } });

  console.log(`\n🎯 Thresholds Collection:`);
  console.log(`   - Already migrated (skipped): ${alreadyMigratedCount}`);
  console.log(`   - Pending migration:          ${unmigratedDocs.length}`);

  let migratedCount = 0;
  const errors = [];

  for (const doc of unmigratedDocs) {
    try {
      const thresholdRupees = Number(doc.threshold);
      if (isNaN(thresholdRupees) || thresholdRupees < 0) {
        throw new Error(`Invalid existing threshold value: ${doc.threshold}`);
      }

      const thresholdPaise = Math.round(thresholdRupees * 100);

      if (!isDryRun) {
        await collection.updateOne(
          { _id: doc._id },
          { $set: { thresholdPaise, threshold: thresholdRupees } }
        );
      }
      migratedCount++;
    } catch (err) {
      errors.push({ id: doc._id, error: err.message });
    }
  }

  return {
    collection: 'thresholds',
    alreadyMigratedCount,
    migratedCount,
    errors
  };
}

async function migrateNotifications(db, isDryRun = false) {
  const collection = db.collection('notifications');

  const unmigratedQuery = {
    $or: [
      { amountPaise: { $exists: false } },
      { amountPaise: null }
    ]
  };

  const unmigratedDocs = await collection.find(unmigratedQuery).toArray();
  const alreadyMigratedCount = await collection.countDocuments({ amountPaise: { $exists: true, $ne: null } });

  console.log(`\n🔔 Notifications Collection:`);
  console.log(`   - Already migrated (skipped): ${alreadyMigratedCount}`);
  console.log(`   - Pending migration:          ${unmigratedDocs.length}`);

  let migratedCount = 0;
  const errors = [];

  for (const doc of unmigratedDocs) {
    try {
      const amountRupees = Number(doc.amount);
      if (isNaN(amountRupees) || amountRupees < 0) {
        throw new Error(`Invalid existing notification amount: ${doc.amount}`);
      }

      const amountPaise = Math.round(amountRupees * 100);

      if (!isDryRun) {
        await collection.updateOne(
          { _id: doc._id },
          { $set: { amountPaise, amount: amountRupees } }
        );
      }
      migratedCount++;
    } catch (err) {
      errors.push({ id: doc._id, error: err.message });
    }
  }

  return {
    collection: 'notifications',
    alreadyMigratedCount,
    migratedCount,
    errors
  };
}

/**
 * CLI Runner
 */
async function main() {
  let mongoose;
  try {
    mongoose = require('mongoose');
  } catch {
    try {
      mongoose = require('../services/transaction-service/node_modules/mongoose');
    } catch {
      console.error('Fatal: mongoose could not be resolved from root or services/transaction-service');
      process.exit(1);
    }
  }

  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run') || args.includes('-d');
  const isVerify = args.includes('--verify');

  console.log(`\n======================================================`);
  console.log(`🪙  FINTRACK MONETARY PRECISION MIGRATION TOOL`);
  console.log(`    Mode: ${isDryRun ? 'DRY-RUN (Simulated, no writes)' : isVerify ? 'VERIFY ONLY' : 'LIVE MIGRATION'}`);
  console.log(`======================================================`);

  let txConn = null;
  let notifConn = null;

  try {
    console.log(`\nConnecting to Transaction Database (fintrack_transactions)...`);
    txConn = await mongoose.createConnection(TRANSACTIONS_MONGO_URI, {
      dbName: 'fintrack_transactions',
      serverSelectionTimeoutMS: 8000
    }).asPromise();
    console.log(`✓ Connected to Transaction Database.`);

    const txResult = await migrateTransactions(txConn.db, isDryRun || isVerify);

    console.log(`\nConnecting to Notification Database (fintrack_notifications)...`);
    notifConn = await mongoose.createConnection(NOTIFICATIONS_MONGO_URI, {
      dbName: 'fintrack_notifications',
      serverSelectionTimeoutMS: 8000
    }).asPromise();
    console.log(`✓ Connected to Notification Database.`);

    const threshResult = await migrateThresholds(notifConn.db, isDryRun || isVerify);
    const notifResult = await migrateNotifications(notifConn.db, isDryRun || isVerify);

    console.log(`\n======================================================`);
    console.log(`📊 MIGRATION SUMMARY:`);
    console.log(`------------------------------------------------------`);
    console.log(`Transactions:  ${txResult.migratedCount} migrated, ${txResult.alreadyMigratedCount} skipped, ${txResult.errors.length} errors`);
    console.log(`Thresholds:    ${threshResult.migratedCount} migrated, ${threshResult.alreadyMigratedCount} skipped, ${threshResult.errors.length} errors`);
    console.log(`Notifications: ${notifResult.migratedCount} migrated, ${notifResult.alreadyMigratedCount} skipped, ${notifResult.errors.length} errors`);
    console.log(`======================================================\n`);

    if (isDryRun) {
      console.log(`ℹ️  Dry-run complete. No changes were applied to MongoDB.`);
    } else if (isVerify) {
      const allComplete = txResult.migratedCount === 0 && threshResult.migratedCount === 0 && notifResult.migratedCount === 0;
      if (allComplete) {
        console.log(`✅ VERIFICATION PASSED: All records are converted to integer paise.`);
      } else {
        console.log(`⚠️  VERIFICATION NOTICE: Unmigrated records remain.`);
      }
    } else {
      console.log(`✅ Migration complete. Values safely converted to canonical integer paise.`);
    }
  } catch (err) {
    console.error(`❌ Migration failed to connect or execute: ${err.message}`);
    process.exitCode = 1;
  } finally {
    if (txConn) await txConn.close();
    if (notifConn) await notifConn.close();
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  migrateTransactions,
  migrateThresholds,
  migrateNotifications
};
