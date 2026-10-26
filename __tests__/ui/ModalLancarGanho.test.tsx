import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ModalLancarGanho } from '../../src/components/ModalLancarGanho';
import { cores } from '../../src/theme';
import { GanhoDia } from '../../src/types';
import { calcularAmortizacaoPorFases } from '../../src/utils/amortizacao';
import { gerarEstruturaSemana } from '../../src/utils/datas';

type Props = React.ComponentProps<typeof ModalLancarGanho>;

// Semana fixa de 19 a 25/10/2026, "hoje" = quarta (índice 2), que já tem R$ 30 lançados.
const HOJE = new Date(2026, 9, 21);
const DIAS: GanhoDia[] = calcularAmortizacaoPorFases(
  gerarEstruturaSemana(HOJE).map((d, i) => (i === 2 ? { ...d, valor: 30, temRegistro: true } : d)),
  100,
);
const IDX_QUARTA = 2; // hoje, com ganho existente
const IDX_QUINTA = 3; // sem ganho

const indicadoresDeCarregamento = () =>
  screen.container.queryAll((el) => el.type === 'ActivityIndicator');
const nomesDosBotoes = () => screen.getAllByRole('button').map((b) => b.props.accessibilityLabel);

function propsBase(over: Partial<Props> = {}): Props {
  return {
    visivel: true,
    onFechar: jest.fn(),
    dias: DIAS,
    diaIdx: IDX_QUINTA,
    onTrocarDia: jest.fn(),
    valorDigitado: '',
    onChangeValor: jest.fn(),
    salvando: false,
    onSalvar: jest.fn(),
    onEscanearOCR: jest.fn(),
    analisandoOCR: false,
    ocrPronto: false,
    valorOCR: 0,
    onDigitarManual: jest.fn(),
    ...over,
  };
}

async function renderizar(over: Partial<Props> = {}) {
  const props = propsBase(over);
  await render(<ModalLancarGanho {...props} />);
  return props;
}

// Versão controlada (como no App): o valor digitado e o dia vivem em estado do pai.
function ModalControlado({ inicial = '', diaInicial = IDX_QUINTA, onSalvar = jest.fn() }: { inicial?: string; diaInicial?: number; onSalvar?: Props['onSalvar'] }) {
  const [valor, setValor] = useState(inicial);
  const [diaIdx, setDiaIdx] = useState(diaInicial);
  return (
    <ModalLancarGanho
      {...propsBase()}
      valorDigitado={valor}
      onChangeValor={setValor}
      diaIdx={diaIdx}
      onTrocarDia={setDiaIdx}
      onSalvar={onSalvar}
    />
  );
}

describe('ModalLancarGanho', () => {
  it('invisível, não renderiza nada', async () => {
    await renderizar({ visivel: false });

    expect(screen.queryByText('Lançar ganho')).not.toBeOnTheScreen();
  });

  describe('lançamento manual', () => {
    it('mostra título, dia no subtítulo, pílulas Seg–Dom, "Já registrado" e o campo de valor', async () => {
      await renderizar();

      expect(screen.getByText('Lançar ganho')).toBeOnTheScreen();
      expect(screen.getByText('Quinta, 22 out')).toBeOnTheScreen();
      expect(screen.getAllByRole('button', { name: /^(Seg|Ter|Qua|Qui|Sex|Sáb|Dom)$/ })).toHaveLength(7);
      expect(screen.getByRole('button', { name: 'Qui' })).toBeSelected();
      expect(screen.getByText('Já registrado: R$ 0,00')).toBeOnTheScreen();
      expect(screen.getByLabelText('Valor do ganho')).toHaveProp('keyboardType', 'numeric');
      expect(screen.getByLabelText('Valor do ganho')).toBe(screen.getByPlaceholderText('0,00'));
      expect(screen.getByText('R$')).toBeOnTheScreen();
    });

    it('segue a ordem do mockup: salvar, escanear print e cancelar no fim', async () => {
      await renderizar();

      expect(nomesDosBotoes().slice(-3)).toEqual(['Salvar ganho', 'Escanear print (OCR)', 'Cancelar']);
    });

    it('para o dia de hoje com ganho existente, marca "hoje" e informa o valor já registrado', async () => {
      await renderizar({ diaIdx: IDX_QUARTA });

      expect(screen.getByText('Quarta, 21 out · hoje')).toBeOnTheScreen();
      expect(screen.getByText('Já registrado: R$ 30,00')).toBeOnTheScreen();
      expect(screen.getByText('R$ 30,00')).toHaveStyle({ color: cores.primaria });
    });

    it('digitar no campo repassa o texto para onChangeValor', async () => {
      const props = await renderizar();

      await fireEvent.changeText(screen.getByPlaceholderText('0,00'), '87,50');

      expect(props.onChangeValor).toHaveBeenCalledWith('87,50');
    });

    it('selecionar outra pílula troca o dia e limpa o valor digitado', async () => {
      const props = await renderizar({ valorDigitado: '50' });

      await fireEvent.press(screen.getByRole('button', { name: 'Sex' }));

      expect(props.onTrocarDia).toHaveBeenCalledWith(4);
      expect(props.onChangeValor).toHaveBeenCalledWith('');
    });

    describe('atalhos de valor', () => {
      it.each([
        ['+50', '50'],
        ['+100', '100'],
        ['+150', '150'],
        ['+200', '200'],
        ['Limpar', ''],
      ])('"%s" preenche o campo com "%s"', async (atalho, esperado) => {
        const props = await renderizar({ valorDigitado: '999' });

        await fireEvent.press(screen.getByText(atalho));

        expect(props.onChangeValor).toHaveBeenCalledWith(esperado);
      });

      it('com estado controlado, o campo mostra o valor do atalho e "Limpar" esvazia', async () => {
        await render(<ModalControlado />);
        const campo = screen.getByPlaceholderText('0,00');

        await fireEvent.press(screen.getByText('+150'));
        expect(campo).toHaveDisplayValue('150');

        // O atalho substitui o valor (não soma ao que já estava digitado).
        await fireEvent.press(screen.getByText('+50'));
        expect(campo).toHaveDisplayValue('50');

        await fireEvent.press(screen.getByText('Limpar'));
        expect(campo).toHaveDisplayValue('');
      });

      it('com estado controlado, trocar de dia apaga o valor digitado', async () => {
        await render(<ModalControlado inicial="120" />);

        await fireEvent.press(screen.getByRole('button', { name: 'Seg' }));

        expect(screen.getByPlaceholderText('0,00')).toHaveDisplayValue('');
        expect(screen.getByRole('button', { name: 'Seg' })).toBeSelected();
        expect(screen.getByText('Segunda, 19 out')).toBeOnTheScreen();
      });

      it('os atalhos são botões em pílulas neutras ("Limpar" com texto mais suave)', async () => {
        await renderizar();

        for (const atalho of ['+50', '+100', '+150', '+200', 'Limpar']) {
          expect(screen.getByRole('button', { name: atalho })).toHaveStyle({ backgroundColor: cores.superficieAlta });
        }
        expect(screen.getByText('+50')).toHaveStyle({ color: cores.texto });
        expect(screen.getByText('Limpar')).toHaveStyle({ color: cores.textoSuave });
      });
    });

    describe('dia sem ganho', () => {
      it('"Salvar ganho" fica desabilitado sem valor', async () => {
        const props = await renderizar({ valorDigitado: '' });

        const salvar = screen.getByRole('button', { name: 'Salvar ganho' });
        expect(salvar).toBeDisabled();
        await fireEvent.press(salvar);
        expect(props.onSalvar).not.toHaveBeenCalled();
      });

      it.each(['abc', '0', '0,00', '-10'])('valor inválido "%s" mantém "Salvar ganho" desabilitado', async (valor) => {
        const props = await renderizar({ valorDigitado: valor });

        const salvar = screen.getByRole('button', { name: 'Salvar ganho' });
        expect(salvar).toBeDisabled();
        await fireEvent.press(salvar);
        expect(props.onSalvar).not.toHaveBeenCalled();
      });

      it('com valor válido, o botão mostra o valor ("Salvar R$ 150,00") e salva no modo "somar"', async () => {
        const props = await renderizar({ valorDigitado: '150' });

        expect(screen.queryByRole('button', { name: 'Salvar ganho' })).not.toBeOnTheScreen();
        await fireEvent.press(screen.getByRole('button', { name: 'Salvar R$ 150,00' }));

        expect(props.onSalvar).toHaveBeenCalledTimes(1);
        expect(props.onSalvar).toHaveBeenCalledWith('somar');
      });

      it('o rótulo dinâmico acompanha digitação, atalhos e "Limpar" (estado controlado)', async () => {
        await render(<ModalControlado />);

        await fireEvent.changeText(screen.getByLabelText('Valor do ganho'), '120');
        expect(screen.getByRole('button', { name: 'Salvar R$ 120,00' })).toBeEnabled();

        await fireEvent.changeText(screen.getByLabelText('Valor do ganho'), '87,5');
        expect(screen.getByRole('button', { name: 'Salvar R$ 87,50' })).toBeEnabled();

        await fireEvent.press(screen.getByRole('button', { name: '+200' }));
        expect(screen.getByRole('button', { name: 'Salvar R$ 200,00' })).toBeEnabled();

        await fireEvent.press(screen.getByRole('button', { name: 'Limpar' }));
        expect(screen.getByRole('button', { name: 'Salvar ganho' })).toBeDisabled();
      });

      it('não oferece as opções somar/substituir', async () => {
        await renderizar({ valorDigitado: '150' });

        expect(screen.queryByRole('button', { name: /^Somar/ })).not.toBeOnTheScreen();
        expect(screen.queryByRole('button', { name: /^Substituir/ })).not.toBeOnTheScreen();
      });
    });

    describe('dia que já tem ganho', () => {
      it('sem valor novo, mostra "Salvar ganho" desabilitado', async () => {
        await renderizar({ diaIdx: IDX_QUARTA, valorDigitado: '' });

        expect(screen.getByRole('button', { name: 'Salvar ganho' })).toBeDisabled();
      });

      it('com valor novo, oferece somar (com o total) ou substituir', async () => {
        await renderizar({ diaIdx: IDX_QUARTA, valorDigitado: '1.250,50' });

        expect(screen.getByRole('button', { name: 'Somar R$ 1.250,50 → total R$ 1.280,50' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'Substituir por R$ 1.250,50' })).toBeEnabled();
        expect(screen.queryByRole('button', { name: 'Salvar ganho' })).not.toBeOnTheScreen();
      });

      it('"Somar" salva no modo "somar"', async () => {
        const props = await renderizar({ diaIdx: IDX_QUARTA, valorDigitado: '50' });

        await fireEvent.press(screen.getByRole('button', { name: 'Somar R$ 50,00 → total R$ 80,00' }));

        expect(props.onSalvar).toHaveBeenCalledWith('somar');
      });

      it('"Substituir" salva no modo "substituir"', async () => {
        const props = await renderizar({ diaIdx: IDX_QUARTA, valorDigitado: '50' });

        await fireEvent.press(screen.getByRole('button', { name: 'Substituir por R$ 50,00' }));

        expect(props.onSalvar).toHaveBeenCalledWith('substituir');
      });

      it('com estado controlado, o texto do botão acompanha o valor digitado', async () => {
        await render(<ModalControlado diaInicial={IDX_QUARTA} />);

        await fireEvent.changeText(screen.getByPlaceholderText('0,00'), '70');
        expect(screen.getByRole('button', { name: 'Somar R$ 70,00 → total R$ 100,00' })).toBeOnTheScreen();

        await fireEvent.press(screen.getByText('+200'));
        expect(screen.getByRole('button', { name: 'Somar R$ 200,00 → total R$ 230,00' })).toBeOnTheScreen();
        expect(screen.getByRole('button', { name: 'Substituir por R$ 200,00' })).toBeOnTheScreen();
      });
    });

    describe('salvando', () => {
      it('no botão único, mostra carregamento, mantém o nome acessível e bloqueia novo envio', async () => {
        const props = await renderizar({ valorDigitado: '150', salvando: true });

        const salvar = screen.getByRole('button', { name: 'Salvar R$ 150,00' });
        expect(screen.queryByText('Salvar R$ 150,00')).not.toBeOnTheScreen();
        expect(indicadoresDeCarregamento()).toHaveLength(1);
        expect(salvar).toBeBusy();
        expect(salvar).toBeDisabled();
        await fireEvent.press(salvar);
        expect(props.onSalvar).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: 'Cancelar' })).toBeEnabled();
      });

      it('enquanto salva, "Escanear print (OCR)" também fica desabilitado', async () => {
        const props = await renderizar({ valorDigitado: '150', salvando: true });

        const ocr = screen.getByRole('button', { name: 'Escanear print (OCR)' });
        expect(ocr).toBeDisabled();
        await fireEvent.press(ocr);
        expect(props.onEscanearOCR).not.toHaveBeenCalled();
      });

      it('com somar/substituir, "Somar" carrega e "Substituir" fica desabilitado', async () => {
        const props = await renderizar({ diaIdx: IDX_QUARTA, valorDigitado: '50', salvando: true });

        expect(indicadoresDeCarregamento()).toHaveLength(1);
        const substituir = screen.getByRole('button', { name: 'Substituir por R$ 50,00' });
        expect(substituir).toBeDisabled();
        await fireEvent.press(substituir);
        expect(props.onSalvar).not.toHaveBeenCalled();
      });
    });

    it('"Cancelar" e o toque no fundo chamam onFechar', async () => {
      const props = await renderizar();

      await fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));
      await fireEvent.press(screen.getByLabelText('Fechar'));

      expect(props.onFechar).toHaveBeenCalledTimes(2);
      expect(props.onSalvar).not.toHaveBeenCalled();
    });
  });

  describe('OCR', () => {
    it('"Escanear print (OCR)" fica dentro do formulário, como ação secundária, e chama onEscanearOCR', async () => {
      const props = await renderizar({ valorDigitado: '50' });

      const ocr = screen.getByRole('button', { name: 'Escanear print (OCR)' });
      expect(ocr).toHaveStyle({ borderColor: cores.neutro });
      await fireEvent.press(ocr);

      expect(props.onEscanearOCR).toHaveBeenCalledTimes(1);
      expect(props.onSalvar).not.toHaveBeenCalled();
      expect(props.onFechar).not.toHaveBeenCalled();
    });

    it('enquanto analisa, mostra apenas o estado de leitura', async () => {
      await renderizar({ analisandoOCR: true });

      expect(screen.getByText('Lendo o print…')).toBeOnTheScreen();
      expect(screen.getByText('OCR no aparelho, nada é enviado.')).toBeOnTheScreen();
      expect(indicadoresDeCarregamento()).toHaveLength(1);
      expect(screen.queryByText('Lançar ganho')).not.toBeOnTheScreen();
      expect(screen.queryByText('Valor encontrado')).not.toBeOnTheScreen();
    });

    it('a análise em andamento tem prioridade sobre um resultado pronto', async () => {
      await renderizar({ analisandoOCR: true, ocrPronto: true, valorOCR: 250 });

      expect(screen.getByText('Lendo o print…')).toBeOnTheScreen();
      expect(screen.queryByText('Valor encontrado')).not.toBeOnTheScreen();
    });

    it('com valor encontrado num dia sem ganho, oferece "Confirmar e salvar" (modo substituir)', async () => {
      const props = await renderizar({ ocrPronto: true, valorOCR: 250, diaIdx: IDX_QUINTA });

      expect(screen.getByText('Valor encontrado')).toBeOnTheScreen();
      expect(screen.getByText('R$ 250,00')).toHaveStyle({ color: cores.primaria });
      expect(screen.getByText('para Quinta, 22 out')).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Escanear print (OCR)' })).not.toBeOnTheScreen();
      expect(screen.queryByText('Lançar ganho')).not.toBeOnTheScreen();

      await fireEvent.press(screen.getByRole('button', { name: 'Confirmar e salvar' }));

      expect(props.onSalvar).toHaveBeenCalledWith('substituir');
    });

    it('com valor encontrado num dia que já tem ganho, oferece somar ou substituir', async () => {
      const props = await renderizar({ ocrPronto: true, valorOCR: 250, diaIdx: IDX_QUARTA });

      await fireEvent.press(screen.getByRole('button', { name: 'Somar aos R$ 30,00 → R$ 280,00' }));
      expect(props.onSalvar).toHaveBeenLastCalledWith('somar');

      await fireEvent.press(screen.getByRole('button', { name: 'Substituir por R$ 250,00' }));
      expect(props.onSalvar).toHaveBeenLastCalledWith('substituir');
    });

    it('"Digitar manualmente" chama onDigitarManual', async () => {
      const props = await renderizar({ ocrPronto: true, valorOCR: 250 });

      await fireEvent.press(screen.getByRole('button', { name: 'Digitar manualmente' }));

      expect(props.onDigitarManual).toHaveBeenCalledTimes(1);
    });

    it('salvando o resultado do OCR, o botão principal carrega e não aceita novo toque', async () => {
      const props = await renderizar({ ocrPronto: true, valorOCR: 250, salvando: true });

      const confirmar = screen.getByRole('button', { name: 'Confirmar e salvar' });
      expect(screen.queryByText('Confirmar e salvar')).not.toBeOnTheScreen();
      expect(indicadoresDeCarregamento()).toHaveLength(1);
      expect(confirmar).toBeBusy();
      await fireEvent.press(confirmar);
      expect(props.onSalvar).not.toHaveBeenCalled();
    });
  });
});
