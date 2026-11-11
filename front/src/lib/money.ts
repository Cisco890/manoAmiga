import type { SponsorshipCommitment } from '../api/sponsors.ts';

/** Formatea un monto que la API envía como texto con dos decimales (p. ej. «250.00» → «Q250.00»). */
export function formatMoney(amount: string, currency = 'GTQ') {
  const value = Number(amount);
  if (!Number.isFinite(value)) return amount;
  try {
    return new Intl.NumberFormat('es-GT', { style: 'currency', currency, minimumFractionDigits: 2 }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

/**
 * Texto del compromiso de un padrino. Siempre dice «autorizado»: es lo que el padrino se
 * comprometió a aportar, no dinero recibido (MA-34, MA-38).
 */
export function describeCommitment(commitment: SponsorshipCommitment | null) {
  if (!commitment) return 'Sin compromiso registrado';
  const amount = formatMoney(commitment.authorizedAmount, commitment.currency);
  return commitment.frequency === 'MONTHLY'
    ? `Compromiso mensual autorizado: ${amount}`
    : `Donación única autorizada: ${amount}`;
}
