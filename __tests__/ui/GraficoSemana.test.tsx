import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { GraficoSemana } from '../../src/components/GraficoSemana';
import { cores, tamanho } from '../../src/theme';
import { GanhoDia } from '../../src/types';
import { calcularAmortizacaoPorFases } from '../../src/utils/amortizacao';
import { gerarEstruturaSemana } from '../../src/utils/datas';

// Semana fixa: quarta-feira, 21/10/2026 (semana de 19 a 25 de outubro), meta de R$ 100/dia.
// Ganhos: Seg 250 (excedente cobre Ter e parte de Qua), Qua 30, Sex 120 (excedente cobre parte de Sáb).
const HOJE = new Date(2026, 9, 21);
function semana(valores: number[], meta = 100): GanhoDia[] {
  const estrutura = gerarEstruturaSemana(HOJE).map((d, i) => ({ ...d, valor: valores[i] ?? 0, temRegistro: (valores[i] ?? 0) > 0 }));
  return calcularAmortizacaoPorFases(estrutura, meta);
}
const DIAS = semana([250, 0, 30, 0, 120, 0, 0]);

type Elemento = ReturnType<typeof screen.getByRole>;

// Preenchimento da barra: única View da coluna com altura percentual (string).
function preenchimentoDa(barra: Elemento) {
  return barra.queryAll((el) => el.type === 'View' && typeof StyleSheet.flatten(el.props.style)?.height === 'string')[0];
}

// Trilha: pai do preenchimento. Ponto de hoje: View de 4px sob a sigla.
const trilhaDa = (barra: Elemento) => preenchimentoDa(barra).parent!;
const pontoDeHojeDa = (barra: Elemento) =>
  barra.queryAll((el) => el.type === 'View' && StyleSheet.flatten(el.props.style)?.width === tamanho.pontoMini)[0];

describe('GraficoSemana', () => {
  it('renderiza uma barra (botão) por dia, com rótulo acessível de dia e percentual', async () => {
    await render(<GraficoSemana dias={DIAS} selecionadoIdx={2} onSelecionar={jest.fn()} />);

    const barras = screen.getAllByRole('button');
    expect(barras).toHaveLength(7);
    expect(barras.map((b) => b.props.accessibilityLabel)).toEqual([
      'Segunda-feira, 19 de out, 100% da meta',
      'Terça-feira, 20 de out, 100% da meta',
      'Quarta-feira, 21 de out, 80% da meta',
      'Quinta-feira, 22 de out, 0% da meta',
      'Sexta-feira, 23 de out, 100% da meta',
      'Sábado, 24 de out, 20% da meta',
      'Domingo, 25 de out, 0% da meta',
    ]);
  });

  it('mostra o percentual acima e a sigla abaixo de cada barra', async () => {
    await render(<GraficoSemana dias={DIAS} selecionadoIdx={2} onSelecionar={jest.fn()} />);

    const quarta = screen.getByRole('button', { name: 'Quarta-feira, 21 de out, 80% da meta' });
    expect(quarta).toHaveTextContent('80%Qua');

    expect(screen.getAllByText('100%')).toHaveLength(3);
    expect(screen.getAllByText('0%')).toHaveLength(2);
    expect(screen.getByText('20%')).toBeOnTheScreen();
    for (const sigla of ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']) {
      expect(screen.getByText(sigla)).toBeOnTheScreen();
    }
  });

  it('o gráfico não repete valores em reais (o valor do dia fica no card)', async () => {
    await render(<GraficoSemana dias={DIAS} selecionadoIdx={0} onSelecionar={jest.fn()} />);

    for (const barra of screen.getAllByRole('button')) {
      expect(barra).not.toHaveTextContent(/R\$/);
    }
  });

  it('pinta o percentual com a cor do status (dia sem cobertura fica apagado)', async () => {
    await render(<GraficoSemana dias={DIAS} selecionadoIdx={0} onSelecionar={jest.fn()} />);

    const pct = (rotulo: string) => screen.getByRole('button', { name: rotulo }).children[0];
    expect(pct('Segunda-feira, 19 de out, 100% da meta')).toHaveStyle({ color: cores.primaria });
    expect(pct('Terça-feira, 20 de out, 100% da meta')).toHaveStyle({ color: cores.info });
    expect(pct('Quarta-feira, 21 de out, 80% da meta')).toHaveStyle({ color: cores.alerta });
    expect(pct('Quinta-feira, 22 de out, 0% da meta')).toHaveStyle({ color: cores.textoApagado });
  });

  it('tocar numa barra seleciona o índice do dia', async () => {
    const onSelecionar = jest.fn();
    await render(<GraficoSemana dias={DIAS} selecionadoIdx={2} onSelecionar={onSelecionar} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Sexta-feira, 23 de out, 100% da meta' }));
    expect(onSelecionar).toHaveBeenLastCalledWith(4);

    await fireEvent.press(screen.getByText('Seg'));
    expect(onSelecionar).toHaveBeenLastCalledWith(0);
    expect(onSelecionar).toHaveBeenCalledTimes(2);
  });

  it('destaca visualmente a barra selecionada (sigla forte e contorno na trilha)', async () => {
    await render(<GraficoSemana dias={DIAS} selecionadoIdx={4} onSelecionar={jest.fn()} />);

    expect(screen.getByText('Sex')).toHaveStyle({ color: cores.texto, fontWeight: '700' });
    expect(screen.getByText('Qui')).toHaveStyle({ color: cores.textoApagado });
    const sexta = screen.getByRole('button', { name: 'Sexta-feira, 23 de out, 100% da meta' });
    expect(trilhaDa(sexta)).toHaveStyle({ borderWidth: tamanho.contorno, borderColor: cores.contorno });
    expect(trilhaDa(screen.getByRole('button', { name: 'Quinta-feira, 22 de out, 0% da meta' }))).not.toHaveStyle({
      borderColor: cores.contorno,
    });
  });

  it('expõe a seleção para leitores de tela (accessibilityState.selected)', async () => {
    await render(<GraficoSemana dias={DIAS} selecionadoIdx={4} onSelecionar={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'Sexta-feira, 23 de out, 100% da meta' })).toBeSelected();
    expect(screen.getAllByRole('button', { selected: true })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Quarta-feira, 21 de out, 80% da meta' })).not.toBeSelected();
  });

  it('marca o dia de hoje com um ponto sob a sigla', async () => {
    await render(<GraficoSemana dias={DIAS} selecionadoIdx={0} onSelecionar={jest.fn()} />);

    const pontos = screen.getAllByRole('button').map((barra) => StyleSheet.flatten(pontoDeHojeDa(barra).props.style).backgroundColor);
    // Só a quarta (hoje) tem o ponto visível; os outros dias reservam o espaço com um ponto transparente.
    expect(pontos).toEqual([
      cores.transparente, cores.transparente, cores.primaria, cores.transparente,
      cores.transparente, cores.transparente, cores.transparente,
    ]);
    expect(screen.getByText('Qua')).toHaveStyle({ color: cores.textoApagado });
  });

  it('preenche cada barra na cor do status, com altura mínima visível de 8% (token barraMinimaPct)', async () => {
    expect(tamanho.barraMinimaPct).toBe(8);
    await render(<GraficoSemana dias={DIAS} selecionadoIdx={0} onSelecionar={jest.fn()} />);

    const esperado: Array<[string, string, string]> = [
      ['Segunda-feira, 19 de out, 100% da meta', '100%', cores.primaria], // atingida
      ['Terça-feira, 20 de out, 100% da meta', '100%', cores.info], // adiantada
      ['Quarta-feira, 21 de out, 80% da meta', '80%', cores.alerta], // parcial
      ['Quinta-feira, 22 de out, 0% da meta', '8%', cores.neutro], // pendente → altura mínima
    ];
    for (const [rotulo, altura, cor] of esperado) {
      expect(preenchimentoDa(screen.getByRole('button', { name: rotulo }))).toHaveStyle({ height: altura, backgroundColor: cor });
    }
  });

  it('mostra a legenda de status', async () => {
    await render(<GraficoSemana dias={DIAS} selecionadoIdx={0} onSelecionar={jest.fn()} />);

    expect(screen.getByText('Meta batida')).toBeOnTheScreen();
    expect(screen.getByText('Adiantado')).toBeOnTheScreen();
    expect(screen.getByText('Parcial')).toBeOnTheScreen();
  });

  it('sem dias, mostra apenas a legenda', async () => {
    await render(<GraficoSemana dias={[]} selecionadoIdx={0} onSelecionar={jest.fn()} />);

    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
    expect(screen.getByText('Meta batida')).toBeOnTheScreen();
  });
});
