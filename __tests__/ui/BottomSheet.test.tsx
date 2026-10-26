import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { BottomSheet } from '../../src/components/BottomSheet';
import { textos } from '../../src/theme';

const modalHost = () => screen.container.queryAll((el) => el.type === 'Modal')[0];

describe('BottomSheet', () => {
  it('não renderiza nada quando invisível', async () => {
    await render(
      <BottomSheet visivel={false} onFechar={jest.fn()} titulo="Título">
        <Text>Conteúdo</Text>
      </BottomSheet>,
    );

    expect(screen.queryByText('Título')).not.toBeOnTheScreen();
    expect(screen.queryByText('Conteúdo')).not.toBeOnTheScreen();
  });

  it('quando visível, mostra título, subtítulo e o conteúdo', async () => {
    await render(
      <BottomSheet visivel onFechar={jest.fn()} titulo="Meta diária" subtitulo="Quanto você quer fazer por dia?">
        <Text>Conteúdo</Text>
      </BottomSheet>,
    );

    expect(screen.getByText('Meta diária')).toBeOnTheScreen();
    expect(screen.getByText('Quanto você quer fazer por dia?')).toBeOnTheScreen();
    expect(screen.getByText('Conteúdo')).toBeOnTheScreen();
  });

  it('título e subtítulo usam os presets de texto do tema', async () => {
    await render(
      <BottomSheet visivel onFechar={jest.fn()} titulo="Lançar ganho" subtitulo="Quarta, 21 out">
        <Text>x</Text>
      </BottomSheet>,
    );

    expect(screen.getByText('Lançar ganho')).toHaveStyle(textos.tituloSheet);
    expect(screen.getByText('Quarta, 21 out')).toHaveStyle(textos.detalhe);
  });

  it('título e subtítulo são opcionais', async () => {
    await render(
      <BottomSheet visivel onFechar={jest.fn()}>
        <Text>Só conteúdo</Text>
      </BottomSheet>,
    );

    expect(screen.getByText('Só conteúdo')).toBeOnTheScreen();
    // Único texto renderizado é o do conteúdo.
    expect(screen.container.queryAll((el) => el.type === 'Text')).toHaveLength(1);
  });

  it('é um modal transparente que desliza de baixo', async () => {
    await render(
      <BottomSheet visivel onFechar={jest.fn()}>
        <Text>x</Text>
      </BottomSheet>,
    );

    expect(modalHost()).toHaveProp('transparent', true);
    expect(modalHost()).toHaveProp('animationType', 'slide');
  });

  it('tocar no fundo escurecido chama onFechar', async () => {
    const onFechar = jest.fn();
    await render(
      <BottomSheet visivel onFechar={onFechar}>
        <Text>x</Text>
      </BottomSheet>,
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Fechar' }));

    expect(onFechar).toHaveBeenCalledTimes(1);
  });

  it('o botão "voltar" do Android (onRequestClose) chama onFechar', async () => {
    const onFechar = jest.fn();
    await render(
      <BottomSheet visivel onFechar={onFechar}>
        <Text>x</Text>
      </BottomSheet>,
    );

    await fireEvent(modalHost(), 'requestClose');

    expect(onFechar).toHaveBeenCalledTimes(1);
  });

  it('tocar no conteúdo não fecha o sheet', async () => {
    const onFechar = jest.fn();
    await render(
      <BottomSheet visivel onFechar={onFechar} titulo="Título">
        <Text>Conteúdo</Text>
      </BottomSheet>,
    );

    await fireEvent.press(screen.getByText('Conteúdo'));
    await fireEvent.press(screen.getByText('Título'));

    expect(onFechar).not.toHaveBeenCalled();
  });
});
