import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ModalMetaBase } from '../../src/components/ModalMetaBase';

type Props = React.ComponentProps<typeof ModalMetaBase>;

const indicadoresDeCarregamento = () =>
  screen.container.queryAll((el) => el.type === 'ActivityIndicator');

async function renderizar(over: Partial<Props> = {}) {
  const props: Props = {
    visivel: true,
    metaAtual: 100,
    onFechar: jest.fn(),
    onSalvar: jest.fn().mockResolvedValue(undefined),
    ...over,
  };
  await render(<ModalMetaBase {...props} />);
  return props;
}

const campo = () => screen.getByPlaceholderText('100');

describe('ModalMetaBase', () => {
  it('invisível, não renderiza nada', async () => {
    await renderizar({ visivel: false });

    expect(screen.queryByText('Meta diária')).not.toBeOnTheScreen();
  });

  it('mostra título, subtítulo e o campo preenchido com a meta atual', async () => {
    await renderizar({ metaAtual: 150 });

    expect(screen.getByText('Meta diária')).toBeOnTheScreen();
    expect(screen.getByText('Quanto você quer fazer por dia?')).toBeOnTheScreen();
    expect(screen.getByText('Valor base (R$)')).toBeOnTheScreen();
    expect(campo()).toHaveDisplayValue('150');
    expect(campo()).toHaveProp('keyboardType', 'numeric');
  });

  it('meta com centavos aparece no formato brasileiro', async () => {
    await renderizar({ metaAtual: 150.5 });

    expect(campo()).toHaveDisplayValue('150,50');
  });

  it('salvar envia o valor convertido para número', async () => {
    const props = await renderizar();

    await fireEvent.changeText(campo(), '1.234,56');
    await fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));

    expect(props.onSalvar).toHaveBeenCalledTimes(1);
    expect(props.onSalvar).toHaveBeenCalledWith(1234.56);
  });

  it('salvar sem alterar envia a meta atual', async () => {
    const props = await renderizar({ metaAtual: 120 });

    await fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));

    expect(props.onSalvar).toHaveBeenCalledWith(120);
  });

  it.each(['', '0', 'abc', '-50'])('valor inválido "%s" mostra erro e não salva', async (valor) => {
    const props = await renderizar();

    await fireEvent.changeText(campo(), valor);
    await fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));

    expect(screen.getByText('A meta precisa ser maior que zero.')).toBeOnTheScreen();
    expect(props.onSalvar).not.toHaveBeenCalled();
  });

  it('o erro some quando o usuário volta a digitar', async () => {
    await renderizar();
    await fireEvent.changeText(campo(), '0');
    await fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));

    await fireEvent.changeText(campo(), '80');

    expect(screen.queryByText('A meta precisa ser maior que zero.')).not.toBeOnTheScreen();
  });

  it('"Cancelar" chama onFechar sem salvar', async () => {
    const props = await renderizar();

    await fireEvent.changeText(campo(), '999');
    await fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));

    expect(props.onFechar).toHaveBeenCalledTimes(1);
    expect(props.onSalvar).not.toHaveBeenCalled();
  });

  it('ao reabrir, descarta o texto anterior, o erro e mostra a meta atual', async () => {
    const props = await renderizar({ metaAtual: 100 });
    await fireEvent.changeText(campo(), '0');
    await fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));
    expect(screen.getByText('A meta precisa ser maior que zero.')).toBeOnTheScreen();

    await screen.rerender(<ModalMetaBase {...props} visivel={false} metaAtual={130} />);
    await screen.rerender(<ModalMetaBase {...props} visivel metaAtual={130} />);

    expect(campo()).toHaveDisplayValue('130');
    expect(screen.queryByText('A meta precisa ser maior que zero.')).not.toBeOnTheScreen();
  });

  it('enquanto salva, o botão "Salvar" mostra carregamento e fica desabilitado', async () => {
    let concluir: () => void = () => {};
    const onSalvar = jest.fn(() => new Promise<void>((resolve) => { concluir = resolve; }));
    await renderizar({ onSalvar });
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
  });
});
