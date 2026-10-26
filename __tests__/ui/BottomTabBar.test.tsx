// Testes de src/components/BottomTabBar.tsx: abas "Semana" e "Carteira" e o FAB central (+).

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { BottomTabBar, type TelaAtiva } from '../../src/components/BottomTabBar';
import { cores } from '../../src/theme';

async function renderizar(telaAtiva: TelaAtiva = 'dashboard') {
  const onSelecionarTela = jest.fn();
  const onPressionarFab = jest.fn();
  await render(
    <BottomTabBar telaAtiva={telaAtiva} onSelecionarTela={onSelecionarTela} onPressionarFab={onPressionarFab} />
  );
  return { onSelecionarTela, onPressionarFab };
}

/** Estilos esperados de cada aba, conforme ela está ativa ou não. */
const ROTULO_ATIVO = { color: cores.primaria, fontWeight: '800' } as const;
const ROTULO_INATIVO = { color: cores.textoApagado, fontWeight: '600' } as const;
const ICONE_ATIVO = { opacity: 1 } as const;
const ICONE_INATIVO = { opacity: 0.5 } as const;

describe('BottomTabBar', () => {
  it('mostra as abas Semana e Carteira com seus ícones e o FAB "+"', async () => {
    await renderizar();

    expect(screen.getByText('📊')).toBeOnTheScreen();
    expect(screen.getByText('Semana')).toBeOnTheScreen();
    expect(screen.getByText('💼')).toBeOnTheScreen();
    expect(screen.getByText('Carteira')).toBeOnTheScreen();
    expect(screen.getByText('+')).toBeOnTheScreen();
  });

  it('a aba Semana seleciona a tela "dashboard"', async () => {
    const { onSelecionarTela, onPressionarFab } = await renderizar('carteira');

    await fireEvent.press(screen.getByText('Semana'));

    expect(onSelecionarTela).toHaveBeenCalledTimes(1);
    expect(onSelecionarTela).toHaveBeenCalledWith('dashboard');
    expect(onPressionarFab).not.toHaveBeenCalled();
  });

  it('a aba Carteira seleciona a tela "carteira"', async () => {
    const { onSelecionarTela } = await renderizar('dashboard');

    await fireEvent.press(screen.getByText('Carteira'));

    expect(onSelecionarTela).toHaveBeenCalledTimes(1);
    expect(onSelecionarTela).toHaveBeenCalledWith('carteira');
  });

  it('o ícone faz parte da área de toque da aba', async () => {
    const { onSelecionarTela } = await renderizar();

    await fireEvent.press(screen.getByText('💼'));
    await fireEvent.press(screen.getByText('📊'));

    expect(onSelecionarTela.mock.calls).toEqual([['carteira'], ['dashboard']]);
  });

  it('tocar na aba já ativa também notifica (a tela decide o que fazer)', async () => {
    const { onSelecionarTela } = await renderizar('dashboard');

    await fireEvent.press(screen.getByText('Semana'));

    expect(onSelecionarTela).toHaveBeenCalledWith('dashboard');
  });

  it('o FAB chama onPressionarFab sem trocar de aba', async () => {
    const { onSelecionarTela, onPressionarFab } = await renderizar();

    await fireEvent.press(screen.getByText('+'));

    expect(onPressionarFab).toHaveBeenCalledTimes(1);
    expect(onSelecionarTela).not.toHaveBeenCalled();
  });

  it('destaca a aba Semana quando a tela ativa é o dashboard', async () => {
    await renderizar('dashboard');

    expect(screen.getByText('Semana')).toHaveStyle(ROTULO_ATIVO);
    expect(screen.getByText('📊')).toHaveStyle(ICONE_ATIVO);
    expect(screen.getByText('Carteira')).toHaveStyle(ROTULO_INATIVO);
    expect(screen.getByText('💼')).toHaveStyle(ICONE_INATIVO);
  });

  it('destaca a aba Carteira quando a tela ativa é a carteira', async () => {
    await renderizar('carteira');

    expect(screen.getByText('Carteira')).toHaveStyle(ROTULO_ATIVO);
    expect(screen.getByText('💼')).toHaveStyle(ICONE_ATIVO);
    expect(screen.getByText('Semana')).toHaveStyle(ROTULO_INATIVO);
    expect(screen.getByText('📊')).toHaveStyle(ICONE_INATIVO);
  });

  it('atualiza o destaque quando a tela ativa muda', async () => {
    const onSelecionarTela = jest.fn();
    const onPressionarFab = jest.fn();
    await render(
      <BottomTabBar telaAtiva="dashboard" onSelecionarTela={onSelecionarTela} onPressionarFab={onPressionarFab} />
    );

    await screen.rerender(
      <BottomTabBar telaAtiva="carteira" onSelecionarTela={onSelecionarTela} onPressionarFab={onPressionarFab} />
    );

    expect(screen.getByText('Carteira')).toHaveStyle(ROTULO_ATIVO);
    expect(screen.getByText('Semana')).toHaveStyle(ROTULO_INATIVO);
  });
});
