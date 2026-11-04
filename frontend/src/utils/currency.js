/**
 * FinTrack Frontend Monetary Utilities
 * Indian Rupee (INR ₹) formatting and paise/rupee conversion helpers
 */

/**
 * Format INR currency for UI presentation
 * Formats according to Indian numbering system (e.g. 1,00,000.50)
 * 
 * @param {number|string} amountInRupees 
 * @param {object} [options]
 * @returns {string} Formatted string
 */
export function formatINR(amountInRupees, options = {}) {
  const num = Number(amountInRupees) || 0;
  const { showSymbol = false, minimumFractionDigits = 0 } = options;

  const formatted = num.toLocaleString('en-IN', {
    minimumFractionDigits,
    maximumFractionDigits: 2
  });

  return showSymbol ? `₹${formatted}` : formatted;
}

/**
 * Convert Rupees to Integer Paise safely
 * 
 * @param {number|string} rupees 
 * @returns {number} Paise
 */
export function toPaise(rupees) {
  const num = typeof rupees === 'string' ? Number(rupees.trim()) : rupees;
  if (!Number.isFinite(num) || Number.isNaN(num)) {
    throw new TypeError('Invalid amount');
  }
  return Math.round(num * 100);
}

/**
 * Convert Integer Paise to Decimal Rupees
 * 
 * @param {number} paise 
 * @returns {number} Rupees
 */
export function toRupees(paise) {
  if (typeof paise !== 'number' || !Number.isSafeInteger(paise)) {
    return Number(paise || 0) / 100;
  }
  return paise / 100;
}
