import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { IndicadorSync, corDoSync, rotuloSync } from '../../src/components/IndicadorSync';
import { ALVO_TOQUE, cores, tamanho } from '../../src/theme';
import { EstadoSync } from '../../src/types';

// ISO gerado a partir de um horário LOCAL: o texto esperado independe do fuso da máquina.
const ULTIMA_SYNC = new Date(2026, 9, 21, 14, 5).toISOString();

const indicadoresDeCarregamento = () =>
  screen.container.queryAll((el) => el.type === 'ActivityIndicator');

describe('rotuloSync', () => {
  it('sem conta: convida a entrar, ignorando a mensagem do estado', () => {
    expect(rotuloSync({ status: 'sem_conta', mensagem: 'Entre para sincronizar na nuvem.' })).toBe('Sem conta — toque para entrar');
  });

  it('ok com data da última sincronização: mostra o horário (HH:MM)', () => {
    expect(rotuloSync({ status: 'ok', ultimaSync: ULTIMA_SYNC, mensagem: 'Sincronizado com a nuvem.' })).toBe('Sincronizado às 14:05');
  });

  it('usa a mensagem do estado quando existe', () => {
    expect(rotuloSync({ status: 'offline', mensagem: 'Sem conexão. Dados salvos no aparelho.' })).toBe('Sem conexão. Dados salvos no aparelho.');
    expect(rotuloSync({ status: 'erro', mensagem: 'Sessão expirada. Entre novamente.' })).toBe('Sessão expirada. Entre novamente.');
    expect(rotuloSync({ status: 'ok', mensagem: 'Sincronizado com a nuvem.' })).toBe('Sincronizado com a nuvem.');
  });

  it.each<[EstadoSync['status'], string]>([
    ['offline', 'Offline'],
    ['sincronizando', 'Sincronizando'],
    ['ok', 'Sincronizado'],
    ['erro', 'Erro de sync'],
  ])('sem mensagem, o status "%s" usa o rótulo padrão "%s"', (status, esperado) => {
    expect(rotuloSync({ status })).toBe(esperado);
  });
});

describe('IndicadorSync', () => {
  it('é um botão que dispara onPress', async () => {
    const onPress = jest.fn();
    await render(<IndicadorSync estado={{ status: 'ok' }} onPress={onPress} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Sincronizado' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it.each<[EstadoSync['status'], string, string]>([
    ['sem_conta', 'Sem conta', cores.textoApagado],
    ['offline', 'Offline', cores.alerta],
    ['sincronizando', 'Sincronizando', cores.info],
    ['ok', 'Sincronizado', cores.primaria],
    ['erro', 'Erro de sync', cores.erro],
  ])('no modo compacto (padrão), status "%s" mostra "%s" com a cor do status no indicador', async (status, rotulo, cor) => {
    await render(<IndicadorSync estado={{ status, mensagem: 'mensagem longa que não aparece no chip' }} onPress={jest.fn()} />);

    // O texto do chip é discreto (cor secundária); quem leva a cor do status é o ponto/indicador.
    expect(screen.getByText(rotulo)).toHaveStyle({ color: cores.textoSuave });
    expect(corDoSync(status)).toBe(cor);
    const [indicador] = screen.getByRole('button', { name: rotulo }).children;
    if (status === 'sincronizando') expect(indicador).toHaveProp('color', cor);
    else expect(indicador).toHaveStyle({ backgroundColor: cor, width: tamanho.ponto });
    expect(screen.queryByText('mensagem longa que não aparece no chip')).not.toBeOnTheScreen();
  });

  it('o chip é baixo, mas o alvo de toque chega a 44 com hitSlop', async () => {
    await render(<IndicadorSync estado={{ status: 'ok' }} onPress={jest.fn()} />);

    const chip = screen.getByRole('button', { name: 'Sincronizado' });
    const { top, bottom } = chip.props.hitSlop;
    expect(chip).toHaveStyle({ minHeight: tamanho.chip });
    expect(tamanho.chip + top + bottom).toBeGreaterThanOrEqual(ALVO_TOQUE);
  });

  it('fora do modo compacto, mostra o rótulo detalhado de rotuloSync', async () => {
    await render(<IndicadorSync estado={{ status: 'ok', ultimaSync: ULTIMA_SYNC }} onPress={jest.fn()} compacto={false} />);

    expect(screen.getByText('Sincronizado às 14:05')).toBeOnTheScreen();
  });

  it('mostra um ActivityIndicator enquanto sincroniza', async () => {
    await render(<IndicadorSync estado={{ status: 'sincronizando' }} onPress={jest.fn()} />);

    expect(indicadoresDeCarregamento()).toHaveLength(1);
    expect(indicadoresDeCarregamento()[0]).toHaveProp('color', cores.info);
  });

  it.each<EstadoSync['status']>(['sem_conta', 'offline', 'ok', 'erro'])('status "%s" mostra um ponto colorido, sem ActivityIndicator', async (status) => {
    await render(<IndicadorSync estado={{ status }} onPress={jest.fn()} />);

    expect(indicadoresDeCarregamento()).toHaveLength(0);
  });
});
