const { z } = require('zod');

const createTransactionSchema = z.object({
  amount: z.coerce.number().positive('Amount must be a positive number'),
  type: z.enum(['income', 'expense'], {
    errorMap: () => ({ message: "Type must be either 'income' or 'expense'" })
  }),
  category: z.string().trim().min(1, 'Category is required').max(100),
  date: z.string().optional().refine(val => !val || !isNaN(Date.parse(val)), {
    message: 'Date must be a valid ISO date string'
  }),
  note: z.string().trim().max(500, 'Note cannot exceed 500 characters').optional().default('')
});

const updateTransactionSchema = z.object({
  amount: z.coerce.number().positive('Amount must be a positive number').optional(),
  type: z.enum(['income', 'expense']).optional(),
  category: z.string().trim().min(1).max(100).optional(),
  date: z.string().optional().refine(val => !val || !isNaN(Date.parse(val)), {
    message: 'Date must be a valid ISO date string'
  }),
  note: z.string().trim().max(500).optional()
}).refine(data => Object.keys(data).length > 0, {
  message: 'At least one field must be provided to update'
});

const queryTransactionsSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Month must be in YYYY-MM format').optional(),
  type: z.enum(['income', 'expense']).optional(),
  category: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10)
});

const summaryQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Month must be in YYYY-MM format').optional()
});

module.exports = {
  createTransactionSchema,
  updateTransactionSchema,
  queryTransactionsSchema,
  summaryQuerySchema
};
