// Testes de src/screens/DashboardScreen.tsx: ganho total da semana, dia selecionado, gráfico de barras
// da amortização por fases e card "Regra Amortiza".
//
// A semana é gerada pelas funções reais de src/utils (gerarEstruturaSemana + calcularAmortizacaoPorFases)
// para uma data fixa: quarta-feira, 21/10/2026 (semana de 19 a 25 de outubro).

import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { TestInstance } from 'test-renderer';
import { DashboardScreen, type DashboardScreenProps } from '../../src/screens/DashboardScreen';
import { cores, corPorStatus } from '../../src/theme';
import type { GanhoDia } from '../../src/types';
import { calcularAmortizacaoPorFases } from '../../src/utils/amortizacao';
import { gerarEstruturaSemana } from '../../src/utils/datas';

const HOJE = new Date(2026, 9, 21, 10, 0); // quarta-feira
const IDX_SEG = 0;
const IDX_QUA = 2; // hoje
const IDX_QUI = 3;

/** Semana Seg–Dom com os ganhos informados e a cascata aplicada (como no useDadosApp). */
function semanaCom(valores: number[], meta = 100): GanhoDia[] {
  const estrutura = gerarEstruturaSemana(HOJE).map((dia, i) =>
    valores[i] ? { ...dia, valor: valores[i], temRegistro: true } : dia
  );
  return calcularAmortizacaoPorFases(estrutura, meta);
}

/** Props derivadas da semana exatamente como o useDadosApp calcula. */
function propsDaSemana(diasSemana: GanhoDia[], meta = 100) {
  return {
    diasSemana,
    metaDiariaBase: meta,
    totalSemana: diasSemana.reduce((acc, d) => acc + d.valor, 0),
    totalCobertoSemana: diasSemana.reduce((acc, d) => acc + d.valorCoberto, 0),
    diasAmortizadosCompletos: diasSemana.filter((d) => d.percentual === 100).length,
  };
}

// Seg 250 → Seg 100% (atingida), Ter 100% (adiantada), Qua 50% (adiantada parcial); Qui 30 próprio (parcial).
const SEMANA_PADRAO = semanaCom([250, 0, 0, 30, 0, 0, 0]);

async function renderizar(props: Partial<DashboardScreenProps> = {}) {
  const callbacks = {
    onSelecionarDia: jest.fn(),
    onAbrirMetaBase: jest.fn(),
    onLancarGanho: jest.fn(),
  };
  await render(
    <DashboardScreen
      {...propsDaSemana(SEMANA_PADRAO)}
      diaSelecionadoIdx={IDX_QUA}
      {...callbacks}
      {...props}
    />
  );
  return callbacks;
}

const estiloDe = (el: TestInstance) => StyleSheet.flatten(el.props.style) ?? {};

/** Preenchimentos das 7 barras do gráfico, na ordem Seg → Dom. */
const preenchimentosDasBarras = () =>
  screen.container.queryAll((el) => {
    const estilo = estiloDe(el);
    return el.type === 'View' && estilo.width === '100%' && estilo.borderRadius === 11;
  });

describe('DashboardScreen', () => {
  describe('ganho total da semana', () => {
    it('mostra o rótulo, a meta diária no botão de configuração e o total formatado em pt-BR', async () => {
      await renderizar();

      expect(screen.getByText('Ganho Total da Semana')).toBeOnTheScreen();
      expect(screen.getByText('⚙️ Meta: R$ 100')).toBeOnTheScreen();
      expect(screen.getByText('R$ 280,00')).toBeOnTheScreen();
    });

    it('usa separador de milhar e centavos no total', async () => {
      const semana = semanaCom([1000, 234.5, 0, 0, 0, 0, 0]);
      await renderizar({ ...propsDaSemana(semana) });

      expect(screen.getByText('R$ 1.234,50')).toBeOnTheScreen();
    });

    it('mostra a meta sem casas decimais no botão de configuração', async () => {
      const semana = semanaCom([0, 0, 0, 0, 0, 0, 0], 150.4);
      await renderizar({ ...propsDaSemana(semana, 150.4) });

      expect(screen.getByText('⚙️ Meta: R$ 150')).toBeOnTheScreen();
    });

    it('o botão da meta chama onAbrirMetaBase', async () => {
      const { onAbrirMetaBase, onLancarGanho } = await renderizar();

      await fireEvent.press(screen.getByText('⚙️ Meta: R$ 100'));

      expect(onAbrirMetaBase).toHaveBeenCalledTimes(1);
      expect(onLancarGanho).not.toHaveBeenCalled();
    });
  });

  describe('dia selecionado', () => {
    it('sem ganho próprio: "Sem ganho trabalhado", status da cascata e botão "+ Inserir"', async () => {
      await renderizar({ diaSelecionadoIdx: IDX_QUA });

      expect(screen.getByText('Quarta-feira, 21 de out:')).toBeOnTheScreen();
      expect(screen.getByText('Sem ganho trabalhado')).toBeOnTheScreen();
      // Aparece no destaque do dia e no card da Regra Amortiza
      expect(screen.getAllByText('Status: 50% (Amortizado por Seg)')).toHaveLength(2);
      expect(screen.getByText('+ Inserir')).toBeOnTheScreen();
      expect(screen.queryByText('+ Adicionar')).not.toBeOnTheScreen();
    });

    it('com ganho: "Fez R$ ..." em pt-BR e botão "+ Adicionar"', async () => {
      await renderizar({ diaSelecionadoIdx: IDX_SEG });

      expect(screen.getByText('Segunda-feira, 19 de out:')).toBeOnTheScreen();
      expect(screen.getByText('Fez R$ 250,00')).toBeOnTheScreen();
      expect(screen.getAllByText('Status: 100% ✓')).toHaveLength(2);
      expect(screen.getByText('+ Adicionar')).toBeOnTheScreen();
      expect(screen.queryByText('+ Inserir')).not.toBeOnTheScreen();
    });

    it('mostra quanto falta quando o dia tem ganho parcial sem cascata', async () => {
      await renderizar({ diaSelecionadoIdx: IDX_QUI });

      expect(screen.getByText('Fez R$ 30,00')).toBeOnTheScreen();
      expect(screen.getAllByText('Status: 30% (Faltam R$ 70)')).toHaveLength(2);
    });

    it('o botão de lançar envia o índice do dia selecionado', async () => {
      const { onLancarGanho, onSelecionarDia } = await renderizar({ diaSelecionadoIdx: IDX_QUA });

      await fireEvent.press(screen.getByText('+ Inserir'));

      expect(onLancarGanho).toHaveBeenCalledTimes(1);
      expect(onLancarGanho).toHaveBeenCalledWith(IDX_QUA);
      expect(onSelecionarDia).not.toHaveBeenCalled();
    });

    it('com índice fora da semana, exibe a segunda-feira', async () => {
      await renderizar({ diaSelecionadoIdx: 9 });

      expect(screen.getByText('Segunda-feira, 19 de out:')).toBeOnTheScreen();
      expect(screen.getByText('Fez R$ 250,00')).toBeOnTheScreen();
      expect(screen.getByText('📅 Segunda-feira, 19 de out:')).toBeOnTheScreen();
    });
  });

  describe('gráfico de barras', () => {
    it('mostra o percentual, a sigla de cada dia e o valor arredondado dos dias com ganho', async () => {
      await renderizar();

      for (const sigla of ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']) {
        expect(screen.getByText(sigla)).toBeOnTheScreen();
      }
      expect(screen.getAllByText('100%')).toHaveLength(2); // Seg e Ter
      expect(screen.getByText('50%')).toBeOnTheScreen(); // Qua
      expect(screen.getByText('30%')).toBeOnTheScreen(); // Qui
      expect(screen.getAllByText('0%')).toHaveLength(3); // Sex, Sáb e Dom
      expect(screen.getByText('R$250')).toBeOnTheScreen();
      expect(screen.getByText('R$30')).toBeOnTheScreen();
      expect(screen.queryByText('R$0')).not.toBeOnTheScreen();
    });

    it('arredonda o valor exibido abaixo da barra', async () => {
      await renderizar({ ...propsDaSemana(semanaCom([87.5, 0, 0, 0, 0, 0, 0])) });

      expect(screen.getByText('R$88')).toBeOnTheScreen();
    });

    it('mostra a legenda do gráfico', async () => {
      await renderizar();

      expect(screen.getByText('Barras mostram o % amortizado de cada dia • Azul = Adiantado')).toBeOnTheScreen();
    });

    it.each([
      ['Seg', 0],
      ['Ter', 1],
      ['Qua', 2],
      ['Qui', 3],
      ['Sex', 4],
      ['Sáb', 5],
      ['Dom', 6],
    ])('tocar na coluna "%s" seleciona o dia %i', async (sigla, indice) => {
      const { onSelecionarDia, onLancarGanho } = await renderizar();

      await fireEvent.press(screen.getByText(sigla));

      expect(onSelecionarDia).toHaveBeenCalledTimes(1);
      expect(onSelecionarDia).toHaveBeenCalledWith(indice);
      expect(onLancarGanho).not.toHaveBeenCalled();
    });

    it('o percentual e o valor fazem parte da área de toque da coluna', async () => {
      const { onSelecionarDia } = await renderizar();

      await fireEvent.press(screen.getByText('30%'));
      await fireEvent.press(screen.getByText('R$250'));

      expect(onSelecionarDia.mock.calls).toEqual([[IDX_QUI], [IDX_SEG]]);
    });

    it('cada barra usa a altura do percentual (mínimo 10%) e a cor do status', async () => {
      await renderizar({ diaSelecionadoIdx: IDX_QUI });

      const barras = preenchimentosDasBarras();
      expect(barras).toHaveLength(7);
      expect(barras.map((b) => ({ height: estiloDe(b).height, cor: estiloDe(b).backgroundColor }))).toEqual([
        { height: '100%', cor: corPorStatus('atingida') },
        { height: '100%', cor: corPorStatus('adiantada') },
        { height: '50%', cor: corPorStatus('parcial') },
        { height: '30%', cor: corPorStatus('parcial') },
        { height: '10%', cor: corPorStatus('pendente') },
        { height: '10%', cor: corPorStatus('pendente') },
        { height: '10%', cor: corPorStatus('pendente') },
      ]);
    });

    it('contorna em branco somente a barra do dia selecionado', async () => {
      await renderizar({ diaSelecionadoIdx: IDX_QUI });

      const comContorno = preenchimentosDasBarras().map((b) => estiloDe(b).borderColor === '#FFFFFF');
      expect(comContorno).toEqual([false, false, false, true, false, false, false]);
    });

    it('destaca a sigla do dia selecionado e marca hoje em verde com um indicador', async () => {
      await renderizar({ diaSelecionadoIdx: IDX_SEG });

      expect(screen.getByText('Seg')).toHaveStyle({ color: '#FFFFFF', fontWeight: '700' });
      expect(screen.getByText('Qua')).toHaveStyle({ color: cores.primaria });
      expect(screen.getByText('Ter')).toHaveStyle({ color: cores.textoApagado });

      const indicadoresDeHoje = screen.container.queryAll((el) => {
        const estilo = estiloDe(el);
        return el.type === 'View' && estilo.width === 4 && estilo.height === 4 && estilo.backgroundColor === cores.primaria;
      });
      expect(indicadoresDeHoje).toHaveLength(1);
    });

    it('pinta de verde o percentual dos dias 100% cobertos', async () => {
      await renderizar({ diaSelecionadoIdx: IDX_QUI });

      for (const rotulo of screen.getAllByText('100%')) {
        expect(rotulo).toHaveStyle({ color: cores.primaria });
      }
      expect(screen.getByText('50%')).toHaveStyle({ color: cores.textoApagado });
    });
  });

  describe('card Regra Amortiza', () => {
    it('mostra dias pagos, meta da semana, valor coberto e o progresso', async () => {
      await renderizar();

      expect(screen.getByText('⚡ Regra Amortiza')).toBeOnTheScreen();
      expect(screen.getByText('2/7 Dias Pagos')).toBeOnTheScreen();
      expect(screen.getByText('Progresso Semanal (Meta: R$ 700.00):')).toBeOnTheScreen();
      expect(screen.getByText('R$ 280.00 cobertos')).toBeOnTheScreen();
      expect(screen.getByText('40% da semana concluída')).toBeOnTheScreen();
    });

    it('a barra de progresso acompanha o percentual coberto', async () => {
      await renderizar();

      const [barraProgresso] = screen.container.queryAll(
        (el) => el.type === 'View' && estiloDe(el).height === '100%' && estiloDe(el).width === '40%'
      );
      expect(barraProgresso).toBeDefined();
      expect(barraProgresso).toHaveStyle({ backgroundColor: cores.primaria });
    });

    it('mostra o impacto do dia selecionado com ganho e meta base', async () => {
      await renderizar({ diaSelecionadoIdx: IDX_SEG });

      expect(screen.getByText('📅 Segunda-feira, 19 de out:')).toBeOnTheScreen();
      expect(screen.getByText('Fez: R$ 250.00 • Meta Base: R$ 100.00')).toBeOnTheScreen();
    });

    it('semana completa: 7/7 dias pagos e 100% concluída', async () => {
      await renderizar({ ...propsDaSemana(semanaCom([700, 0, 0, 0, 0, 0, 0])) });

      expect(screen.getByText('7/7 Dias Pagos')).toBeOnTheScreen();
      expect(screen.getByText('R$ 700.00 cobertos')).toBeOnTheScreen();
      expect(screen.getByText('100% da semana concluída')).toBeOnTheScreen();
    });

    it('semana vazia: 0/7, nada coberto e 0% concluída', async () => {
      await renderizar({ ...propsDaSemana(semanaCom([0, 0, 0, 0, 0, 0, 0])) });

      expect(screen.getByText('R$ 0,00')).toBeOnTheScreen();
      expect(screen.getByText('0/7 Dias Pagos')).toBeOnTheScreen();
      expect(screen.getByText('R$ 0.00 cobertos')).toBeOnTheScreen();
      expect(screen.getByText('0% da semana concluída')).toBeOnTheScreen();
      // 7 barras + o status em destaque do card ("Status: <Text>0%</Text>")
      expect(screen.getAllByText('0%')).toHaveLength(8);
      expect(screen.getAllByText('Status: 0%')).toHaveLength(2);
    });

    it('usa a meta base informada para a meta da semana e o impacto do dia', async () => {
      const semana = semanaCom([150, 0, 0, 0, 0, 0, 0], 150);
      await renderizar({ ...propsDaSemana(semana, 150), diaSelecionadoIdx: IDX_SEG });

      expect(screen.getByText('⚙️ Meta: R$ 150')).toBeOnTheScreen();
      expect(screen.getByText('Progresso Semanal (Meta: R$ 1050.00):')).toBeOnTheScreen();
      expect(screen.getByText('Fez: R$ 150.00 • Meta Base: R$ 150.00')).toBeOnTheScreen();
      expect(screen.getByText('14% da semana concluída')).toBeOnTheScreen();
    });
  });
});
