const { z } = require('zod');

const setThresholdSchema = z.object({
  threshold: z.coerce.number().min(0, 'Threshold must be a non-negative number')
});

module.exports = {
  setThresholdSchema
};
