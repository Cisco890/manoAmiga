import { describe, expect, it } from 'vitest';
import { formatDate, parseDate } from './dates.ts';

describe('fechas día/mes/año', () => {
  it('muestra fechas de calendario sin desplazarlas por la zona horaria', () => {
    expect(formatDate('2026-01-01')).toBe('01/01/2026');
    expect(formatDate('2026-10-22')).toBe('22/10/2026');
    expect(formatDate(null)).toBe('');
  });

  it('convierte el día y mes en el orden correcto para la API', () => {
    expect(parseDate('05/06/2026')).toBe('2026-06-05');
    expect(parseDate('29/02/2024')).toBe('2024-02-29');
  });

  it.each(['31/02/2026', '29/02/2026', '31/04/2026', '00/01/2026', '01/13/2026', '01/01/0000', '2026-10-22', '1/1/2026', ''])(
    'rechaza la fecha inválida %s',
    (value) => expect(parseDate(value)).toBeNull(),
  );
});
