const request = require('supertest');
const app = require('../src/app');
const eventPublisher = require('../src/services/eventPublisher');

describe('Transaction Service API Tests', () => {
  const internalSecret = 'test_internal_secret_32_characters';
  const user1 = 'user_672b1234567890abcdef1111';
  const user2 = 'user_672b1234567890abcdef2222';

  describe('GET /health', () => {
    it('should return service name and status ok without internal token (public health check)', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('transaction-service');
      expect(res.body.timestamp).toBeDefined();
    });
  });

  describe('Internal Gateway Authentication Check', () => {
    it('should reject direct access without x-internal-token with 403', async () => {
      const res = await request(app).get('/transactions');
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN_DIRECT_ACCESS');
    });

    it('should reject direct access with invalid x-internal-token with 403', async () => {
      const res = await request(app)
        .get('/transactions')
        .set('x-internal-token', 'wrong_token');
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_INTERNAL_TOKEN');
    });
  });

  describe('Authentication Check (User Identity)', () => {
    it('should reject request without x-user-id header with 401 when internal token is valid', async () => {
      const res = await request(app)
        .get('/transactions')
        .set('x-internal-token', internalSecret);
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('POST /transactions', () => {
    it('should successfully create an income transaction', async () => {
      const res = await request(app)
        .post('/transactions')
        .set('x-internal-token', internalSecret)
        .set('x-user-id', user1)
        .send({
          amount: 50000,
          type: 'income',
          category: 'Salary',
          date: '2026-11-01T09:00:00.000Z',
          note: 'Monthly salary'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.transaction).toBeDefined();
      expect(res.body.data.transaction.amount).toBe(50000);
      expect(res.body.data.transaction.type).toBe('income');
      expect(res.body.data.transaction.category).toBe('Salary');
      expect(res.body.data.transaction.userId).toBe(user1);
    });

    it('should successfully create an expense transaction', async () => {
      const res = await request(app)
        .post('/transactions')
        .set('x-internal-token', internalSecret)
        .set('x-user-id', user1)
        .send({
          amount: 12500,
          type: 'expense',
          category: 'Shopping',
          date: '2026-11-03T15:30:00.000Z',
          note: 'New headphones'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.transaction.amount).toBe(12500);
      expect(res.body.data.transaction.type).toBe('expense');
    });

    it('should reject invalid amount (negative or zero)', async () => {
      const res = await request(app)
        .post('/transactions')
        .set('x-internal-token', internalSecret)
        .set('x-user-id', user1)
        .send({
          amount: -100,
          type: 'expense',
          category: 'Food'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject invalid transaction type', async () => {
      const res = await request(app)
        .post('/transactions')
        .set('x-internal-token', internalSecret)
        .set('x-user-id', user1)
        .send({
          amount: 500,
          type: 'invalid_type',
          category: 'Food'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /transactions and Filters', () => {
    beforeEach(async () => {
      // Seed user1 transactions
      await request(app)
        .post('/transactions')
        .set('x-internal-token', internalSecret)
        .set('x-user-id', user1)
        .send({
          amount: 80000,
          type: 'income',
          category: 'Salary',
          date: '2026-10-15T00:00:00.000Z'
        });
      await request(app)
        .post('/transactions')
        .set('x-internal-token', internalSecret)
        .set('x-user-id', user1)
        .send({
          amount: 15000,
          type: 'expense',
          category: 'Rent',
          date: '2026-10-16T00:00:00.000Z'
        });
      await request(app)
        .post('/transactions')
        .set('x-internal-token', internalSecret)
        .set('x-user-id', user1)
        .send({
          amount: 5000,
          type: 'expense',
          category: 'Food',
          date: '2026-11-02T00:00:00.000Z'
        });

      // Seed user2 transaction (should be isolated)
      await request(app)
        .post('/transactions')
        .set('x-internal-token', internalSecret)
        .set('x-user-id', user2)
        .send({
          amount: 99999,
          type: 'income',
          category: 'Consulting',
          date: '2026-11-01T00:00:00.000Z'
        });
    });

    it('should return only transactions for authenticated user', async () => {
      const res = await request(app)
        .get('/transactions')
        .set('x-internal-token', internalSecret)
        .set('x-user-id', user1);

      expect(res.status).toBe(200);
      expect(res.body.data.transactions.length).toBe(3);
      expect(res.body.data.pagination.total).toBe(3);
    });

    it('should filter transactions by month (YYYY-MM)', async () => {
      const res = await request(app)
        .get('/transactions?month=2026-10')
        .set('x-internal-token', internalSecret)
        .set('x-user-id', user1);

      expect(res.status).toBe(200);
      expect(res.body.data.transactions.length).toBe(2);
    });

    it('should filter transactions by type', async () => {
      const res = await request(app)
        .get('/transactions?type=expense')
        .set('x-internal-token', internalSecret)
        .set('x-user-id', user1);

      expect(res.status).toBe(200);
      expect(res.body.data.transactions.length).toBe(2);
      expect(res.body.data.transactions.every(t => t.type === 'expense')).toBe(true);
    });

    it('should filter transactions by category', async () => {
      const res = await request(app)
        .get('/transactions?category=Rent')
        .set('x-internal-token', internalSecret)
        .set('x-user-id', user1);

      expect(res.status).toBe(200);
      expect(res.body.data.transactions.length).toBe(1);
      expect(res.body.data.transactions[0].category).toBe('Rent');
    });
  });

  describe('PUT /transactions/:id and DELETE /transactions/:id', () => {
    let txId;

    beforeEach(async () => {
      const res = await request(app)
        .post('/transactions')
        .set('x-internal-token', internalSecret)
        .set('x-user-id', user1)
        .send({
          amount: 2500,
          type: 'expense',
          category: 'Groceries',
          date: '2026-11-01T00:00:00.000Z',
          note: 'Supermarket'
        });
      txId = res.body.data.transaction.id;
    });

    it('should update an existing transaction', async () => {
      const res = await request(app)
        .put(`/transactions/${txId}`)
        .set('x-internal-token', internalSecret)
        .set('x-user-id', user1)
        .send({
          amount: 3200,
          note: 'Supermarket plus household supplies'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.transaction.amount).toBe(3200);
      expect(res.body.data.transaction.note).toBe('Supermarket plus household supplies');
    });

    it('should prevent another user from modifying the transaction (ownership security)', async () => {
      const res = await request(app)
        .put(`/transactions/${txId}`)
        .set('x-internal-token', internalSecret)
        .set('x-user-id', user2)
        .send({ amount: 9999 });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should delete a transaction', async () => {
      const res = await request(app)
        .delete(`/transactions/${txId}`)
        .set('x-internal-token', internalSecret)
        .set('x-user-id', user1);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const check = await request(app)
        .get(`/transactions/${txId}`)
        .set('x-internal-token', internalSecret)
        .set('x-user-id', user1);
      expect(check.status).toBe(404);
    });
  });

  describe('GET /transactions/summary', () => {
    beforeEach(async () => {
      // November transactions
      await request(app)
        .post('/transactions')
        .set('x-internal-token', internalSecret)
        .set('x-user-id', user1)
        .send({
          amount: 100000,
          type: 'income',
          category: 'Salary',
          date: '2026-11-01T00:00:00.000Z'
        });
      await request(app)
        .post('/transactions')
        .set('x-internal-token', internalSecret)
        .set('x-user-id', user1)
        .send({
          amount: 25000,
          type: 'expense',
          category: 'Rent',
          date: '2026-11-02T00:00:00.000Z'
        });
      await request(app)
        .post('/transactions')
        .set('x-internal-token', internalSecret)
        .set('x-user-id', user1)
        .send({
          amount: 5000,
          type: 'expense',
          category: 'Food',
          date: '2026-11-05T00:00:00.000Z'
        });
    });

    it('should compute monthly total income, expense, balance, and category breakdown', async () => {
      const res = await request(app)
        .get('/transactions/summary?month=2026-11')
        .set('x-internal-token', internalSecret)
        .set('x-user-id', user1);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.month).toBe('2026-11');
      expect(res.body.data.totalIncome).toBe(100000);
      expect(res.body.data.totalExpense).toBe(30000);
      expect(res.body.data.balance).toBe(70000);
      expect(res.body.data.categoryBreakdown.length).toBe(2);

      const rentCat = res.body.data.categoryBreakdown.find(c => c.category === 'Rent');
      expect(rentCat).toBeDefined();
      expect(rentCat.amount).toBe(25000);
    });
  });

  describe('RabbitMQ Publisher Reliability (Scenario 11 - Unit / Mock Tests)', () => {
    it('should create transaction successfully even if RabbitMQ publish fails (non-blocking decoupling)', async () => {
      // Mock publishExpenseCreated to fail
      const publishSpy = jest.spyOn(eventPublisher, 'publishExpenseCreated').mockResolvedValueOnce(false);

      const res = await request(app)
        .post('/transactions')
        .set('x-internal-token', internalSecret)
        .set('x-user-id', user1)
        .send({
          amount: 75000,
          type: 'expense',
          category: 'Emergency',
          date: '2026-11-04T12:00:00.000Z',
          note: 'Hospital bill'
        });

      // Transaction creation must succeed with 201 Created despite publisher failure
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.transaction.amount).toBe(75000);
      expect(publishSpy).toHaveBeenCalled();
      publishSpy.mockRestore();
    });

    it('should handle publisher exception without failing the transaction response', async () => {
      const publishSpy = jest.spyOn(eventPublisher, 'publishExpenseCreated').mockRejectedValueOnce(new Error('Broker unreachable'));

      const res = await request(app)
        .post('/transactions')
        .set('x-internal-token', internalSecret)
        .set('x-user-id', user1)
        .send({
          amount: 5000,
          type: 'expense',
          category: 'Shopping',
          date: '2026-11-04T13:00:00.000Z'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(publishSpy).toHaveBeenCalled();
      publishSpy.mockRestore();
    });

    it('should safely execute publisher scheduleReconnect without throwing', () => {
      expect(() => eventPublisher.scheduleReconnect()).not.toThrow();
    });
  });
});
