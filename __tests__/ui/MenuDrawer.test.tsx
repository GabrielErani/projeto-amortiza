// Testes de src/components/MenuDrawer.tsx: textoStatusSync e o menu lateral
// (navegação, meta diária, sincronização, seção "Conta" e rodapé com o status da nuvem).

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { MenuDrawer, textoStatusSync, type MenuDrawerProps } from '../../src/components/MenuDrawer';
import { cores } from '../../src/theme';
import type { EstadoSync, StatusSync, Usuario } from '../../src/types';

const USUARIO: Usuario = { id: 'user-123', email: 'joao@exemplo.com', nome: 'João' };
const SEM_CONTA = 'Sem conta • dados só neste aparelho';

const ITEM_DASHBOARD = '📊 Dashboard da Semana';
const ITEM_CARTEIRA = '💼 Carteira & Controle Macro';
const ITEM_META = '🎯 Configurar Meta Diária';
const ITEM_SYNC = '🔄 Sincronizar Dados';
const ITEM_SAIR = '🚪 Sair da conta';
const ITEM_ENTRAR = '🔐 Entrar ou criar conta';

/** ISO de um horário local (o drawer mostra a hora local do aparelho). */
const isoLocal = (hora: number, minuto: number) => new Date(2026, 9, 21, hora, minuto).toISOString();

// ─── textoStatusSync ──────────────────────────────────────────────────────────

describe('textoStatusSync', () => {
  const TODOS_OS_STATUS: StatusSync[] = ['sem_conta', 'offline', 'sincronizando', 'ok', 'erro'];

  it.each(TODOS_OS_STATUS)('sem conta, ignora o status "%s" e avisa que os dados ficam no aparelho', (status) => {
    expect(textoStatusSync({ status, ultimaSync: isoLocal(14, 32), mensagem: 'qualquer' }, false)).toBe(SEM_CONTA);
  });

  it('ok com última sincronização mostra a hora local (HH:MM)', () => {
    expect(textoStatusSync({ status: 'ok', ultimaSync: isoLocal(14, 32) }, true)).toBe('Sincronizado • 14:32');
  });

  it('ok usa dois dígitos para hora e minuto', () => {
    expect(textoStatusSync({ status: 'ok', ultimaSync: isoLocal(9, 5) }, true)).toBe('Sincronizado • 09:05');
  });

  it('ok sem data da última sincronização mostra só "Sincronizado"', () => {
    expect(textoStatusSync({ status: 'ok' }, true)).toBe('Sincronizado');
  });

  it('ok com data inválida mostra só "Sincronizado"', () => {
    expect(textoStatusSync({ status: 'ok', ultimaSync: 'data-quebrada' }, true)).toBe('Sincronizado');
  });

  it('sincronizando', () => {
    expect(textoStatusSync({ status: 'sincronizando', mensagem: 'Sincronizando...' }, true)).toBe('Sincronizando...');
  });

  it('offline (a mensagem detalhada do serviço não é exibida)', () => {
    expect(
      textoStatusSync({ status: 'offline', mensagem: 'Sem conexão. Dados salvos no aparelho.' }, true)
    ).toBe('Offline');
  });

  it('erro mostra a mensagem do serviço', () => {
    const mensagem = 'Banco não configurado: execute supabase/schema.sql no SQL Editor do Supabase.';
    expect(textoStatusSync({ status: 'erro', mensagem }, true)).toBe(mensagem);
  });

  it.each([undefined, ''])('erro sem mensagem (%j) usa o texto padrão', (mensagem) => {
    expect(textoStatusSync({ status: 'erro', mensagem }, true)).toBe('Erro ao sincronizar');
  });

  it('logado e ainda "sem_conta" (entre o login e a 1ª sincronização) aguarda a sincronização', () => {
    expect(textoStatusSync({ status: 'sem_conta', mensagem: 'Entre para sincronizar na nuvem.' }, true)).toBe(
      'Aguardando sincronização'
    );
  });
});

// ─── MenuDrawer ───────────────────────────────────────────────────────────────

async function renderizar(props: Partial<MenuDrawerProps> = {}) {
  const callbacks = {
    onFechar: jest.fn(),
    onSelecionarTela: jest.fn(),
    onConfigurarMeta: jest.fn(),
    onSincronizar: jest.fn(),
    onEntrarOuCriarConta: jest.fn(),
    onSairDaConta: jest.fn(),
  };
  const estadoSync: EstadoSync = { status: 'sem_conta', mensagem: 'Entre para sincronizar na nuvem.' };
  await render(<MenuDrawer visivel usuario={null} estadoSync={estadoSync} {...callbacks} {...props} />);
  return callbacks;
}

const modaisAbertos = () => screen.container.queryAll((el) => el.type === 'Modal');

/** Garante que onFechar foi chamado uma vez e antes da ação do item. */
function esperarFechouAntes(onFechar: jest.Mock, acao: jest.Mock) {
  expect(onFechar).toHaveBeenCalledTimes(1);
  expect(acao).toHaveBeenCalledTimes(1);
  expect(onFechar.mock.invocationCallOrder[0]).toBeLessThan(acao.mock.invocationCallOrder[0]);
}

describe('MenuDrawer', () => {
  it('não mostra nada quando está fechado', async () => {
    await renderizar({ visivel: false });

    expect(modaisAbertos()).toHaveLength(0);
    expect(screen.queryByText(ITEM_DASHBOARD)).not.toBeOnTheScreen();
  });

  it('abre como modal transparente com fade', async () => {
    await renderizar();

    const [modal] = modaisAbertos();
    expect(modal).toHaveProp('transparent', true);
    expect(modal).toHaveProp('animationType', 'fade');
  });

  it('mostra cabeçalho, itens de navegação, seção Conta e rodapé', async () => {
    await renderizar();

    expect(screen.getByText('Amortiza')).toBeOnTheScreen();
    expect(screen.getByText('Gestão Operacional & Carteira Macro')).toBeOnTheScreen();
    expect(screen.getByText('✕')).toBeOnTheScreen();
    expect(screen.getByText(ITEM_DASHBOARD)).toBeOnTheScreen();
    expect(screen.getByText(ITEM_CARTEIRA)).toBeOnTheScreen();
    expect(screen.getByText(ITEM_META)).toBeOnTheScreen();
    expect(screen.getByText(ITEM_SYNC)).toBeOnTheScreen();
    expect(screen.getByText('Conta')).toBeOnTheScreen();
    expect(screen.getByText('Amortiza v1.2.0 • Offline-First')).toBeOnTheScreen();
  });

  it('"✕" e o botão "voltar" do Android (onRequestClose) chamam onFechar', async () => {
    const { onFechar, onSelecionarTela } = await renderizar();

    await fireEvent.press(screen.getByText('✕'));
    await fireEvent(modaisAbertos()[0], 'requestClose');

    expect(onFechar).toHaveBeenCalledTimes(2);
    expect(onSelecionarTela).not.toHaveBeenCalled();
  });

  it('"Dashboard da Semana" fecha o menu e seleciona a tela "dashboard"', async () => {
    const { onFechar, onSelecionarTela } = await renderizar();

    await fireEvent.press(screen.getByText(ITEM_DASHBOARD));

    esperarFechouAntes(onFechar, onSelecionarTela);
    expect(onSelecionarTela).toHaveBeenCalledWith('dashboard');
  });

  it('"Carteira & Controle Macro" fecha o menu e seleciona a tela "carteira"', async () => {
    const { onFechar, onSelecionarTela } = await renderizar();

    await fireEvent.press(screen.getByText(ITEM_CARTEIRA));

    esperarFechouAntes(onFechar, onSelecionarTela);
    expect(onSelecionarTela).toHaveBeenCalledWith('carteira');
  });

  it('"Configurar Meta Diária" fecha o menu e abre a configuração da meta', async () => {
    const { onFechar, onConfigurarMeta, onSincronizar } = await renderizar();

    await fireEvent.press(screen.getByText(ITEM_META));

    esperarFechouAntes(onFechar, onConfigurarMeta);
    expect(onSincronizar).not.toHaveBeenCalled();
  });

  it('"Sincronizar Dados" fecha o menu e sincroniza', async () => {
    const { onFechar, onSincronizar, onConfigurarMeta } = await renderizar();

    await fireEvent.press(screen.getByText(ITEM_SYNC));

    esperarFechouAntes(onFechar, onSincronizar);
    expect(onConfigurarMeta).not.toHaveBeenCalled();
  });

  describe('seção Conta sem usuário', () => {
    it('oferece "Entrar ou criar conta" e não mostra "Sair da conta"', async () => {
      await renderizar({ usuario: null });

      expect(screen.getByText(ITEM_ENTRAR)).toBeOnTheScreen();
      expect(screen.queryByText(ITEM_SAIR)).not.toBeOnTheScreen();
      expect(screen.queryByText('Conta conectada')).not.toBeOnTheScreen();
    });

    it('"Entrar ou criar conta" fecha o menu e abre o acesso', async () => {
      const { onFechar, onEntrarOuCriarConta, onSairDaConta } = await renderizar({ usuario: null });

      await fireEvent.press(screen.getByText(ITEM_ENTRAR));

      esperarFechouAntes(onFechar, onEntrarOuCriarConta);
      expect(onSairDaConta).not.toHaveBeenCalled();
    });

    it('o rodapé avisa que os dados ficam só no aparelho, sem destaque de erro', async () => {
      await renderizar({ usuario: null, estadoSync: { status: 'erro', mensagem: 'Falhou' } });

      const status = screen.getByTestId('drawer-status-sync');
      expect(status).toHaveTextContent(SEM_CONTA);
      expect(status).toHaveStyle({ color: '#475569' });
      expect(status).not.toHaveStyle({ color: cores.erro });
    });
  });

  describe('seção Conta com usuário logado', () => {
    it('mostra o e-mail em uma linha e "Sair da conta", sem "Entrar ou criar conta"', async () => {
      await renderizar({ usuario: USUARIO });

      const email = screen.getByText('joao@exemplo.com');
      expect(email).toHaveProp('numberOfLines', 1);
      expect(screen.getByText(ITEM_SAIR)).toBeOnTheScreen();
      expect(screen.queryByText(ITEM_ENTRAR)).not.toBeOnTheScreen();
    });

    it('usa "Conta conectada" quando o usuário não tem e-mail', async () => {
      await renderizar({ usuario: { ...USUARIO, email: null } });

      expect(screen.getByText('Conta conectada')).toBeOnTheScreen();
    });

    it('"Sair da conta" chama onSairDaConta sem fechar o menu (o Alert aparece sobre ele)', async () => {
      const { onFechar, onSairDaConta, onEntrarOuCriarConta } = await renderizar({ usuario: USUARIO });

      await fireEvent.press(screen.getByText(ITEM_SAIR));

      expect(onSairDaConta).toHaveBeenCalledTimes(1);
      expect(onFechar).not.toHaveBeenCalled();
      expect(onEntrarOuCriarConta).not.toHaveBeenCalled();
    });

    it.each<[EstadoSync, string]>([
      [{ status: 'ok', ultimaSync: isoLocal(8, 7) }, 'Sincronizado • 08:07'],
      [{ status: 'sincronizando' }, 'Sincronizando...'],
      [{ status: 'offline', mensagem: 'Sem conexão. Dados salvos no aparelho.' }, 'Offline'],
      [{ status: 'sem_conta' }, 'Aguardando sincronização'],
    ])('rodapé com status %j mostra "%s" sem destaque de erro', async (estadoSync, texto) => {
      await renderizar({ usuario: USUARIO, estadoSync });

      const status = screen.getByTestId('drawer-status-sync');
      expect(status).toHaveTextContent(texto);
      expect(status).toHaveStyle({ color: '#475569' });
      expect(status).toHaveProp('numberOfLines', 3);
    });

    it('rodapé com erro mostra a mensagem em vermelho', async () => {
      await renderizar({ usuario: USUARIO, estadoSync: { status: 'erro', mensagem: 'Sessão expirada. Entre novamente.' } });

      const status = screen.getByTestId('drawer-status-sync');
      expect(status).toHaveTextContent('Sessão expirada. Entre novamente.');
      expect(status).toHaveStyle({ color: cores.erro });
    });
  });

  it('acompanha a troca de usuário e de status recebida por props', async () => {
    const callbacks = {
      onFechar: jest.fn(),
      onSelecionarTela: jest.fn(),
      onConfigurarMeta: jest.fn(),
      onSincronizar: jest.fn(),
      onEntrarOuCriarConta: jest.fn(),
      onSairDaConta: jest.fn(),
    };
    await render(<MenuDrawer visivel usuario={null} estadoSync={{ status: 'sem_conta' }} {...callbacks} />);
    expect(screen.getByText(ITEM_ENTRAR)).toBeOnTheScreen();

    await screen.rerender(
      <MenuDrawer visivel usuario={USUARIO} estadoSync={{ status: 'sincronizando' }} {...callbacks} />
    );

    expect(screen.queryByText(ITEM_ENTRAR)).not.toBeOnTheScreen();
    expect(screen.getByText(ITEM_SAIR)).toBeOnTheScreen();
    expect(screen.getByTestId('drawer-status-sync')).toHaveTextContent('Sincronizando...');
  });
});
