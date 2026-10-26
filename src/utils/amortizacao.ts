// Motor da Regra Amortiza: cascata de excedentes entre os dias da semana.
import { GanhoDia } from '../types';

export const META_DIARIA_PADRAO = 100.0;

type Status = GanhoDia['statusAmortizacao'];

/**
 * Percorre a semana de Seg a Dom. O excedente de um dia cobre os dias seguintes
 * (ex.: meta 100 e ganho 250 na Seg → Seg 100%, Ter 100% adiantada, Qua 50%).
 */
export function calcularAmortizacaoPorFases(dias: GanhoDia[], metaBase: number): GanhoDia[] {
  let saldoCascata = 0;
  let diaOrigemExcedente = '';

  return dias.map((dia) => {
    const ganhoProprio = dia.valor || 0;
    const totalDisponivel = ganhoProprio + saldoCascata;

    let valorCoberto = 0;
    let status: Status = 'pendente';
    let detalhe = '';

    if (totalDisponivel >= metaBase) {
      valorCoberto = metaBase;
      const novoExcedente = totalDisponivel - metaBase;

      if (ganhoProprio >= metaBase) {
        status = 'atingida';
        detalhe = '100% ✓';
        if (novoExcedente > 0) {
          diaOrigemExcedente = dia.sigla;
        }
      } else {
        status = 'adiantada';
        detalhe = `100% ✓ (Amortizado por ${diaOrigemExcedente})`;
      }

      saldoCascata = novoExcedente;
    } else if (totalDisponivel > 0) {
      valorCoberto = totalDisponivel;
      const faltam = metaBase - totalDisponivel;
      status = 'parcial';
      if (ganhoProprio > 0 && saldoCascata === 0) {
        detalhe = `${Math.round((valorCoberto / metaBase) * 100)}% (Faltam R$ ${faltam.toFixed(0)})`;
      } else {
        detalhe = `${Math.round((valorCoberto / metaBase) * 100)}% (Amortizado por ${diaOrigemExcedente})`;
      }
      saldoCascata = 0;
    } else {
      valorCoberto = 0;
      status = 'pendente';
      detalhe = '0%';
      saldoCascata = 0;
    }

    const percentual = metaBase > 0 ? Math.min(100, Math.round((valorCoberto / metaBase) * 100)) : 0;

    return {
      ...dia,
      metaBase,
      valorCoberto,
      percentual,
      statusAmortizacao: status,
      detalheAmortizacao: detalhe,
    };
  });
}
