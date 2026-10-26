// Testes de src/screens/CarteiraScreen.tsx: visão macro de ganhos (semana, mês e seletor de semanas)
// e gestão de dívidas (projeção anual, categorias, lista e exclusão).
//
// Semanas e totais vêm das funções reais de src/utils para uma data fixa: quarta-feira, 21/10/2026.
// Outubro/2026 tem 5 semanas (Seg–Dom): 28/09–04/10, 05–11, 12–18, 19–25 (atual) e 26/10–01/11.

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { CarteiraScreen, type CarteiraScreenProps } from '../../src/screens/CarteiraScreen';
import { cores } from '../../src/theme';
import type { DividaItem, RegistroGanhoLocal } from '../../src/types';
import { calcularAmortizacaoPorFases } from '../../src/utils/amortizacao';
import { gerarEstruturaSemana, gerarSemanasDoMes, somarGanhosDoMes } from '../../src/utils/datas';

const HOJE = new Date(2026, 9, 21, 10, 0);
const IDX_SEMANA_ATUAL = 3;

function ganho(dataISO: string, valor: number): RegistroGanhoLocal {
  return { dataISO, valor, metaDoDia: 100, percentual: 0, atualizadoEm: '2026-10-21T13:00:00.000Z' };
}

// 30/09 e 01/11 caem nas semanas de borda, mas não pertencem a outubro.
const GANHOS: Record<string, RegistroGanhoLocal> = Object.fromEntries(
  [
    ganho('2026-09-30', 40),
    ganho('2026-10-02', 60),
    ganho('2026-10-06', 100),
    ganho('2026-10-19', 250),
    ganho('2026-10-22', 30),
    ganho('2026-11-01', 70),
  ].map((g) => [g.dataISO, g])
);

/** Totais da semana atual exatamente como o useDadosApp calcula. */
function resumoDaSemanaAtual(ganhos: Record<string, RegistroGanhoLocal>) {
  const estrutura = gerarEstruturaSemana(HOJE).map((d) =>
    ganhos[d.dataISO] ? { ...d, valor: ganhos[d.dataISO].valor, temRegistro: true } : d
  );
  const dias = calcularAmortizacaoPorFases(estrutura, 100);
  return {
    totalSemana: dias.reduce((acc, d) => acc + d.valor, 0),
    diasAmortizadosCompletos: dias.filter((d) => d.percentual === 100).length,
  };
}

const DIVIDAS: DividaItem[] = [
  { id: 'd1', descricao: 'Combustível', valor: 20, tipo: 'diaria', dataLancamento: '2026-10-01' },
  { id: 'm1', descricao: 'Seguro', valor: 1500, tipo: 'mensal', dataLancamento: '2026-10-01' },
  { id: 'i1', descricao: 'Pneu', valor: 690, tipo: 'imprevista', frequenciaImprevisto: 'anual', dataLancamento: '2026-10-02' },
  { id: 'd2', descricao: 'Almoço', valor: 15, tipo: 'diaria', dataLancamento: '2026-10-03' },
  { id: 'i2', descricao: 'Estacionamento', valor: 10, tipo: 'imprevista', frequenciaImprevisto: 'diaria', dataLancamento: '2026-10-04' },
  { id: 'i3', descricao: 'Multa', valor: 120, tipo: 'imprevista', frequenciaImprevisto: 'mensal', dataLancamento: '2026-10-05' },
  { id: 'i4', descricao: 'Guincho', valor: 300, tipo: 'imprevista', dataLancamento: '2026-10-06' },
];

async function renderizar(props: Partial<CarteiraScreenProps> = {}) {
  const callbacks = {
    onSelecionarSemana: jest.fn(),
    onAdicionarDivida: jest.fn(),
    onExcluirDivida: jest.fn(),
  };
  await render(
    <CarteiraScreen
      {...resumoDaSemanaAtual(GANHOS)}
      semanasMes={gerarSemanasDoMes(HOJE, GANHOS)}
      totalMes={somarGanhosDoMes(HOJE, GANHOS)}
      semanaMesSelecionadaIdx={IDX_SEMANA_ATUAL}
      dividas={DIVIDAS}
      {...callbacks}
      {...props}
    />
  );
  return callbacks;
}

/** A pílula da semana é o TouchableOpacity que envolve o nome. */
const pilulaDaSemana = (nome: string) => screen.getByText(nome).parent;

describe('CarteiraScreen', () => {
  it('pré-condição: os dados de outubro/2026 geram as 5 semanas esperadas', () => {
    const semanas = gerarSemanasDoMes(HOJE, GANHOS);

    expect(semanas.map((s) => [s.rotulo, s.totalGanhos, s.isAtual])).toEqual([
      ['Sem 1 (28 set – 4 out)', 100, false],
      ['Sem 2 (5–11 out)', 100, false],
      ['Sem 3 (12–18 out)', 0, false],
      ['Sem 4 (19–25 out)', 280, true],
      ['Sem 5 (26 out – 1 nov)', 70, false],
    ]);
    expect(somarGanhosDoMes(HOJE, GANHOS)).toBe(440);
    expect(resumoDaSemanaAtual(GANHOS)).toEqual({ totalSemana: 280, diasAmortizadosCompletos: 2 });
  });

  describe('visão macro de ganhos', () => {
    it('mostra o total da semana atual com as metas batidas e o total do mês', async () => {
      await renderizar();

      expect(screen.getByText('💼 Visão Macro de Ganhos')).toBeOnTheScreen();
      expect(screen.getByText('SEMANA ATUAL')).toBeOnTheScreen();
      expect(screen.getByText('2 de 7 metas batidas')).toBeOnTheScreen();
      expect(screen.getByText('TOTAL DO MÊS')).toBeOnTheScreen();
      expect(screen.getByText('Só os dias deste mês')).toBeOnTheScreen();
      // Semana atual: card + pílula "Sem 4" + detalhe da semana selecionada
      expect(screen.getAllByText('R$ 280.00')).toHaveLength(3);
    });

    it('o total do mês considera só os dias de outubro (somarGanhosDoMes), não as semanas de borda', async () => {
      await renderizar();

      // 60 + 100 + 250 + 30; a soma das pílulas daria 550 (inclui 30/09 e 01/11)
      expect(screen.getByText('R$ 440.00')).toBeOnTheScreen();
      expect(screen.getByText('R$ 440.00')).toHaveStyle({ color: cores.info });
      expect(screen.queryByText('R$ 550.00')).not.toBeOnTheScreen();
    });

    it('lista todas as semanas do mês com o total de cada uma e a estrela na semana atual', async () => {
      await renderizar();

      expect(screen.getByText('Navegar nas Semanas do Mês:')).toBeOnTheScreen();
      expect(screen.getByText('Sem 1 (28 set – 4 out)')).toBeOnTheScreen();
      expect(screen.getByText('Sem 2 (5–11 out)')).toBeOnTheScreen();
      expect(screen.getByText('Sem 3 (12–18 out)')).toBeOnTheScreen();
      expect(screen.getByText('Sem 4 (19–25 out) ★')).toBeOnTheScreen();
      expect(screen.getByText('Sem 5 (26 out – 1 nov)')).toBeOnTheScreen();
      expect(screen.getAllByText('R$ 100.00')).toHaveLength(2); // Sem 1 e Sem 2
      expect(screen.getByText('R$ 0.00')).toBeOnTheScreen(); // Sem 3
      expect(screen.getByText('R$ 70.00')).toBeOnTheScreen(); // Sem 5
      expect(screen.getAllByText(/★/)).toHaveLength(1);
    });

    it('detalha a semana selecionada', async () => {
      await renderizar({ semanaMesSelecionadaIdx: IDX_SEMANA_ATUAL });

      expect(screen.getByText('Detalhe da Sem 4 (19–25 out):')).toBeOnTheScreen();
      expect(screen.getByText('Total arrecadado: R$ 280.00')).toBeOnTheScreen();
    });

    it('detalha outra semana quando ela é a selecionada', async () => {
      await renderizar({ semanaMesSelecionadaIdx: 0 });

      expect(screen.getByText('Detalhe da Sem 1 (28 set – 4 out):')).toBeOnTheScreen();
      expect(screen.getByText('Total arrecadado: R$ 100.00')).toBeOnTheScreen();
    });

    it('com índice fora do mês, detalha a primeira semana', async () => {
      await renderizar({ semanaMesSelecionadaIdx: 12 });

      expect(screen.getByText('Detalhe da Sem 1 (28 set – 4 out):')).toBeOnTheScreen();
    });

    it('destaca somente a pílula da semana selecionada', async () => {
      await renderizar({ semanaMesSelecionadaIdx: 1 });

      expect(pilulaDaSemana('Sem 2 (5–11 out)')).toHaveStyle({
        borderColor: cores.primaria,
        backgroundColor: cores.superficieAlta,
      });
      expect(screen.getByText('Sem 2 (5–11 out)')).toHaveStyle({ color: '#FFFFFF', fontWeight: '700' });
      expect(pilulaDaSemana('Sem 4 (19–25 out) ★')).toHaveStyle({
        borderColor: cores.superficieAlta,
        backgroundColor: '#131C2E',
      });
    });

    it.each([
      ['Sem 1 (28 set – 4 out)', 0],
      ['Sem 3 (12–18 out)', 2],
      ['Sem 4 (19–25 out) ★', 3],
      ['Sem 5 (26 out – 1 nov)', 4],
    ])('tocar em "%s" seleciona a semana %i', async (nome, indice) => {
      const { onSelecionarSemana } = await renderizar();

      await fireEvent.press(screen.getByText(nome));

      expect(onSelecionarSemana).toHaveBeenCalledTimes(1);
      expect(onSelecionarSemana).toHaveBeenCalledWith(indice);
    });

    it('sem ganhos, mostra tudo zerado', async () => {
      await renderizar({
        totalSemana: 0,
        diasAmortizadosCompletos: 0,
        semanasMes: gerarSemanasDoMes(HOJE, {}),
        totalMes: 0,
        dividas: [],
      });

      expect(screen.getByText('0 de 7 metas batidas')).toBeOnTheScreen();
      expect(screen.getByText('Total arrecadado: R$ 0.00')).toBeOnTheScreen();
      // card da semana + card do mês + 5 pílulas + detalhe
      expect(screen.getAllByText('R$ 0.00')).toHaveLength(8);
    });
  });

  describe('gestão de dívidas', () => {
    it('projeta a dívida anual (diárias x365, mensais x12 e imprevistos anualizados)', async () => {
      await renderizar();

      expect(screen.getByText('📉 Gestão de Dívidas & Custos')).toBeOnTheScreen();
      expect(screen.getByText('⚡ Dívida Anual Projetada')).toBeOnTheScreen();
      expect(screen.getByText('Automático 365 dias')).toBeOnTheScreen();
      // (20 + 15) x 365 + 1500 x 12 + (690 + 10 x 365 + 120 x 12 + 300)
      expect(screen.getByText('R$ 36.855,00')).toBeOnTheScreen();
      expect(
        screen.getByText('Calculada com base nas suas dívidas diárias (x365), mensais (x12) e imprevistos acumulados.')
      ).toBeOnTheScreen();
    });

    it('detalha a projeção por categoria', async () => {
      await renderizar();

      expect(screen.getByText('Diárias/Ano')).toBeOnTheScreen();
      expect(screen.getByText('R$ 12775')).toBeOnTheScreen();
      expect(screen.getByText('Mensais/Ano')).toBeOnTheScreen();
      expect(screen.getByText('R$ 18000')).toBeOnTheScreen();
      expect(screen.getByText('Imprevistos')).toBeOnTheScreen();
      expect(screen.getByText('R$ 6080')).toBeOnTheScreen();
    });

    it('mostra o total de cada categoria', async () => {
      await renderizar();

      expect(screen.getByText('☀️ Dívidas Diárias (Gasto Diário)')).toBeOnTheScreen();
      expect(screen.getByText('R$ 35.00 / dia')).toBeOnTheScreen();
      expect(screen.getByText('📅 Dívidas Mensais (Custos Fixos)')).toBeOnTheScreen();
      expect(screen.getByText('R$ 1500.00 / mês')).toBeOnTheScreen();
      expect(screen.getByText('🚨 Dívidas Imprevistas')).toBeOnTheScreen();
      expect(screen.getByText('Impacto anual: R$ 6080.00')).toBeOnTheScreen();
    });

    it('lista as dívidas diárias com o impacto anual', async () => {
      await renderizar();

      expect(screen.getByText('Combustível')).toBeOnTheScreen();
      expect(screen.getByText('Impacto: R$ 7300.00/ano')).toBeOnTheScreen();
      expect(screen.getByText('R$ 20.00/dia')).toBeOnTheScreen();
      expect(screen.getByText('Almoço')).toBeOnTheScreen();
      expect(screen.getByText('Impacto: R$ 5475.00/ano')).toBeOnTheScreen();
      expect(screen.getByText('R$ 15.00/dia')).toBeOnTheScreen();
    });

    it('lista as dívidas mensais com o impacto anual', async () => {
      await renderizar();

      expect(screen.getByText('Seguro')).toBeOnTheScreen();
      expect(screen.getByText('Impacto: R$ 18000.00/ano')).toBeOnTheScreen();
      expect(screen.getByText('R$ 1500.00/mês')).toBeOnTheScreen();
    });

    it('lista os imprevistos com a frequência e o valor em vermelho', async () => {
      await renderizar();

      expect(screen.getByText('Pneu')).toBeOnTheScreen();
      expect(screen.getByText('Estacionamento')).toBeOnTheScreen();
      expect(screen.getByText('Multa')).toBeOnTheScreen();
      expect(screen.getByText('Guincho')).toBeOnTheScreen();
      expect(screen.getByText('Frequência: Diária')).toBeOnTheScreen();
      expect(screen.getByText('Frequência: Mensal')).toBeOnTheScreen();
      // "anual" e frequência ausente usam o mesmo rótulo
      expect(screen.getAllByText('Frequência: Anual / Pontual')).toHaveLength(2);
      expect(screen.getByText('R$ 690.00')).toHaveStyle({ color: cores.erro });
      expect(screen.getByText('R$ 10.00')).toHaveStyle({ color: cores.erro });
    });

    it('não mostra as mensagens de categoria vazia quando há dívidas', async () => {
      await renderizar();

      expect(screen.queryByText(/^Nenhum/)).not.toBeOnTheScreen();
    });

    it('mostra as mensagens de categoria vazia e totais zerados sem dívidas', async () => {
      await renderizar({ dividas: [] });

      expect(screen.getByText('Nenhum gasto diário registrado (ex: combustível, almoço).')).toBeOnTheScreen();
      expect(
        screen.getByText('Nenhuma dívida mensal registrada (ex: aluguel carro, seguro, parcela).')
      ).toBeOnTheScreen();
      expect(screen.getByText('Nenhum imprevisto registrado (ex: manutenção inesperada, multa).')).toBeOnTheScreen();
      expect(screen.getByText('R$ 0,00')).toBeOnTheScreen();
      expect(screen.getAllByText('R$ 0')).toHaveLength(3);
      expect(screen.getByText('R$ 0.00 / dia')).toBeOnTheScreen();
      expect(screen.getByText('R$ 0.00 / mês')).toBeOnTheScreen();
      expect(screen.getByText('Impacto anual: R$ 0.00')).toBeOnTheScreen();
      expect(screen.queryByText('✕')).not.toBeOnTheScreen();
    });

    it('mostra a mensagem de vazio só nas categorias sem itens', async () => {
      await renderizar({ dividas: DIVIDAS.filter((d) => d.tipo === 'mensal') });

      expect(screen.getByText('Nenhum gasto diário registrado (ex: combustível, almoço).')).toBeOnTheScreen();
      expect(screen.queryByText(/^Nenhuma dívida mensal/)).not.toBeOnTheScreen();
      expect(screen.getByText('Nenhum imprevisto registrado (ex: manutenção inesperada, multa).')).toBeOnTheScreen();
      expect(screen.getByText('R$ 18.000,00')).toBeOnTheScreen();
    });

    it('"+ Adicionar" de cada categoria e "+ Lançar" pedem o tipo correto', async () => {
      const { onAdicionarDivida } = await renderizar();

      const [adicionarDiaria, adicionarMensal] = screen.getAllByText('+ Adicionar');
      await fireEvent.press(adicionarDiaria);
      await fireEvent.press(adicionarMensal);
      await fireEvent.press(screen.getByText('+ Lançar'));

      expect(onAdicionarDivida.mock.calls).toEqual([['diaria'], ['mensal'], ['imprevista']]);
    });

    it('"✕" pede a exclusão com o id e a descrição da dívida (agrupadas por categoria)', async () => {
      const { onExcluirDivida } = await renderizar();

      const botoes = screen.getAllByText('✕');
      expect(botoes).toHaveLength(DIVIDAS.length);
      for (const botao of botoes) {
        await fireEvent.press(botao);
      }

      expect(onExcluirDivida.mock.calls).toEqual([
        ['d1', 'Combustível'],
        ['d2', 'Almoço'],
        ['m1', 'Seguro'],
        ['i1', 'Pneu'],
        ['i2', 'Estacionamento'],
        ['i3', 'Multa'],
        ['i4', 'Guincho'],
      ]);
    });

    it('recalcula a projeção quando a lista de dívidas muda', async () => {
      const callbacks = { onSelecionarSemana: jest.fn(), onAdicionarDivida: jest.fn(), onExcluirDivida: jest.fn() };
      const props = {
        ...resumoDaSemanaAtual(GANHOS),
        semanasMes: gerarSemanasDoMes(HOJE, GANHOS),
        totalMes: somarGanhosDoMes(HOJE, GANHOS),
        semanaMesSelecionadaIdx: IDX_SEMANA_ATUAL,
        ...callbacks,
      };
      await render(<CarteiraScreen {...props} dividas={DIVIDAS} />);
      expect(screen.getByText('R$ 36.855,00')).toBeOnTheScreen();

      await screen.rerender(<CarteiraScreen {...props} dividas={DIVIDAS.filter((d) => d.id !== 'm1')} />);

      expect(screen.getByText('R$ 18.855,00')).toBeOnTheScreen();
      expect(screen.queryByText('Seguro')).not.toBeOnTheScreen();
    });
  });
});
