import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ModalDivida } from '../../src/components/ModalDivida';
import { DividaItem } from '../../src/types';

type Props = React.ComponentProps<typeof ModalDivida>;
type Tipo = DividaItem['tipo'];

const PLACEHOLDER: Record<Tipo, string> = {
  diaria: 'Ex.: Combustível, almoço',
  mensal: 'Ex.: Parcela do carro, seguro',
  imprevista: 'Ex.: Manutenção do pneu',
};

const indicadoresDeCarregamento = () =>
  screen.container.queryAll((el) => el.type === 'ActivityIndicator');

async function renderizar(over: Partial<Props> = {}) {
  const props: Props = {
    visivel: true,
    tipo: 'diaria',
    onFechar: jest.fn(),
    onSalvar: jest.fn().mockResolvedValue(undefined),
    ...over,
  };
  await render(<ModalDivida {...props} />);
  return props;
}

const campoDescricao = (tipo: Tipo = 'diaria') => screen.getByPlaceholderText(PLACEHOLDER[tipo]);
const campoValor = () => screen.getByPlaceholderText('0,00');

describe('ModalDivida', () => {
  it('invisível, não renderiza nada', async () => {
    await renderizar({ visivel: false });

    expect(screen.queryByText('Gasto diário')).not.toBeOnTheScreen();
  });

  it.each<[Tipo, string]>([
    ['diaria', 'Gasto diário'],
    ['mensal', 'Dívida mensal'],
    ['imprevista', 'Imprevisto'],
  ])('tipo "%s" mostra o título "%s" e o placeholder do tipo, sem texto explicativo', async (tipo, titulo) => {
    await renderizar({ tipo });

    expect(screen.getByText(titulo)).toBeOnTheScreen();
    expect(screen.queryByText('A projeção anual recalcula sozinha.')).not.toBeOnTheScreen();
    expect(campoDescricao(tipo)).toBeOnTheScreen();
    expect(screen.getByText('Descrição')).toBeOnTheScreen();
    expect(screen.getByText('Valor (R$)')).toBeOnTheScreen();
    expect(campoValor()).toHaveProp('keyboardType', 'numeric');
  });

  describe('frequência do imprevisto', () => {
    it.each<Tipo>(['diaria', 'mensal'])('não aparece para o tipo "%s"', async (tipo) => {
      await renderizar({ tipo });

      expect(screen.queryByRole('button', { name: 'Diária' })).not.toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Anual / única' })).not.toBeOnTheScreen();
    });

    it('aparece só para "imprevista", com "Anual / única" selecionada por padrão', async () => {
      await renderizar({ tipo: 'imprevista' });

      expect(screen.getByRole('button', { name: 'Diária' })).not.toBeSelected();
      expect(screen.getByRole('button', { name: 'Mensal' })).not.toBeSelected();
      expect(screen.getByRole('button', { name: 'Anual / única' })).toBeSelected();
    });

    it('permite escolher outra frequência', async () => {
      await renderizar({ tipo: 'imprevista' });

      await fireEvent.press(screen.getByRole('button', { name: 'Mensal' }));

      expect(screen.getByRole('button', { name: 'Mensal' })).toBeSelected();
      expect(screen.getByRole('button', { name: 'Anual / única' })).not.toBeSelected();
    });
  });

  describe('validação', () => {
    it('sem descrição e sem valor, mostra os dois erros e não salva', async () => {
      const props = await renderizar();

      await fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));

      expect(screen.getByText('Informe uma descrição.')).toBeOnTheScreen();
      expect(screen.getByText('Informe um valor maior que zero.')).toBeOnTheScreen();
      expect(props.onSalvar).not.toHaveBeenCalled();
    });

    it('descrição só com espaços conta como vazia', async () => {
      const props = await renderizar();

      await fireEvent.changeText(campoDescricao(), '   ');
      await fireEvent.changeText(campoValor(), '30');
      await fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));

      expect(screen.getByText('Informe uma descrição.')).toBeOnTheScreen();
      expect(screen.queryByText('Informe um valor maior que zero.')).not.toBeOnTheScreen();
      expect(props.onSalvar).not.toHaveBeenCalled();
    });

    it.each(['abc', '0', '-5'])('valor inválido "%s" mostra erro no campo de valor', async (valor) => {
      const props = await renderizar();

      await fireEvent.changeText(campoDescricao(), 'Combustível');
      await fireEvent.changeText(campoValor(), valor);
      await fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));

      expect(screen.getByText('Informe um valor maior que zero.')).toBeOnTheScreen();
      expect(screen.queryByText('Informe uma descrição.')).not.toBeOnTheScreen();
      expect(props.onSalvar).not.toHaveBeenCalled();
    });

    it('o erro de cada campo some quando o usuário volta a digitar nele', async () => {
      await renderizar();
      await fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));

      await fireEvent.changeText(campoDescricao(), 'C');
      expect(screen.queryByText('Informe uma descrição.')).not.toBeOnTheScreen();
      expect(screen.getByText('Informe um valor maior que zero.')).toBeOnTheScreen();

      await fireEvent.changeText(campoValor(), '1');
      expect(screen.queryByText('Informe um valor maior que zero.')).not.toBeOnTheScreen();
    });
  });

  describe('salvar', () => {
    it('envia descrição sem espaços extras e o valor convertido, sem frequência para "diaria"', async () => {
      const props = await renderizar({ tipo: 'diaria' });

      await fireEvent.changeText(campoDescricao(), '  Combustível  ');
      await fireEvent.changeText(campoValor(), '1.250,50');
      await fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));

      expect(props.onSalvar).toHaveBeenCalledTimes(1);
      expect(props.onSalvar).toHaveBeenCalledWith({ descricao: 'Combustível', valor: 1250.5, frequencia: undefined });
    });

    it('para "mensal" também não envia frequência', async () => {
      const props = await renderizar({ tipo: 'mensal' });

      await fireEvent.changeText(campoDescricao('mensal'), 'Seguro');
      await fireEvent.changeText(campoValor(), '180');
      await fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));

      expect(props.onSalvar).toHaveBeenCalledWith({ descricao: 'Seguro', valor: 180, frequencia: undefined });
    });

    it('para "imprevista", envia a frequência padrão "anual"', async () => {
      const props = await renderizar({ tipo: 'imprevista' });

      await fireEvent.changeText(campoDescricao('imprevista'), 'Pneu');
      await fireEvent.changeText(campoValor(), '400');
      await fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));

      expect(props.onSalvar).toHaveBeenCalledWith({ descricao: 'Pneu', valor: 400, frequencia: 'anual' });
    });

    it('para "imprevista", envia a frequência escolhida', async () => {
      const props = await renderizar({ tipo: 'imprevista' });

      await fireEvent.press(screen.getByRole('button', { name: 'Diária' }));
      await fireEvent.changeText(campoDescricao('imprevista'), 'Estacionamento');
      await fireEvent.changeText(campoValor(), '5');
      await fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));

      expect(props.onSalvar).toHaveBeenCalledWith({ descricao: 'Estacionamento', valor: 5, frequencia: 'diaria' });
    });

    it('após salvar com sucesso, limpa o formulário e volta a frequência para "anual"', async () => {
      await renderizar({ tipo: 'imprevista' });

      await fireEvent.press(screen.getByRole('button', { name: 'Mensal' }));
      await fireEvent.changeText(campoDescricao('imprevista'), 'Lavagem');
      await fireEvent.changeText(campoValor(), '50');
      await fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));

      expect(campoDescricao('imprevista')).toHaveDisplayValue('');
      expect(campoValor()).toHaveDisplayValue('');
      expect(screen.getByRole('button', { name: 'Anual / única' })).toBeSelected();
    });

    it('enquanto onSalvar está pendente, mostra carregamento e impede envio duplo', async () => {
      let concluir: () => void = () => {};
      const onSalvar = jest.fn(() => new Promise<void>((resolve) => { concluir = resolve; }));
      await renderizar({ onSalvar });
      await fireEvent.changeText(campoDescricao(), 'Almoço');
      await fireEvent.changeText(campoValor(), '25');
      const salvar = screen.getByRole('button', { name: 'Salvar' });

      // Não aguardamos o press: o handler só termina quando onSalvar resolver.
      const envio = fireEvent.press(salvar);
      await waitFor(() => expect(salvar).toBeDisabled());
      expect(indicadoresDeCarregamento()).toHaveLength(1);
      await fireEvent.press(salvar);
      expect(onSalvar).toHaveBeenCalledTimes(1);

      await act(async () => concluir());
      await envio;

      expect(screen.getByRole('button', { name: 'Salvar' })).toBeEnabled();
      expect(indicadoresDeCarregamento()).toHaveLength(0);
      expect(campoDescricao()).toHaveDisplayValue('');
    });
  });

  describe('fechar', () => {
    it('"Cancelar" chama onFechar e descarta o que foi digitado', async () => {
      const props = await renderizar();
      await fireEvent.changeText(campoDescricao(), 'Rascunho');
      await fireEvent.changeText(campoValor(), '10');
      expect(campoDescricao()).toHaveDisplayValue('Rascunho');

      await fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));

      expect(props.onFechar).toHaveBeenCalledTimes(1);
      expect(props.onSalvar).not.toHaveBeenCalled();
      expect(campoDescricao()).toHaveDisplayValue('');
      expect(campoValor()).toHaveDisplayValue('');
    });

    it('"Cancelar" também limpa os erros de validação', async () => {
      await renderizar();
      await fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));
      expect(screen.getByText('Informe uma descrição.')).toBeOnTheScreen();

      await fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));

      expect(screen.queryByText('Informe uma descrição.')).not.toBeOnTheScreen();
      expect(screen.queryByText('Informe um valor maior que zero.')).not.toBeOnTheScreen();
    });

    it('tocar no fundo também fecha e limpa', async () => {
      const props = await renderizar();
      await fireEvent.changeText(campoDescricao(), 'Rascunho');

      await fireEvent.press(screen.getByLabelText('Fechar'));

      expect(props.onFechar).toHaveBeenCalledTimes(1);
      expect(campoDescricao()).toHaveDisplayValue('');
    });
  });
});
