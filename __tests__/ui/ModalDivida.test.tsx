// Testes de src/components/ModalDivida.tsx: bottom sheet de cadastro de dívida (diária, mensal ou imprevista).

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ModalDivida, type ModalDividaProps } from '../../src/components/ModalDivida';
import { cores } from '../../src/theme';

type Tipo = ModalDividaProps['tipo'];

async function renderizar(props: Partial<ModalDividaProps> = {}) {
  const callbacks = {
    onAlterarFrequencia: jest.fn(),
    onAlterarDescricao: jest.fn(),
    onAlterarValor: jest.fn(),
    onSalvar: jest.fn(),
    onFechar: jest.fn(),
  };
  await render(
    <ModalDivida visivel tipo="diaria" frequencia="anual" descricao="" valor="" {...callbacks} {...props} />
  );
  return callbacks;
}

const modaisAbertos = () => screen.container.queryAll((el) => el.type === 'Modal');
const campoValor = () => screen.getByPlaceholderText('0.00');

/** A pílula é o TouchableOpacity que envolve o texto. */
const pilula = (texto: string) => screen.getByText(texto).parent;

const PILULA_ATIVA = { backgroundColor: cores.primaria, borderColor: cores.primaria };
const PILULA_INATIVA = { backgroundColor: cores.superficieAlta, borderColor: cores.neutro };

describe('ModalDivida', () => {
  it('não mostra nada quando está fechado', async () => {
    await renderizar({ visivel: false });

    expect(modaisAbertos()).toHaveLength(0);
    expect(screen.queryByText('Salvar Dívida')).not.toBeOnTheScreen();
  });

  it('abre como bottom sheet transparente com animação de slide', async () => {
    await renderizar();

    const [modal] = modaisAbertos();
    expect(modal).toHaveProp('transparent', true);
    expect(modal).toHaveProp('animationType', 'slide');
  });

  it.each<[Tipo, string, string]>([
    ['diaria', 'Cadastrar Gasto Diário', 'Ex: Combustível, Almoço'],
    ['mensal', 'Cadastrar Dívida Mensal', 'Ex: Parcela do Carro, Seguro'],
    ['imprevista', 'Lançar Dívida Imprevista', 'Ex: Manutenção inesperada do pneu'],
  ])('tipo %s: título "%s" e exemplo "%s" na descrição', async (tipo, titulo, placeholder) => {
    await renderizar({ tipo });

    expect(screen.getByText(titulo)).toBeOnTheScreen();
    expect(screen.getByPlaceholderText(placeholder)).toBeOnTheScreen();
  });

  it('mostra o aviso de recálculo, os rótulos e os botões', async () => {
    await renderizar();

    expect(screen.getByText('A dívida anual projetada atualizará automaticamente.')).toBeOnTheScreen();
    expect(screen.getByText('Descrição da Dívida / Gasto:')).toBeOnTheScreen();
    expect(screen.getByText('Valor (R$):')).toBeOnTheScreen();
    expect(screen.getByText('Salvar Dívida')).toBeOnTheScreen();
    expect(screen.getByText('Cancelar')).toBeOnTheScreen();
  });

  it.each<Tipo>(['diaria', 'mensal'])('tipo %s não tem seletor de frequência', async (tipo) => {
    await renderizar({ tipo });

    expect(screen.queryByText('Frequência do Imprevisto:')).not.toBeOnTheScreen();
    expect(screen.queryByText('Anual / Única')).not.toBeOnTheScreen();
  });

  it('tipo imprevista mostra o seletor de frequência com as três opções', async () => {
    await renderizar({ tipo: 'imprevista' });

    expect(screen.getByText('Frequência do Imprevisto:')).toBeOnTheScreen();
    expect(screen.getByText('Diária')).toBeOnTheScreen();
    expect(screen.getByText('Mensal')).toBeOnTheScreen();
    expect(screen.getByText('Anual / Única')).toBeOnTheScreen();
  });

  it.each<[string, 'diaria' | 'mensal' | 'anual']>([
    ['Diária', 'diaria'],
    ['Mensal', 'mensal'],
    ['Anual / Única', 'anual'],
  ])('a pílula "%s" chama onAlterarFrequencia("%s")', async (texto, frequencia) => {
    const { onAlterarFrequencia } = await renderizar({ tipo: 'imprevista', frequencia: 'anual' });

    await fireEvent.press(screen.getByText(texto));

    expect(onAlterarFrequencia).toHaveBeenCalledTimes(1);
    expect(onAlterarFrequencia).toHaveBeenCalledWith(frequencia);
  });

  it('destaca somente a frequência selecionada', async () => {
    await renderizar({ tipo: 'imprevista', frequencia: 'mensal' });

    expect(pilula('Mensal')).toHaveStyle(PILULA_ATIVA);
    expect(screen.getByText('Mensal')).toHaveStyle({ color: cores.primariaTexto });
    expect(pilula('Diária')).toHaveStyle(PILULA_INATIVA);
    expect(pilula('Anual / Única')).toHaveStyle(PILULA_INATIVA);
    expect(screen.getByText('Diária')).toHaveStyle({ color: cores.textoSuave });
  });

  it('exibe a descrição e o valor recebidos por props', async () => {
    await renderizar({ tipo: 'mensal', descricao: 'Seguro do carro', valor: '189,90' });

    expect(screen.getByPlaceholderText('Ex: Parcela do Carro, Seguro')).toHaveDisplayValue('Seguro do carro');
    expect(campoValor()).toHaveDisplayValue('189,90');
  });

  it('o campo de descrição recebe foco automático e o de valor usa teclado numérico', async () => {
    await renderizar();

    expect(screen.getByPlaceholderText('Ex: Combustível, Almoço')).toHaveProp('autoFocus', true);
    expect(campoValor()).toHaveProp('keyboardType', 'numeric');
  });

  it('repassa o texto digitado na descrição e no valor', async () => {
    const { onAlterarDescricao, onAlterarValor } = await renderizar();

    await fireEvent.changeText(screen.getByPlaceholderText('Ex: Combustível, Almoço'), 'Combustível');
    await fireEvent.changeText(campoValor(), '45,50');

    expect(onAlterarDescricao).toHaveBeenCalledWith('Combustível');
    expect(onAlterarValor).toHaveBeenCalledWith('45,50');
  });

  it('"Salvar Dívida" chama onSalvar', async () => {
    const { onSalvar, onFechar } = await renderizar({ descricao: 'Almoço', valor: '25' });

    await fireEvent.press(screen.getByText('Salvar Dívida'));

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
});
