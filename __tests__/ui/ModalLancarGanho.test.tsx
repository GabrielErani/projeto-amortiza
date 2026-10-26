// Testes de src/components/ModalLancarGanho.tsx nos três estados:
//  1) analisando o print (OCR), 2) confirmação do valor lido e 3) formulário manual
//     (seletor de dias, atalhos +50/+100/+150/+200/Limpar e escolha entre somar ou substituir).
//
// A semana vem das funções reais de src/utils para quarta-feira, 21/10/2026 (hoje = índice 2).

import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { TestInstance } from 'test-renderer';
import { ModalLancarGanho, type ModalLancarGanhoProps } from '../../src/components/ModalLancarGanho';
import { cores } from '../../src/theme';
import type { GanhoDia } from '../../src/types';
import { calcularAmortizacaoPorFases } from '../../src/utils/amortizacao';
import { gerarEstruturaSemana } from '../../src/utils/datas';

const HOJE = new Date(2026, 9, 21, 10, 0);
const IDX_SEG = 0;
const IDX_QUA = 2; // hoje
const SIGLAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

function semanaCom(valores: number[]): GanhoDia[] {
  const estrutura = gerarEstruturaSemana(HOJE).map((dia, i) =>
    valores[i] ? { ...dia, valor: valores[i], temRegistro: true } : dia
  );
  return calcularAmortizacaoPorFases(estrutura, 100);
}

const SEMANA_VAZIA = semanaCom([0, 0, 0, 0, 0, 0, 0]);
const SEMANA_COM_80_HOJE = semanaCom([0, 0, 80, 0, 0, 0, 0]);

async function renderizar(props: Partial<ModalLancarGanhoProps> = {}) {
  const callbacks = {
    onSelecionarDia: jest.fn(),
    onAlterarValor: jest.fn(),
    onSalvar: jest.fn(),
    onDigitarManualmente: jest.fn(),
    onFechar: jest.fn(),
  };
  await render(
    <ModalLancarGanho
      visivel
      diasSemana={SEMANA_VAZIA}
      diaLancamentoIdx={IDX_QUA}
      valorDigitado=""
      salvando={false}
      analisandoOCR={false}
      ocrConfirmacaoPronta={false}
      valorExtraidoOCR={0}
      {...callbacks}
      {...props}
    />
  );
  return callbacks;
}

const modaisAbertos = () => screen.container.queryAll((el) => el.type === 'Modal');
const spinners = () => screen.container.queryAll((el) => el.type === 'ActivityIndicator');
const campoValor = () => screen.getByPlaceholderText('0.00');
const estiloDe = (el: TestInstance) => StyleSheet.flatten(el.props.style) ?? {};

const PROPS_CONFIRMACAO = { ocrConfirmacaoPronta: true, valorExtraidoOCR: 1234.5, valorDigitado: '1234.50' };

describe('ModalLancarGanho', () => {
  it('não mostra nada quando está fechado', async () => {
    await renderizar({ visivel: false });

    expect(modaisAbertos()).toHaveLength(0);
    expect(screen.queryByText('Lançar Ganho')).not.toBeOnTheScreen();
  });

  it('abre como bottom sheet transparente com slide', async () => {
    await renderizar();

    const [modal] = modaisAbertos();
    expect(modal).toHaveProp('transparent', true);
    expect(modal).toHaveProp('animationType', 'slide');
  });

  it('o botão "voltar" do Android (onRequestClose) chama onFechar', async () => {
    const { onFechar } = await renderizar();

    await fireEvent(modaisAbertos()[0], 'requestClose');

    expect(onFechar).toHaveBeenCalledTimes(1);
  });

  // ─── 1) ANALISANDO ──────────────────────────────────────────────────────────
  describe('estado "analisando o print"', () => {
    it('mostra o indicador de carregamento e as mensagens da análise', async () => {
      await renderizar({ analisandoOCR: true });

      expect(spinners()).toHaveLength(1);
      expect(screen.getByText('Analisando captura de tela...')).toBeOnTheScreen();
      expect(screen.getByText('Extraindo valores via OCR On-Device')).toBeOnTheScreen();
    });

    it('esconde o formulário e a confirmação, mesmo com a confirmação já pronta', async () => {
      await renderizar({ analisandoOCR: true, ...PROPS_CONFIRMACAO });

      expect(screen.queryByText('Lançar Ganho')).not.toBeOnTheScreen();
      expect(screen.queryByText('✓ OCR Concluído')).not.toBeOnTheScreen();
      expect(screen.queryByText('Cancelar')).not.toBeOnTheScreen();
    });
  });

  // ─── 2) CONFIRMAÇÃO DO OCR ──────────────────────────────────────────────────
  describe('estado "confirmação do OCR"', () => {
    it('mostra o valor lido em pt-BR e o dia do lançamento', async () => {
      await renderizar({ ...PROPS_CONFIRMACAO, diaLancamentoIdx: IDX_QUA });

      expect(screen.getByText('✓ OCR Concluído')).toBeOnTheScreen();
      expect(
        screen.getByText('Encontramos o valor de R$ 1.234,50 para Quarta-feira, 21 de out. Como deseja salvar?')
      ).toBeOnTheScreen();
      expect(screen.getByText('R$ 1.234,50')).toHaveStyle({ color: '#00D26A', fontWeight: '800' });
      expect(screen.queryByText('Lançar Ganho')).not.toBeOnTheScreen();
      expect(screen.queryByText('Seg')).not.toBeOnTheScreen(); // sem seletor de dias
      expect(spinners()).toHaveLength(0);
    });

    it('dia sem ganho: só "Confirmar e Salvar", que substitui o valor do dia', async () => {
      const { onSalvar } = await renderizar({ ...PROPS_CONFIRMACAO, diasSemana: SEMANA_VAZIA });

      expect(screen.queryByText(/^\+ Somar aos/)).not.toBeOnTheScreen();
      await fireEvent.press(screen.getByText('Confirmar e Salvar'));

      expect(onSalvar).toHaveBeenCalledTimes(1);
      expect(onSalvar).toHaveBeenCalledWith('substituir');
    });

    it('dia com ganho: oferece somar ao valor existente (com o total) ou substituir', async () => {
      const { onSalvar } = await renderizar({ ...PROPS_CONFIRMACAO, diasSemana: SEMANA_COM_80_HOJE });

      expect(screen.queryByText('Confirmar e Salvar')).not.toBeOnTheScreen();
      await fireEvent.press(screen.getByText('+ Somar aos R$ 80.00 (Total: R$ 1314.50)'));
      await fireEvent.press(screen.getByText('Substituir por R$ 1234.50'));

      expect(onSalvar.mock.calls).toEqual([['somar'], ['substituir']]);
    });

    it('"Digitar Manualmente" volta para o formulário via onDigitarManualmente', async () => {
      const { onDigitarManualmente, onSalvar } = await renderizar(PROPS_CONFIRMACAO);

      await fireEvent.press(screen.getByText('Digitar Manualmente'));

      expect(onDigitarManualmente).toHaveBeenCalledTimes(1);
      expect(onSalvar).not.toHaveBeenCalled();
    });

    it('durante o salvamento troca "Somar" pelo indicador e bloqueia os dois botões', async () => {
      const { onSalvar, onDigitarManualmente } = await renderizar({
        ...PROPS_CONFIRMACAO,
        diasSemana: SEMANA_COM_80_HOJE,
        salvando: true,
      });

      expect(screen.queryByText(/^\+ Somar aos/)).not.toBeOnTheScreen();
      const [spinner] = spinners();
      expect(spinner).toBeDisabled();
      expect(screen.getByText('Substituir por R$ 1234.50')).toBeDisabled();

      await fireEvent.press(spinner);
      await fireEvent.press(screen.getByText('Substituir por R$ 1234.50'));
      await fireEvent.press(screen.getByText('Digitar Manualmente'));

      expect(onSalvar).not.toHaveBeenCalled();
      expect(onDigitarManualmente).toHaveBeenCalledTimes(1);
    });

    it('durante o salvamento bloqueia "Confirmar e Salvar" no dia sem ganho', async () => {
      const { onSalvar } = await renderizar({ ...PROPS_CONFIRMACAO, salvando: true });

      expect(screen.getByText('Confirmar e Salvar')).toBeDisabled();
      await fireEvent.press(screen.getByText('Confirmar e Salvar'));

      expect(onSalvar).not.toHaveBeenCalled();
    });

    it('usa o dia do lançamento informado (não necessariamente hoje)', async () => {
      await renderizar({ ...PROPS_CONFIRMACAO, diaLancamentoIdx: IDX_SEG });

      expect(
        screen.getByText('Encontramos o valor de R$ 1.234,50 para Segunda-feira, 19 de out. Como deseja salvar?')
      ).toBeOnTheScreen();
    });
  });

  // ─── 3) FORMULÁRIO MANUAL ───────────────────────────────────────────────────
  describe('formulário manual', () => {
    it('mostra título, instrução, os 7 dias, o dia escolhido (hoje), o campo e as ações', async () => {
      await renderizar({ diaLancamentoIdx: IDX_QUA });

      expect(screen.getByText('Lançar Ganho')).toBeOnTheScreen();
      expect(screen.getByText('Selecione o dia e informe o valor:')).toBeOnTheScreen();
      for (const sigla of SIGLAS) {
        expect(screen.getByText(sigla)).toBeOnTheScreen();
      }
      expect(screen.getByText('📅 Quarta-feira, 21 de out (Hoje)')).toBeOnTheScreen();
      expect(screen.getByText('Quanto você fez? (R$)')).toBeOnTheScreen();
      expect(campoValor()).toHaveDisplayValue('');
      expect(screen.getByText('Salvar Ganho')).toBeOnTheScreen();
      expect(screen.getByText('Cancelar')).toBeOnTheScreen();
      expect(screen.queryByText(/Já registrado/)).not.toBeOnTheScreen();
    });

    it('não marca "(Hoje)" quando o dia escolhido não é hoje', async () => {
      await renderizar({ diaLancamentoIdx: IDX_SEG });

      expect(screen.getByText('📅 Segunda-feira, 19 de out')).toBeOnTheScreen();
      expect(screen.queryByText(/\(Hoje\)/)).not.toBeOnTheScreen();
    });

    it('com índice fora da semana, usa a segunda-feira', async () => {
      await renderizar({ diaLancamentoIdx: 10 });

      expect(screen.getByText('📅 Segunda-feira, 19 de out')).toBeOnTheScreen();
    });

    it.each(SIGLAS.map((sigla, indice) => [sigla, indice] as const))(
      'a pílula "%s" seleciona o dia %i',
      async (sigla, indice) => {
        const { onSelecionarDia } = await renderizar();

        await fireEvent.press(screen.getByText(sigla));

        expect(onSelecionarDia).toHaveBeenCalledTimes(1);
        expect(onSelecionarDia).toHaveBeenCalledWith(indice);
      }
    );

    it('destaca a pílula do dia escolhido e marca hoje com um ponto', async () => {
      await renderizar({ diaLancamentoIdx: IDX_SEG });

      expect(screen.getByText('Seg').parent).toHaveStyle({ backgroundColor: cores.primaria });
      expect(screen.getByText('Seg')).toHaveStyle({ color: cores.primariaTexto });
      expect(screen.getByText('Qua').parent).toHaveStyle({ backgroundColor: cores.superficieAlta });

      const pontos = screen.container.queryAll(
        (el) => el.type === 'View' && estiloDe(el).width === 4 && estiloDe(el).backgroundColor === cores.info
      );
      expect(pontos).toHaveLength(1);
      expect(pontos[0].parent).toBe(screen.getByText('Qua').parent);
    });

    it('campo numérico com foco automático; o texto digitado vai para onAlterarValor', async () => {
      const { onAlterarValor } = await renderizar({ valorDigitado: '75' });

      expect(campoValor()).toHaveDisplayValue('75');
      expect(campoValor()).toHaveProp('keyboardType', 'numeric');
      expect(campoValor()).toHaveProp('autoFocus', true);

      await fireEvent.changeText(campoValor(), '120,50');

      expect(onAlterarValor).toHaveBeenCalledWith('120,50');
    });

    it.each([
      ['+50', '50'],
      ['+100', '100'],
      ['+150', '150'],
      ['+200', '200'],
      ['Limpar', ''],
    ])('o atalho "%s" define o valor como %j', async (atalho, valor) => {
      const { onAlterarValor } = await renderizar({ valorDigitado: '30' });

      await fireEvent.press(screen.getByText(atalho));

      expect(onAlterarValor).toHaveBeenCalledTimes(1);
      expect(onAlterarValor).toHaveBeenCalledWith(valor);
    });

    it('os atalhos substituem o valor digitado (não acumulam)', async () => {
      const { onAlterarValor } = await renderizar({ valorDigitado: '50' });

      await fireEvent.press(screen.getByText('+50'));
      await fireEvent.press(screen.getByText('+50'));

      expect(onAlterarValor.mock.calls).toEqual([['50'], ['50']]);
    });

    it('dia sem ganho: "Salvar Ganho" soma (mesmo com valor digitado)', async () => {
      const { onSalvar } = await renderizar({ valorDigitado: '150' });

      expect(screen.queryByText(/^Substituir por/)).not.toBeOnTheScreen();
      await fireEvent.press(screen.getByText('Salvar Ganho'));

      expect(onSalvar).toHaveBeenCalledTimes(1);
      expect(onSalvar).toHaveBeenCalledWith('somar');
    });

    describe('dia que já tem ganho', () => {
      it('avisa o valor já registrado e pergunta quanto adicionar', async () => {
        await renderizar({ diasSemana: SEMANA_COM_80_HOJE });

        expect(screen.getByText('💡 Já registrado neste dia: R$ 80.00')).toBeOnTheScreen();
        expect(screen.getByText('Quanto quer adicionar a mais? (R$)')).toBeOnTheScreen();
        expect(screen.queryByText('Quanto você fez? (R$)')).not.toBeOnTheScreen();
      });

      it('sem valor digitado, "Salvar Ganho" substitui', async () => {
        const { onSalvar } = await renderizar({ diasSemana: SEMANA_COM_80_HOJE, valorDigitado: '' });

        await fireEvent.press(screen.getByText('Salvar Ganho'));

        expect(onSalvar).toHaveBeenCalledWith('substituir');
      });

      it('com valor digitado, mostra o novo total e oferece somar ou substituir', async () => {
        const { onSalvar } = await renderizar({ diasSemana: SEMANA_COM_80_HOJE, valorDigitado: '50' });

        expect(screen.queryByText('Salvar Ganho')).not.toBeOnTheScreen();
        await fireEvent.press(screen.getByText('+ Somar R$ 50.00 (Novo Total: R$ 130.00)'));
        await fireEvent.press(screen.getByText('Substituir por R$ 50.00'));

        expect(onSalvar.mock.calls).toEqual([['somar'], ['substituir']]);
      });

      it('entende valores no formato brasileiro na prévia', async () => {
        await renderizar({ diasSemana: SEMANA_COM_80_HOJE, valorDigitado: '1.250,50' });

        expect(screen.getByText('+ Somar R$ 1250.50 (Novo Total: R$ 1330.50)')).toBeOnTheScreen();
        expect(screen.getByText('Substituir por R$ 1250.50')).toBeOnTheScreen();
      });

      it('texto inválido conta como zero e volta ao botão único "Salvar Ganho"', async () => {
        await renderizar({ diasSemana: SEMANA_COM_80_HOJE, valorDigitado: 'abc' });

        expect(screen.getByText('Salvar Ganho')).toBeOnTheScreen();
        expect(screen.queryByText(/^\+ Somar/)).not.toBeOnTheScreen();
      });

      it('durante o salvamento troca "Somar" pelo indicador e bloqueia somar e substituir', async () => {
        const { onSalvar } = await renderizar({
          diasSemana: SEMANA_COM_80_HOJE,
          valorDigitado: '50',
          salvando: true,
        });

        expect(screen.queryByText(/^\+ Somar/)).not.toBeOnTheScreen();
        const [spinner] = spinners();
        expect(spinner).toBeDisabled();
        expect(screen.getByText('Substituir por R$ 50.00')).toBeDisabled();

        await fireEvent.press(spinner);
        await fireEvent.press(screen.getByText('Substituir por R$ 50.00'));

        expect(onSalvar).not.toHaveBeenCalled();
      });
    });

    it('durante o salvamento troca "Salvar Ganho" pelo indicador e bloqueia o botão', async () => {
      const { onSalvar, onFechar } = await renderizar({ valorDigitado: '150', salvando: true });

      expect(screen.queryByText('Salvar Ganho')).not.toBeOnTheScreen();
      const [spinner] = spinners();
      expect(spinner).toBeDisabled();
      await fireEvent.press(spinner);
      expect(onSalvar).not.toHaveBeenCalled();

      // "Cancelar" continua disponível
      await fireEvent.press(screen.getByText('Cancelar'));
      expect(onFechar).toHaveBeenCalledTimes(1);
    });

    it('"Cancelar" chama onFechar sem salvar', async () => {
      const { onFechar, onSalvar } = await renderizar({ valorDigitado: '150' });

      await fireEvent.press(screen.getByText('Cancelar'));

      expect(onFechar).toHaveBeenCalledTimes(1);
      expect(onSalvar).not.toHaveBeenCalled();
    });
  });
});
