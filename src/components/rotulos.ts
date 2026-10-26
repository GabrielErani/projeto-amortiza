// Rótulos curtos de exibição (só camada visual; a formatação base fica em utils/datas).
import { GanhoDia } from '../types';

const semDe = (dataExibicao: string) => dataExibicao.replace(' de ', ' '); // "21 de out" → "21 out"

/** "Quarta-feira, 21 de out" → "Quarta, 21 out", com " · hoje" no dia atual. */
export function rotuloDia(dia: GanhoDia): string {
  const curto = semDe(dia.diaCompleto.replace('-feira', ''));
  return dia.isHoje ? `${curto} · hoje` : curto;
}

/** Período da semana: "19 – 25 out" ou, quando cruza o mês, "28 set – 4 out". */
export function periodoCurto(dias: GanhoDia[]): string {
  if (dias.length < 7) return '';
  const [inicio, fim] = [dias[0], dias[6]];
  const mesmoMes = inicio.data.getMonth() === fim.data.getMonth();
  return `${mesmoMes ? inicio.data.getDate() : semDe(inicio.dataExibicao)} – ${semDe(fim.dataExibicao)}`;
}
