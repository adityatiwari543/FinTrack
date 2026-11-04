export function formatINR(val) {
  return Number(val || 0).toLocaleString('en-IN', {
    maximumFractionDigits: 2
  });
}

export function formatDate(isoString) {
  try {
    return new Date(isoString).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  } catch {
    return isoString;
  }
}
