const express = require('express');
const {
  createTransaction,
  getTransactions,
  getTransactionById,
  updateTransaction,
  deleteTransaction,
  getMonthlySummary,
  healthCheck
} = require('../controllers/transaction.controller');
const { validateBody, validateQuery } = require('../middlewares/validate.middleware');
const { requireUser } = require('../middlewares/user.middleware');
const { verifyInternalToken } = require('../middlewares/internalAuth.middleware');
const {
  createTransactionSchema,
  updateTransactionSchema,
  queryTransactionsSchema,
  summaryQuerySchema
} = require('../validations/transaction.validation');

const router = express.Router();

// Public health check
router.get('/health', healthCheck);

// Internal microservice routes (must be proxied via API Gateway)
router.use(verifyInternalToken);

// Protected transaction routes (requires authenticated user identity from Gateway)
router.use(requireUser);

router.get(['/summary', '/transactions/summary'], validateQuery(summaryQuerySchema), getMonthlySummary);
router.get(['/', '/transactions'], validateQuery(queryTransactionsSchema), getTransactions);
router.post(['/', '/transactions'], validateBody(createTransactionSchema), createTransaction);
router.get(['/:id', '/transactions/:id'], getTransactionById);
router.put(['/:id', '/transactions/:id'], validateBody(updateTransactionSchema), updateTransaction);
router.delete(['/:id', '/transactions/:id'], deleteTransaction);

module.exports = router;
