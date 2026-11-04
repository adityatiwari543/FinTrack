const mongoose = require('mongoose');

const thresholdSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  threshold: {
    type: Number,
    required: true,
    min: [0, 'Threshold cannot be negative']
  }
}, {
  timestamps: true
});

thresholdSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj._id;
  delete obj.__v;
  return obj;
};

const Threshold = mongoose.model('Threshold', thresholdSchema);

module.exports = Threshold;
