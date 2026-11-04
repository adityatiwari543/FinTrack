const mongoose = require('mongoose');

const thresholdSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  thresholdPaise: {
    type: Number,
    required: true,
    min: [0, 'Threshold cannot be negative'],
    validate: {
      validator: Number.isInteger,
      message: '{VALUE} must be an integer'
    }
  },
  threshold: {
    type: Number,
    min: [0, 'Threshold cannot be negative']
  }
}, {
  timestamps: true
});

// Synchronize threshold and thresholdPaise
thresholdSchema.pre('validate', function (next) {
  if (this.thresholdPaise !== undefined && this.thresholdPaise !== null) {
    if (this.threshold === undefined || this.threshold === null) {
      this.threshold = this.thresholdPaise / 100;
    }
  } else if (this.threshold !== undefined && this.threshold !== null) {
    this.thresholdPaise = Math.round(this.threshold * 100);
  }
  next();
});

thresholdSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj._id;
  delete obj.__v;
  if (typeof this.thresholdPaise === 'number') {
    obj.threshold = this.thresholdPaise / 100;
  }
  delete obj.thresholdPaise;
  return obj;
};

const Threshold = mongoose.model('Threshold', thresholdSchema);

module.exports = Threshold;
