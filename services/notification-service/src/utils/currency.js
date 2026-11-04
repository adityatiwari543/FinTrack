/**
 * Currency conversion utility for FinTrack Notification Service
 * 
 * Canonical representation: Integer Paise (1 INR = 100 paise)
 * External API representation: INR Decimal (e.g. 10000)
 */

const MAX_SAFE_RUPEES = Math.floor(Number.MAX_SAFE_INTEGER / 100);

/**
 * Convert Rupees (number or numeric string) into canonical integer paise.
 * 
 * @param {number|string} rupees - Rupee amount
 * @param {boolean} [allowZero=true] - Thresholds may be zero
 * @returns {number} Integer paise
 */
function toPaise(rupees, allowZero = true) {
  if (rupees === null || rupees === undefined || (typeof rupees !== 'number' && typeof rupees !== 'string')) {
    throw new TypeError('Amount must be a number or numeric string');
  }

  const num = typeof rupees === 'string' ? Number(rupees.trim()) : rupees;

  if (!Number.isFinite(num) || Number.isNaN(num)) {
    throw new TypeError('Amount must be a finite number');
  }

  if (allowZero) {
    if (num < 0) {
      throw new RangeError('Amount cannot be negative');
    }
  } else {
    if (num <= 0) {
      throw new RangeError('Amount must be greater than zero');
    }
  }

  if (num > MAX_SAFE_RUPEES) {
    throw new RangeError(`Amount exceeds maximum safe limit (₹${MAX_SAFE_RUPEES.toLocaleString('en-IN')})`);
  }

  // Reject precision beyond 2 decimal places
  const str = String(rupees).trim();
  if (str.includes('.')) {
    const decimals = str.split('.')[1];
    if (decimals && decimals.length > 2) {
      throw new Error('Amount cannot have more than 2 decimal places');
    }
  }

  const paise = Math.round(num * 100);

  if (!Number.isSafeInteger(paise)) {
    throw new RangeError('Computed paise exceeds safe integer range');
  }

  return paise;
}

/**
 * Convert canonical integer paise into INR Rupees.
 * 
 * @param {number} paise - Integer paise
 * @returns {number} Decimal Rupees
 */
function toRupees(paise) {
  if (typeof paise !== 'number' || !Number.isSafeInteger(paise)) {
    throw new TypeError('Paise must be a safe integer');
  }
  return paise / 100;
}

/**
 * Format INR for display or alert notifications
 * 
 * @param {number} rupees 
 * @returns {string} Formatted Indian Rupee string e.g. "₹10,000"
 */
function formatINR(rupees) {
  const num = Number(rupees) || 0;
  return `₹${num.toLocaleString('en-IN', {
    minimumFractionDigits: Number.isInteger(num) ? 0 : 2,
    maximumFractionDigits: 2
  })}`;
}

module.exports = {
  toPaise,
  toRupees,
  formatINR,
  MAX_SAFE_RUPEES
};
