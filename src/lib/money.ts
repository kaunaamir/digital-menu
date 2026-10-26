export function formatMoney(amount: number | string, currency = 'INR'): string {
  const n = Number(amount);
  try {
    return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : undefined, {
      style: 'currency', currency, minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2,
    }).format(n);
  } catch { return `${currency} ${n.toFixed(2)}`; }
}
