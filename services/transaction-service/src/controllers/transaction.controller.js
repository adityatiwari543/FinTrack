const mongoose = require('mongoose');
const Transaction = require('../models/transaction.model');
const eventPublisher = require('../services/eventPublisher');
const { sendSuccess, sendError } = require('../utils/response');
const { toPaise, toRupees } = require('../utils/currency');

/**
 * Helper to compute start & end Date of a month (YYYY-MM)
 */
function getMonthDateRange(monthStr) {
  let targetMonth = monthStr;
  if (!targetMonth) {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    targetMonth = `${y}-${m}`;
  }

  const [yearStr, monthNumStr] = targetMonth.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthNumStr, 10);

  const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const endDate = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));

  return { targetMonth, startDate, endDate };
}

/**
 * Create a new transaction
 */
async function createTransaction(req, res, next) {
  try {
    const { amount, type, category, date, note } = req.validatedBody;
    const userId = req.userId;

    const amountPaise = toPaise(amount);

    const transaction = new Transaction({
      userId,
      amountPaise,
      amount,
      type,
      category,
      date: date ? new Date(date) : new Date(),
      note: note || ''
    });

    await transaction.save();

    req.log?.info({ transactionId: transaction._id, type, amount, amountPaise }, 'Transaction created');

    // Asynchronously emit event to RabbitMQ on new expense
    if (type === 'expense') {
      eventPublisher.publishExpenseCreated({
        event: 'EXPENSE_CREATED',
        transactionId: transaction._id.toString(),
        userId,
        amount: transaction.amount,
        amountPaise: transaction.amountPaise,
        category: transaction.category,
        date: transaction.date.toISOString(),
        note: transaction.note,
        timestamp: new Date().toISOString()
      }).then(published => {
        if (!published) {
          req.log?.warn({ transactionId: transaction._id }, 'Expense event could not be published to broker; alert notification delayed or lost');
        }
      }).catch(err => {
        req.log?.error({ err: err.message, transactionId: transaction._id }, 'Background publish error');
      });
    }

    return sendSuccess(res, { transaction: transaction.toJSON() }, 201);
  } catch (err) {
    next(err);
  }
}

/**
 * Get paginated & filtered transactions for authenticated user
 */
async function getTransactions(req, res, next) {
  try {
    const userId = req.userId;
    const { month, type, category, page = 1, limit = 10 } = req.validatedQuery;

    const filter = { userId };

    if (type) {
      filter.type = type;
    }

    if (category) {
      filter.category = new RegExp(`^${category}$`, 'i');
    }

    if (month) {
      const { startDate, endDate } = getMonthDateRange(month);
      filter.date = { $gte: startDate, $lt: endDate };
    }

    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      Transaction.find(filter)
        .sort({ date: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Transaction.countDocuments(filter)
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return sendSuccess(res, {
      transactions: transactions.map(t => t.toJSON()),
      pagination: {
        total,
        page,
        limit,
        totalPages
      }
    }, 200);
  } catch (err) {
    next(err);
  }
}

/**
 * Get transaction by ID (ownership verified)
 */
async function getTransactionById(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.userId;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendError(res, 'Invalid transaction ID format', 400, null, 'INVALID_ID');
    }

    const transaction = await Transaction.findOne({ _id: id, userId });
    if (!transaction) {
      return sendError(res, 'Transaction not found', 404, null, 'NOT_FOUND');
    }

    return sendSuccess(res, { transaction: transaction.toJSON() }, 200);
  } catch (err) {
    next(err);
  }
}

/**
 * Update transaction (ownership verified)
 */
async function updateTransaction(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.userId;
    const updates = req.validatedBody;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendError(res, 'Invalid transaction ID format', 400, null, 'INVALID_ID');
    }

    const transaction = await Transaction.findOne({ _id: id, userId });
    if (!transaction) {
      return sendError(res, 'Transaction not found', 404, null, 'NOT_FOUND');
    }

    if (updates.amount !== undefined) {
      transaction.amount = updates.amount;
      transaction.amountPaise = toPaise(updates.amount);
    }
    if (updates.type !== undefined) transaction.type = updates.type;
    if (updates.category !== undefined) transaction.category = updates.category;
    if (updates.date !== undefined) transaction.date = new Date(updates.date);
    if (updates.note !== undefined) transaction.note = updates.note;

    await transaction.save();

    req.log?.info({ transactionId: transaction._id }, 'Transaction updated');

    return sendSuccess(res, { transaction: transaction.toJSON() }, 200);
  } catch (err) {
    next(err);
  }
}

/**
 * Delete transaction (ownership verified)
 */
async function deleteTransaction(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.userId;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendError(res, 'Invalid transaction ID format', 400, null, 'INVALID_ID');
    }

    const result = await Transaction.findOneAndDelete({ _id: id, userId });
    if (!result) {
      return sendError(res, 'Transaction not found', 404, null, 'NOT_FOUND');
    }

    req.log?.info({ transactionId: id }, 'Transaction deleted');

    return sendSuccess(res, { message: 'Transaction deleted successfully', id }, 200);
  } catch (err) {
    next(err);
  }
}

/**
 * Get monthly summary & category breakdown for chosen month (default: current month)
 * Computed in canonical integer paise to prevent floating-point artifacts.
 */
async function getMonthlySummary(req, res, next) {
  try {
    const userId = req.userId;
    const { month } = req.validatedQuery;
    const { targetMonth, startDate, endDate } = getMonthDateRange(month);

    const matchStage = {
      userId,
      date: { $gte: startDate, $lt: endDate }
    };

    // Aggregate totals by type using integer amountPaise
    const totalsPromise = Transaction.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$type',
          totalAmountPaise: {
            $sum: { $ifNull: ['$amountPaise', { $round: [{ $multiply: ['$amount', 100] }, 0] }] }
          },
          count: { $sum: 1 }
        }
      }
    ]);

    // Aggregate category-wise expenses for chart using integer amountPaise
    const categoryPromise = Transaction.aggregate([
      { $match: { ...matchStage, type: 'expense' } },
      {
        $group: {
          _id: '$category',
          totalAmountPaise: {
            $sum: { $ifNull: ['$amountPaise', { $round: [{ $multiply: ['$amount', 100] }, 0] }] }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { totalAmountPaise: -1 } }
    ]);

    const [totals, categories] = await Promise.all([totalsPromise, categoryPromise]);

    let totalIncomePaise = 0;
    let totalExpensePaise = 0;

    totals.forEach(item => {
      const paise = typeof item.totalAmountPaise === 'number' ? item.totalAmountPaise : Math.round((item.totalAmount || 0) * 100);
      if (item._id === 'income') totalIncomePaise = paise;
      if (item._id === 'expense') totalExpensePaise = paise;
    });

    // Exact integer arithmetic
    const balancePaise = totalIncomePaise - totalExpensePaise;

    const totalIncome = toRupees(totalIncomePaise);
    const totalExpense = toRupees(totalExpensePaise);
    const balance = toRupees(balancePaise);

    const categoryBreakdown = categories.map(cat => {
      const catPaise = typeof cat.totalAmountPaise === 'number' ? cat.totalAmountPaise : Math.round((cat.totalAmount || 0) * 100);
      return {
        category: cat._id,
        amount: toRupees(catPaise),
        count: cat.count,
        percentage: totalExpensePaise > 0 ? Number(((catPaise / totalExpensePaise) * 100).toFixed(2)) : 0
      };
    });

    return sendSuccess(res, {
      month: targetMonth,
      totalIncome,
      totalExpense,
      balance,
      categoryBreakdown
    }, 200);
  } catch (err) {
    next(err);
  }
}

/**
 * Health check
 */
function healthCheck(req, res) {
  return res.status(200).json({
    status: 'ok',
    service: 'transaction-service',
    timestamp: new Date().toISOString()
  });
}

module.exports = {
  createTransaction,
  getTransactions,
  getTransactionById,
  updateTransaction,
  deleteTransaction,
  getMonthlySummary,
  healthCheck
};
