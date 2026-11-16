/**
 * Aritmética monetaria exacta.
 * Los importes se manejan en microcentavos (1 unidad = 1 000 000 micro) y se
 * redondean a centavos con half-up, igual que Decimal en Python y big.Rat en Go.
 */

const MICRO_POR_CENTAVO = 10_000;

/** Convierte un número JSON a microcentavos exactos (o null si no es representable). */
export function microDesdeNumero(valor: number): number | null {
  if (!Number.isFinite(valor)) {
    return null;
  }

  const texto = String(valor);
  const coincidencia = /^(-?)(\d+)(?:\.(\d+))?$/.exec(texto);
  if (!coincidencia) {
    // Notación exponencial: aproximación fuera del rango práctica de precios.
    const aproximado = Math.round(valor * 1_000_000);
    return Number.isSafeInteger(aproximado) ? aproximado : null;
  }

  const [, signo, entero, fraccion = ""] = coincidencia;
  const digitos = (fraccion + "000000").slice(0, 6);
  let micro = Number(entero) * 1_000_000 + Number(digitos);
  if (fraccion.length > 6 && (fraccion[6] ?? "0") >= "5") {
    micro += 1;
  }
  if (signo === "-") {
    micro = -micro;
  }
  return Number.isSafeInteger(micro) ? micro : null;
}

/** Redondea microcentavos a centavos enteros con half-up. */
export function centavosDesdeMicro(micro: number): number {
  if (micro === 0) {
    return 0;
  }
  const magnitud = Math.abs(micro);
  const centavos = Math.floor((magnitud + MICRO_POR_CENTAVO / 2) / MICRO_POR_CENTAVO);
  return micro < 0 ? -centavos : centavos;
}

/** Convierte centavos a número decimal del contrato. */
export function numeroDesdeCentavos(centavos: number): number {
  return centavos / 100;
}
