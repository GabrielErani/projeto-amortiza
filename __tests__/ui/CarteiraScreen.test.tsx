import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { CarteiraScreen } from '../../src/screens/CarteiraScreen';
import { ALVO_TOQUE, cores, textos } from '../../src/theme';
import { DividaItem, RegistroGanhoLocal } from '../../src/types';
import { gerarSemanasDoMes, somarGanhosDoMes } from '../../src/utils/datas';

type Props = React.ComponentProps<typeof CarteiraScreen>;

// Mês fixo: hoje = 21/10/2026. Semanas (seg–dom) que tocam outubro: 28/09, 05/10, 12/10, 19/10 (atual) e 26/10.
const HOJE = new Date(2026, 9, 21);
function ganho(dataISO: string, valor: number): RegistroGanhoLocal {
  return { dataISO, valor, metaDoDia: 100, percentual: Math.min(100, valor), atualizadoEm: '2026-10-21T12:00:00.000Z' };
}
const GANHOS: Record<string, RegistroGanhoLocal> = {
  '2026-10-06': ganho('2026-10-06', 200), // Sem 2
  '2026-10-19': ganho('2026-10-19', 250), // Sem 4
  '2026-10-21': ganho('2026-10-21', 150), // Sem 4
};
const SEMANAS = gerarSemanasDoMes(HOJE, GANHOS);
const IDX_SEMANA_ATUAL = 3;
// O formato dos rótulos é responsabilidade de gerarSemanasDoMes (suíte de utils); a tela só exibe o
// rótulo recebido. Para as semanas que cruzam o mês usamos o rótulo gerado; nas demais, o texto literal.
const ROTULO_SEM_1 = SEMANAS[0].rotulo; // 28/09 a 04/10
const ROTULO_SEM_5 = SEMANAS[4].rotulo; // 26/10 a 01/11

const DIVIDAS: DividaItem[] = [
  { id: 'd1', descricao: 'Combustível', valor: 30, tipo: 'diaria', dataLancamento: '2026-10-01' },
  { id: 'd2', descricao: 'Almoço', valor: 20, tipo: 'diaria', dataLancamento: '2026-10-01' },
  { id: 'm1', descricao: 'Parcela do carro', valor: 800, tipo: 'mensal', dataLancamento: '2026-10-05' },
  { id: 'm2', descricao: 'Seguro', valor: 150, tipo: 'mensal', dataLancamento: '2026-10-05' },
  { id: 'i1', descricao: 'Pneu', valor: 450, tipo: 'imprevista', frequenciaImprevisto: 'anual', dataLancamento: '2026-10-10' },
  { id: 'i2', descricao: 'Lavagem', valor: 50, tipo: 'imprevista', frequenciaImprevisto: 'mensal', dataLancamento: '2026-10-11' },
  { id: 'i3', descricao: 'Estacionamento', valor: 5, tipo: 'imprevista', frequenciaImprevisto: 'diaria', dataLancamento: '2026-10-12' },
];
const divida = (id: string) => DIVIDAS.find((d) => d.id === id)!;

async function renderizar(over: Partial<Props> = {}) {
  const props: Props = {
    totalSemana: 400,
    diasCobertos: 3,
    semanasMes: SEMANAS,
    totalMes: SEMANAS.reduce((acc, sem) => acc + sem.totalGanhos, 0),
    semanaSelecionadaIdx: IDX_SEMANA_ATUAL,
    onSelecionarSemana: jest.fn(),
    dividas: DIVIDAS,
    onNovaDivida: jest.fn(),
    onExcluirDivida: jest.fn(),
    ...over,
  };
  await render(<CarteiraScreen {...props} />);
  return props;
}

// Textos na ordem em que aparecem na tela (percurso em profundidade da árvore).
function textosEmOrdem(): string[] {
  return screen.container
    .queryAll((el) => el.type === 'Text')
    .map((el) => el.children.filter((c): c is string => typeof c === 'string').join(''));
}

describe('CarteiraScreen', () => {
  it('separa as seções "Ganhos" e "Dívidas" com o rótulo em maiúsculas do tema', async () => {
    await renderizar();

    expect(screen.getByText('Ganhos')).toHaveStyle(textos.rotuloMaiusculo);
    expect(screen.getByText('Dívidas')).toHaveStyle(textos.rotuloMaiusculo);
    expect(screen.queryByText('Dívidas e custos')).not.toBeOnTheScreen();
  });

  describe('ganhos', () => {
    it('mostra o total da semana atual e as metas batidas', async () => {
      await renderizar();

      expect(screen.getByText('Semana atual')).toBeOnTheScreen();
      expect(screen.getByText('3/7 metas batidas')).toBeOnTheScreen();
      // R$ 400,00 aparece no card da semana e no detalhe da semana selecionada (Sem 4).
      expect(screen.getAllByText('R$ 400,00')).toHaveLength(2);
    });

    it('mostra o total do mês (soma das semanas) e a quantidade de semanas', async () => {
      await renderizar();

      expect(screen.getByText('Mês')).toBeOnTheScreen();
      expect(screen.getByText('R$ 600,00')).toBeOnTheScreen();
      expect(screen.getByText('5 semanas')).toBeOnTheScreen();
    });

    it('lista as semanas do mês com o total curto e marca a atual', async () => {
      await renderizar();

      expect(SEMANAS).toHaveLength(5);
      expect(screen.getByText(ROTULO_SEM_1)).toBeOnTheScreen();
      expect(screen.getByText('Sem 2 (5–11 out)')).toBeOnTheScreen();
      expect(screen.getByText('Sem 3 (12–18 out)')).toBeOnTheScreen();
      expect(screen.getByText('Sem 4 (19–25 out)')).toBeOnTheScreen();
      expect(screen.getByText(ROTULO_SEM_5)).toBeOnTheScreen();
      expect(screen.getByText('R$ 200')).toBeOnTheScreen();
      expect(screen.getByText('R$ 400')).toBeOnTheScreen();
      expect(screen.getAllByText('R$ 0')).toHaveLength(3);
      // A semana atual é anunciada no nome acessível e ganha o ponto de destaque (como o dia de hoje).
      const atual = screen.getByRole('button', { name: 'Sem 4 (19–25 out), R$ 400,00, semana atual' });
      expect(atual.children).toHaveLength(3);
      expect(screen.getByRole('button', { name: 'Sem 2 (5–11 out), R$ 200,00' }).children).toHaveLength(2);
      expect(screen.getAllByRole('button', { name: /semana atual$/ })).toHaveLength(1);
    });

    it('as pílulas de semana são botões com estado de seleção', async () => {
      await renderizar({ semanaSelecionadaIdx: 1 });

      expect(screen.getByRole('button', { name: 'Sem 2 (5–11 out), R$ 200,00' })).toBeSelected();
      expect(screen.getByRole('button', { name: /^Sem 4/ })).not.toBeSelected();
      expect(screen.getAllByRole('button', { selected: true })).toHaveLength(1);
      expect(screen.getByRole('button', { name: 'Sem 2 (5–11 out), R$ 200,00' })).toHaveStyle({ backgroundColor: cores.primaria });
    });

    it('mostra o detalhe da semana selecionada', async () => {
      await renderizar({ semanaSelecionadaIdx: 1 });

      expect(screen.getByText('Sem 2 (5–11 out): R$ 200,00')).toBeOnTheScreen();
    });

    it('tocar numa semana chama onSelecionarSemana com o índice', async () => {
      const props = await renderizar();

      await fireEvent.press(screen.getByText('Sem 2 (5–11 out)'));
      expect(props.onSelecionarSemana).toHaveBeenLastCalledWith(1);

      await fireEvent.press(screen.getByText('R$ 200'));
      expect(props.onSelecionarSemana).toHaveBeenLastCalledWith(1);

      await fireEvent.press(screen.getByText(ROTULO_SEM_5));
      expect(props.onSelecionarSemana).toHaveBeenLastCalledWith(4);
    });

    it('índice de semana inválido cai na primeira semana', async () => {
      await renderizar({ semanaSelecionadaIdx: 42 });

      expect(screen.getByText(`${ROTULO_SEM_1}: R$ 0,00`)).toBeOnTheScreen();
    });

    it('sem semanas: mês zerado e sem detalhe', async () => {
      await renderizar({ semanasMes: [], totalMes: 0, totalSemana: 0, diasCobertos: 0 });

      expect(screen.getByText('0 semanas')).toBeOnTheScreen();
      expect(screen.getByText('0/7 metas batidas')).toBeOnTheScreen();
      expect(screen.getAllByText('R$ 0,00')).toHaveLength(2);
      expect(screen.queryByText(/^Sem \d/)).not.toBeOnTheScreen();
    });

    // BUG documentado (ver relatório): gerarSemanasDoMes soma os 7 dias de cada semana, inclusive os de
    // setembro/novembro nas semanas das bordas, e o card "Mês" soma essas semanas.
    it('o total do mês não inclui ganhos de dias de outros meses', async () => {
      const semanas = gerarSemanasDoMes(HOJE, {
        '2026-09-30': ganho('2026-09-30', 50), // setembro, mas cai na "Sem 1" de outubro
        '2026-11-01': ganho('2026-11-01', 70), // novembro, mas cai na "Sem 5" de outubro
      });
      // O App calcula o total do mês com somarGanhosDoMes (só dias de outubro) e passa pronto para a tela.
      await renderizar({ semanasMes: semanas, totalMes: somarGanhosDoMes(HOJE, {
        '2026-09-30': ganho('2026-09-30', 50),
        '2026-11-01': ganho('2026-11-01', 70),
      }), totalSemana: 0, diasCobertos: 0 });

      // Nenhum ganho em outubro → o card "Mês" mostra R$ 0,00, e não a soma das semanas (R$ 120,00).
      expect(screen.queryByText('R$ 120,00')).not.toBeOnTheScreen();
      expect(screen.getAllByText('R$ 0,00').length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('dívidas e custos', () => {
    it('mostra a projeção anual total e o detalhamento por tipo', async () => {
      await renderizar();

      expect(screen.getByText('Projeção anual')).toBeOnTheScreen();
      // (30+20)×365 + (800+150)×12 + (450 + 50×12 + 5×365) = 18.250 + 11.400 + 2.875
      expect(screen.getByText('R$ 32.525,00')).toBeOnTheScreen();
      expect(screen.getByText('Diárias ×365')).toBeOnTheScreen();
      expect(screen.getByText('R$ 18.250')).toBeOnTheScreen();
      expect(screen.getByText('Mensais ×12')).toBeOnTheScreen();
      expect(screen.getByText('R$ 11.400')).toBeOnTheScreen();
      // "Imprevistos" é rótulo do detalhamento e também título da seção.
      expect(screen.getAllByText('Imprevistos')).toHaveLength(2);
      expect(screen.getByText('R$ 2.875')).toBeOnTheScreen();
    });

    it('mostra os totais diário, mensal e anual (imprevistos) de cada seção', async () => {
      await renderizar();

      expect(screen.getByText('R$ 50,00/dia')).toBeOnTheScreen();
      expect(screen.getByText('R$ 950,00/mês')).toBeOnTheScreen();
      expect(screen.getByText('R$ 2.875,00/ano')).toBeOnTheScreen();
    });

    it('lista cada dívida dentro da seção do seu tipo', async () => {
      await renderizar();

      const textos = textosEmOrdem();
      const pos = (t: string) => {
        const i = textos.indexOf(t);
        expect(i).toBeGreaterThanOrEqual(0);
        return i;
      };
      const [diarias, mensais, imprevistos] = [pos('Gastos diários'), pos('Dívidas mensais'), textos.lastIndexOf('Imprevistos')];
      for (const item of ['Combustível', 'Almoço']) {
        expect(pos(item)).toBeGreaterThan(diarias);
        expect(pos(item)).toBeLessThan(mensais);
      }
      for (const item of ['Parcela do carro', 'Seguro']) {
        expect(pos(item)).toBeGreaterThan(mensais);
        expect(pos(item)).toBeLessThan(imprevistos);
      }
      for (const item of ['Pneu', 'Lavagem', 'Estacionamento']) {
        expect(pos(item)).toBeGreaterThan(imprevistos);
      }
    });

    it('cada item mostra valor com o sufixo do tipo e a projeção anual', async () => {
      await renderizar();

      // Diárias: valor/dia e ×365 por ano
      expect(screen.getByText('R$ 30,00/dia')).toBeOnTheScreen();
      expect(screen.getByText('R$ 10.950/ano')).toBeOnTheScreen();
      expect(screen.getByText('R$ 20,00/dia')).toBeOnTheScreen();
      expect(screen.getByText('R$ 7.300/ano')).toBeOnTheScreen();
      // Mensais: valor/mês e ×12 por ano
      expect(screen.getByText('R$ 800,00/mês')).toBeOnTheScreen();
      expect(screen.getByText('R$ 9.600/ano')).toBeOnTheScreen();
      expect(screen.getByText('R$ 150,00/mês')).toBeOnTheScreen();
      expect(screen.getByText('R$ 1.800/ano')).toBeOnTheScreen();
      // Imprevistos: frequência + projeção; valor sem sufixo
      expect(screen.getByText('Anual / Pontual · R$ 450/ano')).toBeOnTheScreen();
      expect(screen.getByText('R$ 450,00')).toBeOnTheScreen();
      expect(screen.getByText('Mensal · R$ 600/ano')).toBeOnTheScreen();
      expect(screen.getByText('R$ 50,00')).toBeOnTheScreen();
      expect(screen.getByText('Diária · R$ 1.825/ano')).toBeOnTheScreen();
      expect(screen.getByText('R$ 5,00')).toBeOnTheScreen();
    });

    it('imprevisto sem frequência é tratado como anual/pontual', async () => {
      await renderizar({
        dividas: [{ id: 'x', descricao: 'Multa', valor: 195.23, tipo: 'imprevista', dataLancamento: '2026-10-02' }],
      });

      expect(screen.getByText('Anual / Pontual · R$ 195/ano')).toBeOnTheScreen();
      // Valor do item e projeção anual total coincidem (único item, frequência anual).
      expect(screen.getAllByText('R$ 195,23')).toHaveLength(2);
      expect(screen.getByText('R$ 195,23/ano')).toBeOnTheScreen();
    });

    it('os botões "+ Adicionar" de cada seção chamam onNovaDivida com o tipo', async () => {
      const props = await renderizar();

      const botoes = screen.getAllByRole('button', { name: '+ Adicionar' });
      expect(botoes).toHaveLength(3);
      for (const botao of botoes) {
        await fireEvent.press(botao);
      }

      expect(jest.mocked(props.onNovaDivida).mock.calls).toEqual([['diaria'], ['mensal'], ['imprevista']]);
    });

    it('excluir chama onExcluirDivida com o item correspondente', async () => {
      const props = await renderizar();

      await fireEvent.press(screen.getByLabelText('Excluir Parcela do carro'));
      await fireEvent.press(screen.getByLabelText('Excluir Estacionamento'));

      expect(jest.mocked(props.onExcluirDivida).mock.calls).toEqual([[divida('m1')], [divida('i3')]]);
    });

    it('os botões "✕" têm papel de botão e alvo de toque de 44', async () => {
      await renderizar();

      const excluir = screen.getByRole('button', { name: 'Excluir Combustível' });
      expect(excluir).toHaveTextContent('✕');
      expect(excluir).toHaveStyle({ width: ALVO_TOQUE, height: ALVO_TOQUE });
      expect(screen.getAllByRole('button', { name: /^Excluir / })).toHaveLength(DIVIDAS.length);
    });

    it('"+ Adicionar" tem alvo de toque mínimo e o tom primário suave', async () => {
      await renderizar();

      for (const botao of screen.getAllByRole('button', { name: '+ Adicionar' })) {
        expect(botao).toHaveStyle({ minHeight: ALVO_TOQUE, backgroundColor: cores.primariaSuave });
      }
    });

    it('a projeção anual fica em destaque na cor de erro e os imprevistos também', async () => {
      await renderizar();

      expect(screen.getByText('R$ 32.525,00')).toHaveStyle({ color: cores.erro });
      expect(screen.getByText('R$ 450,00')).toHaveStyle({ color: cores.erro });
      expect(screen.getByText('R$ 30,00/dia')).toHaveStyle({ color: cores.texto });
    });

    it('sem dívidas: mostra os exemplos de cada seção e totais zerados', async () => {
      await renderizar({ dividas: [] });

      expect(screen.getByText('Ex.: combustível, almoço.')).toBeOnTheScreen();
      expect(screen.getByText('Ex.: parcela, seguro, plano.')).toBeOnTheScreen();
      expect(screen.getByText('Ex.: manutenção, multa.')).toBeOnTheScreen();
      expect(screen.getByText('R$ 0,00/dia')).toBeOnTheScreen();
      expect(screen.getByText('R$ 0,00/mês')).toBeOnTheScreen();
      expect(screen.getByText('R$ 0,00/ano')).toBeOnTheScreen();
      expect(screen.queryByLabelText(/^Excluir /)).not.toBeOnTheScreen();
      expect(screen.getAllByRole('button', { name: '+ Adicionar' })).toHaveLength(3);
    });

    it('seção com itens esconde o exemplo; seções vazias continuam mostrando', async () => {
      await renderizar({ dividas: [divida('m1')] });

      expect(screen.queryByText('Ex.: parcela, seguro, plano.')).not.toBeOnTheScreen();
      expect(screen.getByText('Ex.: combustível, almoço.')).toBeOnTheScreen();
      expect(screen.getByText('Ex.: manutenção, multa.')).toBeOnTheScreen();
    });
  });
});
