// Formatação monetária pt-BR centralizada.

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

function normalizar(valor: number): number {
  return Number.isFinite(valor) ? valor : 0;
}

// "R$ 1.234,56"
export function formatarMoeda(valor: number): string {
  return fmtCompleto.format(normalizar(valor)).replace(/ /g, ' ');
}

// "R$ 1.235" (sem centavos)
export function formatarMoedaCurta(valor: number): string {
  return fmtCurto.format(normalizar(valor)).replace(/ /g, ' ');
}

// Converte texto digitado ("1.250,50" ou "1250.50") em número; 0 se inválido.
export function parseValorDigitado(texto: string): number {
  const limpo = texto.trim().replace(/\s/g, '');
  if (!limpo) return 0;
  // Se tem vírgula, trata ponto como milhar.
  const normalizado = limpo.includes(',')
    ? limpo.replace(/\./g, '').replace(',', '.')
    : limpo;
  const n = parseFloat(normalizado);
  return Number.isFinite(n) ? n : 0;
}
