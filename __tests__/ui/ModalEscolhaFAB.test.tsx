// Testes de src/components/ModalEscolhaFAB.tsx: escolha entre escanear print (OCR) ou digitar o ganho.

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ModalEscolhaFAB, type ModalEscolhaFABProps } from '../../src/components/ModalEscolhaFAB';

const OCR = '📷 Escanear Print com OCR';
const MANUAL = '✍️ Digitar Ganho Manualmente';

async function renderizar(props: Partial<ModalEscolhaFABProps> = {}) {
  const callbacks = {
    onEscanearOCR: jest.fn(),
    onDigitarManual: jest.fn(),
    onFechar: jest.fn(),
  };
  await render(<ModalEscolhaFAB visivel {...callbacks} {...props} />);
  return callbacks;
}

const modaisAbertos = () => screen.container.queryAll((el) => el.type === 'Modal');

describe('ModalEscolhaFAB', () => {
  it('não mostra nada quando está fechado', async () => {
    await renderizar({ visivel: false });

    expect(modaisAbertos()).toHaveLength(0);
    expect(screen.queryByText('Adicionar Ganho')).not.toBeOnTheScreen();
  });

  it('mostra título, instrução e as três opções quando está aberto', async () => {
    await renderizar();

    expect(screen.getByText('Adicionar Ganho')).toBeOnTheScreen();
    expect(screen.getByText('Escolha como deseja registrar seu ganho')).toBeOnTheScreen();
    expect(screen.getByText(OCR)).toBeOnTheScreen();
    expect(screen.getByText(MANUAL)).toBeOnTheScreen();
    expect(screen.getByText('Cancelar')).toBeOnTheScreen();
  });

  it('abre como bottom sheet transparente com fade', async () => {
    await renderizar();

    const [modal] = modaisAbertos();
    expect(modal).toHaveProp('transparent', true);
    expect(modal).toHaveProp('animationType', 'fade');
  });

  it('"Escanear Print com OCR" chama apenas onEscanearOCR', async () => {
    const { onEscanearOCR, onDigitarManual, onFechar } = await renderizar();

    await fireEvent.press(screen.getByText(OCR));

    expect(onEscanearOCR).toHaveBeenCalledTimes(1);
    expect(onDigitarManual).not.toHaveBeenCalled();
    expect(onFechar).not.toHaveBeenCalled();
  });

  it('"Digitar Ganho Manualmente" chama apenas onDigitarManual', async () => {
    const { onEscanearOCR, onDigitarManual, onFechar } = await renderizar();

    await fireEvent.press(screen.getByText(MANUAL));

    expect(onDigitarManual).toHaveBeenCalledTimes(1);
    expect(onEscanearOCR).not.toHaveBeenCalled();
    expect(onFechar).not.toHaveBeenCalled();
  });

  it('"Cancelar" chama onFechar', async () => {
    const { onEscanearOCR, onDigitarManual, onFechar } = await renderizar();

    await fireEvent.press(screen.getByText('Cancelar'));

    expect(onFechar).toHaveBeenCalledTimes(1);
    expect(onEscanearOCR).not.toHaveBeenCalled();
    expect(onDigitarManual).not.toHaveBeenCalled();
  });

  it('o botão "voltar" do Android (onRequestClose) chama onFechar', async () => {
    const { onFechar } = await renderizar();

    await fireEvent(modaisAbertos()[0], 'requestClose');

    expect(onFechar).toHaveBeenCalledTimes(1);
  });
});
