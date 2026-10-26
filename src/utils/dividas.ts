// Projeção anual de dívidas: diárias x365, mensais x12, imprevistos conforme frequência.
import { DividaItem } from '../types';

export interface ResumoDividas {
  totalDiario: number;
  totalMensal: number;
  totalImprevistosAnualizado: number;
  totalAnualCalculado: number;
}

export function anualizarDivida(item: DividaItem): number {
  if (item.tipo === 'diaria') return item.valor * 365;
  if (item.tipo === 'mensal') return item.valor * 12;
  if (item.frequenciaImprevisto === 'diaria') return item.valor * 365;
  if (item.frequenciaImprevisto === 'mensal') return item.valor * 12;
  return item.valor;
}

export function calcularResumoDividas(dividas: DividaItem[]): ResumoDividas {
  let totalDiario = 0;
  let totalMensal = 0;
  let totalImprevistosAnualizado = 0;
  let totalAnualCalculado = 0;

  dividas.forEach((item) => {
    const anual = anualizarDivida(item);
    totalAnualCalculado += anual;
    if (item.tipo === 'diaria') totalDiario += item.valor;
    else if (item.tipo === 'mensal') totalMensal += item.valor;
    else totalImprevistosAnualizado += anual;
  });

  return { totalDiario, totalMensal, totalImprevistosAnualizado, totalAnualCalculado };
}

export function rotuloFrequencia(freq?: DividaItem['frequenciaImprevisto']): string {
  if (freq === 'diaria') return 'Diária';
  if (freq === 'mensal') return 'Mensal';
  return 'Anual / Pontual';
}
