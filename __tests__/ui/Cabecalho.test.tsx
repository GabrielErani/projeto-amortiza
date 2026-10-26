import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Cabecalho } from '../../src/components/Cabecalho';
import { ALVO_TOQUE, cores, tamanho, textos } from '../../src/theme';
import { EstadoSync } from '../../src/types';

type Props = React.ComponentProps<typeof Cabecalho>;
const SINCRONIZADO: EstadoSync = { status: 'ok', ultimaSync: '2026-10-21T12:00:00.000Z' };

async function renderizar(over: Partial<Props> = {}) {
  const props: Props = {
    titulo: 'Semana',
    subtitulo: '19 – 25 out',
    estadoSync: SINCRONIZADO,
    inicial: 'G',
    onSync: jest.fn(),
    onConta: jest.fn(),
    ...over,
  };
  await render(<Cabecalho {...props} />);
  return props;
}

describe('Cabecalho', () => {
  it('mostra o título (como cabeçalho acessível) e o período à esquerda', async () => {
    await renderizar();

    expect(screen.getByRole('header', { name: 'Semana' })).toHaveStyle(textos.titulo);
    expect(screen.getByText('19 – 25 out')).toHaveStyle(textos.legenda);
  });

  it('à direita, mostra o chip curto de sync e o avatar com a inicial', async () => {
    await renderizar();

    expect(screen.getByRole('button', { name: 'Sincronizado' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Conta' })).toHaveTextContent('G');
  });

  it('chip e avatar chamam os callbacks correspondentes', async () => {
    const props = await renderizar();

    await fireEvent.press(screen.getByRole('button', { name: 'Sincronizado' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Conta' }));

    expect(props.onSync).toHaveBeenCalledTimes(1);
    expect(props.onConta).toHaveBeenCalledTimes(1);
  });

  it('o avatar é um círculo de 34 com alvo de toque expandido até 44', async () => {
    await renderizar();

    const avatar = screen.getByRole('button', { name: 'Conta' });
    const { top, bottom, left, right } = avatar.props.hitSlop;
    expect(avatar).toHaveStyle({ width: tamanho.avatar, height: tamanho.avatar, borderRadius: tamanho.avatar / 2 });
    expect(tamanho.avatar + top + bottom).toBeGreaterThanOrEqual(ALVO_TOQUE);
    expect(tamanho.avatar + left + right).toBeGreaterThanOrEqual(ALVO_TOQUE);
    expect(screen.getByText('G')).toHaveStyle({ color: cores.texto, fontWeight: '700' });
  });

  it('sem conta, o chip diz "Sem conta" e o avatar mostra o marcador neutro', async () => {
    await renderizar({ estadoSync: { status: 'sem_conta' }, inicial: '•' });

    expect(screen.getByRole('button', { name: 'Sem conta' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Conta' })).toHaveTextContent('•');
  });
});
