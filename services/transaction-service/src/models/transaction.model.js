const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  amountPaise: {
    type: Number,
    required: true,
    min: [1, 'Amount in paise must be at least 1'],
    validate: {
      validator: Number.isInteger,
      message: '{VALUE} must be an integer'
    }
  },
  amount: {
    type: Number,
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

// Synchronize amount and amountPaise before validation
transactionSchema.pre('validate', function (next) {
  if (this.amountPaise !== undefined && this.amountPaise !== null) {
    if (this.amount === undefined || this.amount === null) {
      this.amount = this.amountPaise / 100;
    }
  } else if (this.amount !== undefined && this.amount !== null) {
    this.amountPaise = Math.round(this.amount * 100);
  }
  next();
});

// Compound index for user + date + type queries (optimal for dashboard & filtering)
transactionSchema.index({ userId: 1, date: -1 });
transactionSchema.index({ userId: 1, type: 1, date: -1 });

// Clean JSON representation: canonical response exposes INR 'amount' and hides internal amountPaise
transactionSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj.id = obj._id.toString();
  if (typeof this.amountPaise === 'number') {
    obj.amount = this.amountPaise / 100;
  }
  delete obj.amountPaise;
  delete obj.__v;
  return obj;
};

const Transaction = mongoose.model('Transaction', transactionSchema);

module.exports = Transaction;
