// Formatação monetária pt-BR centralizada.
// Documentação Intl.NumberFormat: https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat

const fmtCompleto = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const fmtCurto = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Troca NaN/Infinity por 0, arredonda nas casas pedidas e elimina o zero negativo ("-R$ 0,00"). */
function normalizar(valor: number, casas: number): number {
  if (!Number.isFinite(valor)) return 0;
  const fator = 10 ** casas;
  const arredondado = Math.round(valor * fator) / fator;
  return arredondado === 0 ? 0 : arredondado;
}

// "R$ 1.234,56"
export function formatarMoeda(valor: number): string {
  return fmtCompleto.format(normalizar(valor, 2)).replace(/ /g, ' ');
}

// "R$ 1.235" (sem centavos)
export function formatarMoedaCurta(valor: number): string {
  return fmtCurto.format(normalizar(valor, 0)).replace(/ /g, ' ');
}

/**
 * Converte texto digitado em número; 0 se inválido.
 * Aceita "1.250,50", "1250.50", "1,5", "R$ 100" e milhar com ponto sem vírgula ("1.500" → 1500,
 * "1.250.000" → 1250000). Ponto seguido de 1 ou 2 dígitos continua sendo decimal ("1.5" → 1,5).
 */
export function parseValorDigitado(texto: string): number {
  const limpo = texto.replace(/R\$/gi, '').replace(/\s/g, '');
  if (!limpo) return 0;

  let normalizado: string;
  if (limpo.includes(',')) {
    // Com vírgula, o ponto só pode ser milhar.
    normalizado = limpo.replace(/\./g, '').replace(',', '.');
  } else if (/^-?(?!0\.)\d{1,3}(?:\.\d{3})+$/.test(limpo)) {
    // Só pontos, em grupos de 3 dígitos: milhar no padrão brasileiro.
    normalizado = limpo.replace(/\./g, '');
  } else {
    normalizado = limpo;
  }

  const n = parseFloat(normalizado);
  if (!Number.isFinite(n)) return 0;
  return n === 0 ? 0 : n;
}
