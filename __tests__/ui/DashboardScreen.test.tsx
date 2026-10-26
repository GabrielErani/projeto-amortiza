import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { DashboardScreen } from '../../src/screens/DashboardScreen';
import { ALVO_TOQUE, cores, fonte, superficies, tamanho, textos } from '../../src/theme';
import { GanhoDia } from '../../src/types';
import { calcularAmortizacaoPorFases } from '../../src/utils/amortizacao';
import { gerarEstruturaSemana } from '../../src/utils/datas';

type Props = React.ComponentProps<typeof DashboardScreen>;

// Semana fixa: hoje = quarta, 21/10/2026 (semana de 19 a 25/10), meta R$ 100/dia.
// Ganhos: Seg 250, Qua 30, Sex 120 →
//   Seg 100% (batida) | Ter 100% (adiantada por Seg) | Qua 80% (parcial) | Qui 0%
//   Sex 100% (batida) | Sáb 20% (adiantada por Sex) | Dom 0%
// Total R$ 400; 3/7 dias cobertos; cobertura 400 de 700 → 57%.
const HOJE = new Date(2026, 9, 21);
function semana(valores: number[], meta = 100): GanhoDia[] {
  const estrutura = gerarEstruturaSemana(HOJE).map((d, i) => ({ ...d, valor: valores[i] ?? 0, temRegistro: (valores[i] ?? 0) > 0 }));
  return calcularAmortizacaoPorFases(estrutura, meta);
}
const DIAS = semana([250, 0, 30, 0, 120, 0, 0]);

async function renderizar(over: Partial<Props> = {}) {
  const props: Props = {
    dias: DIAS,
    diaSelecionadoIdx: 2,
    onSelecionarDia: jest.fn(),
    metaBase: 100,
    onEditarMeta: jest.fn(),
    onLancarGanho: jest.fn(),
    ...over,
  };
  await render(<DashboardScreen {...props} />);
  return props;
}

// A barra de progresso é exposta como "progressbar" (valor 0–100); a largura do preenchimento acompanha o valor.
const larguraDoProgresso = () =>
  screen.getAllByRole('progressbar').map((trilha) => {
    const [preenchimento] = trilha.children;
    return typeof preenchimento === 'string' ? undefined : StyleSheet.flatten(preenchimento.props.style)?.width;
  });
const linhaDaMeta = (texto: string) => screen.getByRole('button', { name: texto });

describe('DashboardScreen', () => {
  describe('resumo da semana', () => {
    it('mostra o total da semana formatado em reais', async () => {
      await renderizar();

      expect(screen.getByText('Ganho total da semana')).toBeOnTheScreen();
      expect(screen.getByText('R$ 400,00')).toHaveStyle(textos.hero);
    });

    it('mostra a meta semanal e quantos dias estão cobertos (inclui dias adiantados)', async () => {
      await renderizar();

      expect(screen.getByText('Meta R$ 700 · 3/7 dias cobertos')).toBeOnTheScreen();
    });

    it('a barra de progresso reflete a cobertura da meta semanal', async () => {
      await renderizar();

      expect(larguraDoProgresso()).toEqual(['57%']);
    });

    it('a barra de progresso é acessível: papel, rótulo e valor de 0 a 100', async () => {
      await renderizar();

      const barra = screen.getByRole('progressbar', { name: 'Cobertura da meta da semana' });
      expect(barra).toHaveAccessibilityValue({ min: 0, max: 100, now: 57 });
      expect(barra).toHaveStyle({ height: tamanho.trilha });
    });

    it('o progresso nunca passa de 100%', async () => {
      await renderizar({ dias: semana([1000, 0, 0, 0, 0, 0, 0]), metaBase: 100 });

      expect(screen.getByText('Meta R$ 700 · 7/7 dias cobertos')).toBeOnTheScreen();
      expect(larguraDoProgresso()).toEqual(['100%']);
      expect(screen.getByRole('progressbar')).toHaveAccessibilityValue({ now: 100 });
    });

    it('meta semanal acompanha a meta diária', async () => {
      await renderizar({ dias: semana([150, 0, 0, 0, 0, 0, 0], 150), metaBase: 150 });

      expect(screen.getByText('Meta R$ 1.050 · 1/7 dias cobertos')).toBeOnTheScreen();
    });

    it('a linha da meta é tocável (botão) e abre a meta base', async () => {
      const props = await renderizar();

      const linha = linhaDaMeta('Meta R$ 700 · 3/7 dias cobertos');
      expect(linha).toHaveProp('accessibilityHint', 'Ajustar a meta diária');
      await fireEvent.press(linha);

      expect(props.onEditarMeta).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('Ajustar')).not.toBeOnTheScreen();
    });

    it('a linha da meta tem o toque expandido até 44 sem crescer o layout (mais para baixo que para cima)', async () => {
      await renderizar();

      const { top, bottom } = linhaDaMeta('Meta R$ 700 · 3/7 dias cobertos').props.hitSlop;
      expect(fonte.detalhe.fontSize + top + bottom).toBeGreaterThanOrEqual(ALVO_TOQUE);
      expect(bottom).toBeGreaterThan(top);
    });
  });

  describe('gráfico', () => {
    it('renderiza as 7 barras com o percentual de cada dia', async () => {
      await renderizar();

      expect(screen.getByRole('button', { name: 'Segunda-feira, 19 de out, 100% da meta' })).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Terça-feira, 20 de out, 100% da meta' })).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Quarta-feira, 21 de out, 80% da meta' })).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Quinta-feira, 22 de out, 0% da meta' })).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Sexta-feira, 23 de out, 100% da meta' })).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Sábado, 24 de out, 20% da meta' })).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Domingo, 25 de out, 0% da meta' })).toBeOnTheScreen();
    });

    it('tocar numa barra seleciona o dia pelo índice', async () => {
      const props = await renderizar();

      await fireEvent.press(screen.getByRole('button', { name: 'Sábado, 24 de out, 20% da meta' }));

      expect(props.onSelecionarDia).toHaveBeenCalledWith(5);
    });
  });

  describe('card do dia selecionado', () => {
    it('hoje com ganho: mostra "dia, data · hoje", valor, status e o botão "Lançar ganho"', async () => {
      const props = await renderizar({ diaSelecionadoIdx: 2 });

      expect(screen.getByText('Quarta, 21 out · hoje')).toBeOnTheScreen();
      expect(screen.getByText('R$ 30,00')).toHaveStyle(textos.titulo);
      expect(screen.getByText('80% (Amortizado por Seg)')).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Adicionar' })).not.toBeOnTheScreen();

      await fireEvent.press(screen.getByRole('button', { name: 'Lançar ganho' }));
      expect(props.onLancarGanho).toHaveBeenCalledWith(2);
    });

    it('o botão "Lançar ganho" é primário e fica abaixo do valor, dentro do card', async () => {
      await renderizar({ diaSelecionadoIdx: 2 });

      const botao = screen.getByRole('button', { name: 'Lançar ganho' });
      const card = botao.parent!;
      expect(botao).toHaveStyle({ backgroundColor: cores.primaria });
      expect(card).toHaveStyle(superficies.cardBase);
      expect(card.children[card.children.length - 1]).toBe(botao);
    });

    it('dia sem ganho próprio: valor zerado, status da cobertura e "Lançar ganho" com o índice do dia', async () => {
      const props = await renderizar({ diaSelecionadoIdx: 1 });

      expect(screen.getByText('Terça, 20 out')).toBeOnTheScreen();
      expect(screen.getByText('R$ 0,00')).toBeOnTheScreen();
      expect(screen.getByText('100% ✓ (Amortizado por Seg)')).toBeOnTheScreen();
      expect(screen.queryByText(/· hoje/)).not.toBeOnTheScreen();

      await fireEvent.press(screen.getByRole('button', { name: 'Lançar ganho' }));
      expect(props.onLancarGanho).toHaveBeenCalledTimes(1);
      expect(props.onLancarGanho).toHaveBeenCalledWith(1);
    });

    it.each<[number, string, string]>([
      [0, '100% ✓', cores.primaria],
      [1, '100% ✓ (Amortizado por Seg)', cores.info],
      [2, '80% (Amortizado por Seg)', cores.alerta],
      [5, '20% (Amortizado por Sex)', cores.alerta],
    ])('dia %i mostra o status "%s" com o ponto na cor do status', async (idx, status, cor) => {
      await renderizar({ diaSelecionadoIdx: idx });

      const texto = screen.getByText(status);
      const ponto = texto.parent?.children.find((c) => typeof c !== 'string' && c !== texto);
      expect(ponto).toHaveStyle({ backgroundColor: cor });
    });

    it('dia pendente mostra 0% e cor neutra', async () => {
      await renderizar({ diaSelecionadoIdx: 6 });

      expect(screen.getByText('Domingo, 25 out')).toBeOnTheScreen();
      expect(screen.getByText('R$ 0,00')).toBeOnTheScreen();
      // "0%" aparece no gráfico (Qui e Dom) e no card do dia.
      expect(screen.getAllByText('0%')).toHaveLength(3);
    });

    it('acompanha a troca do dia selecionado', async () => {
      const props = await renderizar({ diaSelecionadoIdx: 2 });

      await screen.rerender(<DashboardScreen {...props} diaSelecionadoIdx={4} />);

      expect(screen.getByText('Sexta, 23 out')).toBeOnTheScreen();
      expect(screen.getByText('R$ 120,00')).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('button', { name: 'Lançar ganho' }));
      expect(props.onLancarGanho).toHaveBeenCalledWith(4);
    });

    it('índice fora da semana cai no primeiro dia', async () => {
      await renderizar({ diaSelecionadoIdx: 99 });

      expect(screen.getByText('Segunda, 19 out')).toBeOnTheScreen();
      expect(screen.getByText('R$ 250,00')).toBeOnTheScreen();
    });
  });

  it('a primeira página tem só o essencial: meta, 7 barras e "Lançar ganho"', async () => {
    await renderizar();

    const botoes = screen.getAllByRole('button').map((b) => b.props.accessibilityLabel ?? '');
    expect(botoes).toHaveLength(9);
    expect(botoes.filter((r) => r.endsWith('da meta'))).toHaveLength(7);
    expect(botoes).toContain('Lançar ganho');
  });

  describe('estados vazios', () => {
    it('semana sem ganhos: total zerado e nenhum dia coberto', async () => {
      await renderizar({ dias: semana([0, 0, 0, 0, 0, 0, 0]), diaSelecionadoIdx: 2 });

      // Total da semana e valor do dia selecionado, ambos zerados.
      expect(screen.getAllByText('R$ 0,00')).toHaveLength(2);
      expect(screen.getByText('Meta R$ 700 · 0/7 dias cobertos')).toBeOnTheScreen();
      expect(larguraDoProgresso()).toEqual(['0%']);
      expect(screen.getByRole('button', { name: 'Lançar ganho' })).toBeOnTheScreen();
    });

    it('sem dias, não mostra barras nem card do dia', async () => {
      await renderizar({ dias: [], diaSelecionadoIdx: 0 });

      expect(screen.getByText('R$ 0,00')).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: /da meta$/ })).not.toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Lançar ganho' })).not.toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Adicionar' })).not.toBeOnTheScreen();
    });

    it('meta zero não quebra o cálculo de progresso', async () => {
      await renderizar({ dias: semana([0, 0, 0, 0, 0, 0, 0], 0), metaBase: 0 });

      expect(screen.getByText(/^Meta R\$ 0 · /)).toBeOnTheScreen();
      expect(larguraDoProgresso()).toEqual(['0%']);
    });
  });
});
