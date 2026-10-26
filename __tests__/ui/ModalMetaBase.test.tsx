// Testes de src/components/ModalMetaBase.tsx: modal central "Meta Diária Base".
// O Modal do preset de testes do React Native não renderiza nada quando visible={false}.

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ModalMetaBase, type ModalMetaBaseProps } from '../../src/components/ModalMetaBase';

async function renderizar(props: Partial<ModalMetaBaseProps> = {}) {
  const callbacks = {
    onAlterarValor: jest.fn(),
    onSalvar: jest.fn(),
    onFechar: jest.fn(),
  };
  await render(<ModalMetaBase visivel valor="100" {...callbacks} {...props} />);
  return callbacks;
}

const modaisAbertos = () => screen.container.queryAll((el) => el.type === 'Modal');

describe('ModalMetaBase', () => {
  it('não mostra nada quando está fechado', async () => {
    await renderizar({ visivel: false });

    expect(modaisAbertos()).toHaveLength(0);
    expect(screen.queryByText('Meta Diária Base')).not.toBeOnTheScreen();
  });

  it('mostra título, pergunta, rótulo e os botões quando está aberto', async () => {
    await renderizar();

    expect(modaisAbertos()).toHaveLength(1);
    expect(screen.getByText('Meta Diária Base')).toBeOnTheScreen();
    expect(screen.getByText('Qual é o seu objetivo padrão de ganho por dia?')).toBeOnTheScreen();
    expect(screen.getByText('Valor Base (R$)')).toBeOnTheScreen();
    expect(screen.getByText('Cancelar')).toBeOnTheScreen();
    expect(screen.getByText('Salvar Meta')).toBeOnTheScreen();
  });

  it('abre como modal transparente com animação de fade', async () => {
    await renderizar();

    const [modal] = modaisAbertos();
    expect(modal).toHaveProp('transparent', true);
    expect(modal).toHaveProp('animationType', 'fade');
  });

  it('exibe o valor atual no campo numérico com foco automático', async () => {
    await renderizar({ valor: '150' });

    const campo = screen.getByPlaceholderText('Ex: 100.00');
    expect(campo).toHaveDisplayValue('150');
    expect(campo).toHaveProp('keyboardType', 'numeric');
    expect(campo).toHaveProp('autoFocus', true);
  });

  it('repassa o texto digitado para onAlterarValor', async () => {
    const { onAlterarValor, onSalvar } = await renderizar({ valor: '' });

    await fireEvent.changeText(screen.getByPlaceholderText('Ex: 100.00'), '250,50');

    expect(onAlterarValor).toHaveBeenCalledTimes(1);
    expect(onAlterarValor).toHaveBeenCalledWith('250,50');
    expect(onSalvar).not.toHaveBeenCalled();
  });

  it('"Salvar Meta" chama onSalvar', async () => {
    const { onSalvar, onFechar } = await renderizar();

    await fireEvent.press(screen.getByText('Salvar Meta'));

    expect(onSalvar).toHaveBeenCalledTimes(1);
    expect(onFechar).not.toHaveBeenCalled();
  });

  it('"Cancelar" chama onFechar', async () => {
    const { onSalvar, onFechar } = await renderizar();

    await fireEvent.press(screen.getByText('Cancelar'));

    expect(onFechar).toHaveBeenCalledTimes(1);
    expect(onSalvar).not.toHaveBeenCalled();
  });

  it('o botão "voltar" do Android (onRequestClose) chama onFechar', async () => {
    const { onFechar } = await renderizar();

    await fireEvent(modaisAbertos()[0], 'requestClose');

    expect(onFechar).toHaveBeenCalledTimes(1);
  });

  it('reflete um novo valor recebido por props', async () => {
    const callbacks = { onAlterarValor: jest.fn(), onSalvar: jest.fn(), onFechar: jest.fn() };
    await render(<ModalMetaBase visivel valor="100" {...callbacks} />);

    await screen.rerender(<ModalMetaBase visivel valor="180" {...callbacks} />);

    expect(screen.getByPlaceholderText('Ex: 100.00')).toHaveDisplayValue('180');
  });
});
