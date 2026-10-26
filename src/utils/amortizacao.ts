// Motor da Regra Amortiza: cascata de excedentes entre os dias da semana.
import { GanhoDia } from '../types';

export const META_DIARIA_PADRAO = 100.0;

type Status = GanhoDia['statusAmortizacao'];

/** Arredonda para centavos, evitando resíduos de ponto flutuante (ex.: 45.899999999999984). */
function emCentavos(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/** "R$ 50" quando inteiro, "R$ 0,40" quando há centavos. */
function formatarFaltante(valor: number): string {
  return Number.isInteger(valor) ? `R$ ${valor.toFixed(0)}` : `R$ ${valor.toFixed(2).replace('.', ',')}`;
}

/**
 * Percorre a semana de Seg a Dom. O excedente de um dia cobre os dias seguintes
 * (ex.: meta 100 e ganho 250 na Seg → Seg 100%, Ter 100% adiantada, Qua 50%).
 *
 * Percentual: 100 só quando a meta do dia está coberta; um dia parcial fica entre 1 e 99,
 * para que "dias cobertos" (percentual === 100) nunca conte um dia incompleto.
 */
export function calcularAmortizacaoPorFases(dias: GanhoDia[], metaBase: number): GanhoDia[] {
  const meta = Number(metaBase);
  const metaValida = Number.isFinite(meta) && meta > 0;

  let saldoCascata = 0;
  let diaOrigemExcedente = '';

  return dias.map((dia) => {
    if (!metaValida) {
      // Sem meta válida não há o que cobrir: tudo pendente, sem divisão por zero.
      return { ...dia, metaBase: meta, valorCoberto: 0, percentual: 0, statusAmortizacao: 'pendente', detalheAmortizacao: '0%' };
    }

    const ganhoProprio = Number(dia.valor) || 0;
    const totalDisponivel = emCentavos(ganhoProprio + saldoCascata);

    let valorCoberto = 0;
    let percentual = 0;
    let status: Status = 'pendente';
    let detalhe = '0%';

    if (totalDisponivel >= meta) {
      valorCoberto = meta;
      percentual = 100;
      const novoExcedente = emCentavos(totalDisponivel - meta);

      if (ganhoProprio >= meta) {
        status = 'atingida';
        detalhe = '100% ✓';
        if (novoExcedente > 0) diaOrigemExcedente = dia.sigla;
      } else {
        status = 'adiantada';
        detalhe = `100% ✓ (Amortizado por ${diaOrigemExcedente})`;
      }

      saldoCascata = novoExcedente;
    } else if (totalDisponivel > 0) {
      valorCoberto = totalDisponivel;
      percentual = Math.min(99, Math.max(1, Math.round((valorCoberto / meta) * 100)));
      status = 'parcial';
      detalhe =
        ganhoProprio > 0 && saldoCascata === 0
          ? `${percentual}% (Faltam ${formatarFaltante(emCentavos(meta - totalDisponivel))})`
          : `${percentual}% (Amortizado por ${diaOrigemExcedente})`;
      saldoCascata = 0;
    } else {
      saldoCascata = 0;
    }

    return {
      ...dia,
      metaBase: meta,
      valorCoberto,
      percentual,
      statusAmortizacao: status,
      detalheAmortizacao: detalhe,
    };
  });
}
