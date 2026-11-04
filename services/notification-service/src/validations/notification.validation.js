const { z } = require('zod');

const isValidDecimalPrecision = (val) => {
  if (val === undefined || val === null) return true;
  const str = val.toString().trim();
  if (str.includes('.')) {
    const decimals = str.split('.')[1];
    return decimals.length <= 2;
  }
  return true;
};

const setThresholdSchema = z.object({
  threshold: z.coerce.number()
    .min(0, 'Threshold must be a non-negative number')
    .refine(isValidDecimalPrecision, {
      message: 'Threshold cannot have more than 2 decimal places'
    })
});

module.exports = {
  setThresholdSchema
};
