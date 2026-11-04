const {
  migrateTransactions,
  migrateThresholds,
  migrateNotifications
} = require('../../../scripts/migrate-to-paise');

describe('Database Migration Tests: Rupee Float -> Integer Paise (Phase B4)', () => {
  function createMockDb(initialDocs = []) {
    let docs = JSON.parse(JSON.stringify(initialDocs));

    return {
      docs,
      collection: (name) => ({
        find: (query = {}) => ({
          toArray: async () => {
            return docs.filter(doc => {
              if (query.$or) {
                return query.$or.some(cond => {
                  if (cond.amountPaise) {
                    if (cond.amountPaise.$exists === false) return doc.amountPaise === undefined;
                    if (cond.amountPaise === null) return doc.amountPaise === null;
                  }
                  if (cond.thresholdPaise) {
                    if (cond.thresholdPaise.$exists === false) return doc.thresholdPaise === undefined;
                    if (cond.thresholdPaise === null) return doc.thresholdPaise === null;
                  }
                  return false;
                });
              }
              return true;
            });
          }
        }),
        countDocuments: async (query = {}) => {
          return docs.filter(doc => {
            if (query.amountPaise && query.amountPaise.$exists && query.amountPaise.$ne === null) {
              return doc.amountPaise !== undefined && doc.amountPaise !== null;
            }
            if (query.thresholdPaise && query.thresholdPaise.$exists && query.thresholdPaise.$ne === null) {
              return doc.thresholdPaise !== undefined && doc.thresholdPaise !== null;
            }
            return true;
          }).length;
        },
        updateOne: async (filter, update) => {
          const doc = docs.find(d => d._id === filter._id);
          if (doc && update.$set) {
            Object.assign(doc, update.$set);
          }
          return { modifiedCount: doc ? 1 : 0 };
        }
      })
    };
  }

  describe('Transactions Collection Migration', () => {
    let mockDb;

    beforeEach(() => {
      mockDb = createMockDb([
        { _id: 'tx_1', amount: 1.00 },
        { _id: 'tx_2', amount: 10.50 },
        { _id: 'tx_3', amount: 100.75 },
        { _id: 'tx_4', amount: 1250.75 },
        { _id: 'tx_already_migrated', amount: 8400, amountPaise: 840000 }
      ]);
    });

    it('Scenario 15: Migration preserves existing transaction values and adds exact amountPaise', async () => {
      const res = await migrateTransactions(mockDb, false);

      expect(res.alreadyMigratedCount).toBe(1);
      expect(res.migratedCount).toBe(4);
      expect(res.errors.length).toBe(0);

      const tx1 = mockDb.docs.find(d => d._id === 'tx_1');
      const tx2 = mockDb.docs.find(d => d._id === 'tx_2');
      const tx3 = mockDb.docs.find(d => d._id === 'tx_3');
      const tx4 = mockDb.docs.find(d => d._id === 'tx_4');

      expect(tx1.amountPaise).toBe(100);
      expect(tx1.amount).toBe(1);

      expect(tx2.amountPaise).toBe(1050);
      expect(tx2.amount).toBe(10.5);

      expect(tx3.amountPaise).toBe(10075);
      expect(tx3.amount).toBe(100.75);

      expect(tx4.amountPaise).toBe(125075);
      expect(tx4.amount).toBe(1250.75);
    });

    it('Scenario 16: Re-running migration is idempotent and does NOT double-convert records', async () => {
      // First run: converts the 4 unmigrated records
      await migrateTransactions(mockDb, false);

      // Second run: everything is already migrated
      const secondRun = await migrateTransactions(mockDb, false);

      expect(secondRun.migratedCount).toBe(0);
      expect(secondRun.alreadyMigratedCount).toBe(5);
      expect(secondRun.errors.length).toBe(0);

      // Verify that values did NOT multiply by 100 again
      const tx4 = mockDb.docs.find(d => d._id === 'tx_4');
      expect(tx4.amountPaise).toBe(125075); // NOT 12507500!
      expect(tx4.amount).toBe(1250.75);
    });

    it('Dry-run mode previews migration without mutating records', async () => {
      const res = await migrateTransactions(mockDb, true);

      expect(res.migratedCount).toBe(4);
      // In dry-run, documents in mockDb should remain untouched
      const tx4 = mockDb.docs.find(d => d._id === 'tx_4');
      expect(tx4.amountPaise).toBeUndefined();
    });
  });

  describe('Thresholds & Notifications Collection Migration', () => {
    it('Migrates thresholds collection safely and idempotently', async () => {
      const mockThresholdDb = createMockDb([
        { _id: 'th_1', threshold: 10000 },
        { _id: 'th_2', threshold: 25000, thresholdPaise: 2500000 }
      ]);

      const firstRun = await migrateThresholds(mockThresholdDb, false);
      expect(firstRun.migratedCount).toBe(1);
      expect(firstRun.alreadyMigratedCount).toBe(1);

      const th1 = mockThresholdDb.docs.find(d => d._id === 'th_1');
      expect(th1.thresholdPaise).toBe(1000000);
      expect(th1.threshold).toBe(10000);

      // Second run (idempotent)
      const secondRun = await migrateThresholds(mockThresholdDb, false);
      expect(secondRun.migratedCount).toBe(0);
      expect(secondRun.alreadyMigratedCount).toBe(2);
      expect(th1.thresholdPaise).toBe(1000000);
    });

    it('Migrates notifications collection safely and idempotently', async () => {
      const mockNotifDb = createMockDb([
        { _id: 'nt_1', amount: 15000 },
        { _id: 'nt_2', amount: 20000, amountPaise: 2000000 }
      ]);

      const firstRun = await migrateNotifications(mockNotifDb, false);
      expect(firstRun.migratedCount).toBe(1);
      expect(firstRun.alreadyMigratedCount).toBe(1);

      const nt1 = mockNotifDb.docs.find(d => d._id === 'nt_1');
      expect(nt1.amountPaise).toBe(1500000);
      expect(nt1.amount).toBe(15000);

      // Second run (idempotent)
      const secondRun = await migrateNotifications(mockNotifDb, false);
      expect(secondRun.migratedCount).toBe(0);
      expect(secondRun.alreadyMigratedCount).toBe(2);
    });
  });
});
