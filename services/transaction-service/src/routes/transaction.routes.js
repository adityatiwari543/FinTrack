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
const {
  createTransactionSchema,
  updateTransactionSchema,
  queryTransactionsSchema,
  summaryQuerySchema
} = require('../validations/transaction.validation');

const router = express.Router();

// Public health check
router.get('/health', healthCheck);

// Protected transaction routes
router.use(requireUser);

router.get('/transactions/summary', validateQuery(summaryQuerySchema), getMonthlySummary);
router.get('/transactions', validateQuery(queryTransactionsSchema), getTransactions);
router.post('/transactions', validateBody(createTransactionSchema), createTransaction);
router.get('/transactions/:id', getTransactionById);
router.put('/transactions/:id', validateBody(updateTransactionSchema), updateTransaction);
router.delete('/transactions/:id', deleteTransaction);

module.exports = router;
