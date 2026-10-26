// Utilitários de data (fuso local do aparelho) e estrutura da semana/mês.
import { GanhoDia, RegistroGanhoLocal, SemanaMesInfo } from '../types';
import { META_DIARIA_PADRAO } from './amortizacao';

export const SIGLAS_DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

export function toISOLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// "26 de out"
export function formatarDataExibicao(date: Date): string {
  return date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace('.', '');
}

// "Segunda-feira, 26 de out"
export function formatarDiaCompleto(date: Date): string {
  const diaSemana = date.toLocaleDateString('pt-BR', { weekday: 'long' });
  return `${diaSemana.charAt(0).toUpperCase() + diaSemana.slice(1)}, ${formatarDataExibicao(date)}`;
}

// "out"
function mesCurto(date: Date): string {
  return date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
}

export function obterSegundaDaSemana(date: Date): Date {
  const d = new Date(date);
  const diaSemana = d.getDay();
  const diff = diaSemana === 0 ? -6 : 1 - diaSemana;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function gerarEstruturaSemana(hoje: Date): GanhoDia[] {
  const segunda = obterSegundaDaSemana(hoje);
  const hojeISO = toISOLocal(hoje);

  return Array.from({ length: 7 }, (_, i) => {
    const dia = new Date(segunda);
    dia.setDate(segunda.getDate() + i);
    const dataISO = toISOLocal(dia);
    return {
      data: dia,
      dataISO,
      dataExibicao: formatarDataExibicao(dia),
      diaCompleto: formatarDiaCompleto(dia),
      sigla: SIGLAS_DIAS[i],
      valor: 0,
      valorCoberto: 0,
      metaBase: META_DIARIA_PADRAO,
      percentual: 0,
      statusAmortizacao: 'pendente',
      detalheAmortizacao: '0%',
      isHoje: dataISO === hojeISO,
      temRegistro: false,
    };
  });
}

// "19 de out – 25 de out"
export function formatarPeriodo(dias: GanhoDia[]): string {
  if (dias.length < 7) return '';
  return `${dias[0].dataExibicao} – ${dias[6].dataExibicao}`;
}

/**
 * Semanas (Seg–Dom) que tocam o mês de `hoje`. `totalGanhos` soma a semana inteira,
 * inclusive dias do mês vizinho; para o total do mês use `somarGanhosDoMes`.
 * Rótulos: "Sem 2 (5–11 out)" ou, quando a semana cruza o mês, "Sem 1 (28 set – 4 out)".
 */
export function gerarSemanasDoMes(
  hoje: Date,
  ganhosLocais: Record<string, RegistroGanhoLocal>
): SemanaMesInfo[] {
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth();
  const primeiroDiaMes = new Date(ano, mes, 1);
  const ultimoDiaMes = new Date(ano, mes + 1, 0);

  const semanas: SemanaMesInfo[] = [];
  const cursor = obterSegundaDaSemana(primeiroDiaMes);
  let numSemana = 1;
  const hojeISO = toISOLocal(hoje);

  while (cursor <= ultimoDiaMes) {
    const fimSemana = new Date(cursor);
    fimSemana.setDate(cursor.getDate() + 6);

    let totalSem = 0;
    let isAtual = false;

    for (let i = 0; i < 7; i++) {
      const d = new Date(cursor);
      d.setDate(cursor.getDate() + i);
      const iso = toISOLocal(d);
      if (iso === hojeISO) isAtual = true;
      const reg = ganhosLocais[iso];
      if (reg) totalSem += Number(reg.valor || 0);
    }

    const intervalo =
      cursor.getMonth() === fimSemana.getMonth()
        ? `${cursor.getDate()}–${fimSemana.getDate()} ${mesCurto(cursor)}`
        : `${cursor.getDate()} ${mesCurto(cursor)} – ${fimSemana.getDate()} ${mesCurto(fimSemana)}`;

    semanas.push({
      numeroSemana: numSemana,
      rotulo: `Sem ${numSemana} (${intervalo})`,
      dataInicioISO: toISOLocal(cursor),
      dataFimISO: toISOLocal(fimSemana),
      totalGanhos: totalSem,
      isAtual,
    });

    cursor.setDate(cursor.getDate() + 7);
    numSemana++;
  }

  return semanas;
}

/** Soma apenas os ganhos com data dentro do mês de `hoje` (o card "Total do Mês" da Carteira). */
export function somarGanhosDoMes(hoje: Date, ganhosLocais: Record<string, RegistroGanhoLocal>): number {
  const prefixoMes = toISOLocal(hoje).slice(0, 7); // "YYYY-MM"
  return Object.values(ganhosLocais).reduce(
    (acc, reg) => (reg.dataISO.startsWith(prefixoMes) ? acc + (Number(reg.valor) || 0) : acc),
    0
  );
}
