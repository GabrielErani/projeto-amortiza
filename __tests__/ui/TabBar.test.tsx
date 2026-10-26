import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { TabBar } from '../../src/components/TabBar';
import { cores } from '../../src/theme';

describe('TabBar', () => {
  it('renderiza as abas Semana e Carteira e o botão central de adicionar', async () => {
    await render(<TabBar aba="semana" onTrocar={jest.fn()} onAdicionar={jest.fn()} />);

    expect(screen.getAllByRole('tab')).toHaveLength(2);
    expect(screen.getByRole('tab', { name: 'Semana' })).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Carteira' })).toBeOnTheScreen();
    expect(screen.getByLabelText('Adicionar ganho')).toHaveTextContent('+');
  });

  it('as abas ficam numa tablist e o FAB tem papel de botão', async () => {
    await render(<TabBar aba="semana" onTrocar={jest.fn()} onAdicionar={jest.fn()} />);

    // O contêiner não é um elemento acessível (senão agruparia as abas no iOS); só declara o papel.
    expect(screen.getByRole('tab', { name: 'Semana' }).parent).toHaveProp('accessibilityRole', 'tablist');
    expect(screen.getByRole('button', { name: 'Adicionar ganho' })).toHaveStyle({ backgroundColor: cores.primaria });
  });

  it('o indicador discreto de cada aba acompanha a cor do rótulo', async () => {
    await render(<TabBar aba="carteira" onTrocar={jest.fn()} onAdicionar={jest.fn()} />);

    const [iconeSemana] = screen.getByRole('tab', { name: 'Semana' }).children;
    const [iconeCarteira] = screen.getByRole('tab', { name: 'Carteira' }).children;
    expect(iconeSemana).toHaveStyle({ borderColor: cores.textoApagado });
    expect(iconeCarteira).toHaveStyle({ borderColor: cores.texto });
  });

  it('marca como selecionada apenas a aba ativa', async () => {
    await render(<TabBar aba="semana" onTrocar={jest.fn()} onAdicionar={jest.fn()} />);

    expect(screen.getByRole('tab', { name: 'Semana' })).toBeSelected();
    expect(screen.getByRole('tab', { name: 'Carteira' })).not.toBeSelected();
    expect(screen.getByText('Semana')).toHaveStyle({ color: cores.texto, fontWeight: '700' });
    expect(screen.getByText('Carteira')).toHaveStyle({ color: cores.textoApagado });
  });

  it('acompanha a aba ativa vinda do pai', async () => {
    await render(<TabBar aba="semana" onTrocar={jest.fn()} onAdicionar={jest.fn()} />);

    await screen.rerender(<TabBar aba="carteira" onTrocar={jest.fn()} onAdicionar={jest.fn()} />);

    expect(screen.getByRole('tab', { name: 'Carteira' })).toBeSelected();
    expect(screen.getByRole('tab', { name: 'Semana' })).not.toBeSelected();
  });

  it('trocar de aba chama onTrocar com a aba tocada', async () => {
    const onTrocar = jest.fn();
    await render(<TabBar aba="semana" onTrocar={onTrocar} onAdicionar={jest.fn()} />);

    await fireEvent.press(screen.getByRole('tab', { name: 'Carteira' }));
    expect(onTrocar).toHaveBeenLastCalledWith('carteira');

    await fireEvent.press(screen.getByRole('tab', { name: 'Semana' }));
    expect(onTrocar).toHaveBeenLastCalledWith('semana');
    expect(onTrocar).toHaveBeenCalledTimes(2);
  });

  it('o botão central (FAB) chama onAdicionar e não troca de aba', async () => {
    const onTrocar = jest.fn();
    const onAdicionar = jest.fn();
    await render(<TabBar aba="carteira" onTrocar={onTrocar} onAdicionar={onAdicionar} />);

    await fireEvent.press(screen.getByLabelText('Adicionar ganho'));

    expect(onAdicionar).toHaveBeenCalledTimes(1);
    expect(onTrocar).not.toHaveBeenCalled();
  });
});
