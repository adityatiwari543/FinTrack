const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  amount: {
    type: Number,
    required: true,
    min: [0.01, 'Amount must be greater than zero']
  },
  type: {
    type: String,
    required: true,
    enum: {
      values: ['income', 'expense'],
      message: '{VALUE} is not a valid transaction type'
    },
    index: true
  },
  category: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  date: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  },
  note: {
    type: String,
    trim: true,
    default: '',
    maxlength: 500
  }
}, {
  timestamps: true
});

// Compound index for user + date + type queries (optimal for dashboard & filtering)
transactionSchema.index({ userId: 1, date: -1 });
transactionSchema.index({ userId: 1, type: 1, date: -1 });

// Clean JSON representation
transactionSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj.id = obj._id.toString();
  delete obj.__v;
  return obj;
};

const Transaction = mongoose.model('Transaction', transactionSchema);

module.exports = Transaction;
