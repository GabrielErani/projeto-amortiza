import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SheetConta, inicialDe } from '../../src/components/SheetConta';
import { cores } from '../../src/theme';
import { EstadoSync, Usuario } from '../../src/types';

const USUARIO: Usuario = { id: 'u1', email: 'gabriel@exemplo.com', nome: 'Gabriel' };
const ULTIMA_SYNC = new Date(2026, 9, 21, 9, 30).toISOString();

function renderizar(over: Partial<React.ComponentProps<typeof SheetConta>> = {}) {
  const props: React.ComponentProps<typeof SheetConta> = {
    visivel: true,
    onFechar: jest.fn(),
    usuario: USUARIO,
    estadoSync: { status: 'ok', ultimaSync: ULTIMA_SYNC },
    metaBase: 120,
    onSincronizar: jest.fn(),
    onEditarMeta: jest.fn(),
    onEntrar: jest.fn(),
    onSair: jest.fn(),
    ...over,
  };
  return render(<SheetConta {...props} />).then(() => props);
}

describe('inicialDe', () => {
  it('usa a primeira letra do nome, em maiúscula', () => {
    expect(inicialDe({ id: '1', email: 'x@y.com', nome: 'gabriel' })).toBe('G');
  });

  it('ignora espaços no começo do nome', () => {
    expect(inicialDe({ id: '1', email: null, nome: '  joão' })).toBe('J');
  });

  it('sem nome (ou nome em branco), usa a inicial do e-mail', () => {
    expect(inicialDe({ id: '1', email: 'ana@exemplo.com', nome: null })).toBe('A');
    expect(inicialDe({ id: '1', email: 'bia@exemplo.com', nome: '   ' })).toBe('B');
  });

  it('mantém acentos ao capitalizar', () => {
    expect(inicialDe({ id: '1', email: null, nome: 'élio' })).toBe('É');
  });

  it('sem usuário ou sem nome/e-mail, usa um marcador neutro', () => {
    expect(inicialDe(null)).toBe('•');
    expect(inicialDe({ id: '1', email: null, nome: null })).toBe('•');
    expect(inicialDe({ id: '1', email: '  ', nome: '' })).toBe('•');
  });
});

describe('SheetConta', () => {
  it('invisível, não renderiza nada', async () => {
    await renderizar({ visivel: false });

    expect(screen.queryByText('Gabriel')).not.toBeOnTheScreen();
    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
  });

  describe('com usuário logado', () => {
    it('mostra inicial, nome e e-mail', async () => {
      await renderizar();

      expect(screen.getByText('G')).toBeOnTheScreen();
      expect(screen.getByText('Gabriel')).toBeOnTheScreen();
      expect(screen.getByText('gabriel@exemplo.com')).toBeOnTheScreen();
    });

    it('sem nome cadastrado, mostra "Sua conta" e a inicial do e-mail', async () => {
      await renderizar({ usuario: { id: 'u2', email: 'ana@exemplo.com', nome: null } });

      expect(screen.getByText('Sua conta')).toBeOnTheScreen();
      expect(screen.getByText('A')).toBeOnTheScreen();
    });

    it('mostra o estado da nuvem e oferece "Sincronizar agora" (botão secundário)', async () => {
      const props = await renderizar();

      expect(screen.getByText('Nuvem')).toBeOnTheScreen();
      expect(screen.getByText('Sincronizado às 09:30')).toHaveStyle({ color: cores.primaria });
      const sincronizar = screen.getByRole('button', { name: 'Sincronizar agora' });
      expect(sincronizar).toHaveStyle({ borderColor: cores.neutro });
      await fireEvent.press(sincronizar);

      expect(props.onSincronizar).toHaveBeenCalledTimes(1);
    });

    it('a linha "Nuvem" é só informativa (não é botão)', async () => {
      const props = await renderizar();

      expect(screen.queryByRole('button', { name: /^Nuvem/ })).not.toBeOnTheScreen();
      await fireEvent.press(screen.getByText('Sincronizado às 09:30'));
      expect(props.onSincronizar).not.toHaveBeenCalled();
    });

    it('enquanto sincroniza, "Sincronizar agora" fica ocupado e não aceita novo toque', async () => {
      const props = await renderizar({ estadoSync: { status: 'sincronizando', mensagem: 'Sincronizando...' } });

      const sincronizar = screen.getByRole('button', { name: 'Sincronizar agora' });
      expect(sincronizar).toBeBusy();
      expect(sincronizar).toBeDisabled();
      await fireEvent.press(sincronizar);
      expect(props.onSincronizar).not.toHaveBeenCalled();
    });

    it('mostra a mensagem de erro de sincronização', async () => {
      await renderizar({ estadoSync: { status: 'erro', mensagem: 'Sessão expirada. Entre novamente.' } });

      expect(screen.getByText('Sessão expirada. Entre novamente.')).toHaveStyle({ color: cores.erro });
    });

    it('mostra a meta diária formatada com "›" e a linha inteira é um botão para alterar', async () => {
      const props = await renderizar({ metaBase: 120 });

      expect(screen.getByText('Meta diária')).toBeOnTheScreen();
      expect(screen.getByText('R$ 120,00')).toBeOnTheScreen();
      expect(screen.getByText('›')).toBeOnTheScreen();
      const linha = screen.getByRole('button', { name: 'Meta diária, R$ 120,00' });
      expect(linha).toHaveProp('accessibilityHint', 'Alterar');
      await fireEvent.press(linha);

      expect(props.onEditarMeta).toHaveBeenCalledTimes(1);
    });

    it('oferece "Sair da conta" como botão de perigo (e não "Entrar")', async () => {
      const props = await renderizar();

      const sair = screen.getByRole('button', { name: 'Sair da conta' });
      expect(sair).toHaveStyle({ borderColor: cores.erroBorda });
      await fireEvent.press(sair);

      expect(props.onSair).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('button', { name: 'Entrar ou criar conta' })).not.toBeOnTheScreen();
    });

    it('tocar no fundo fecha o sheet', async () => {
      const props = await renderizar();

      await fireEvent.press(screen.getByLabelText('Fechar'));

      expect(props.onFechar).toHaveBeenCalledTimes(1);
    });
  });

  describe('sem conta (modo offline)', () => {
    const SEM_CONTA: EstadoSync = { status: 'sem_conta', mensagem: 'Entre para sincronizar na nuvem.' };

    it('explica que o app funciona só neste aparelho e usa o marcador neutro', async () => {
      await renderizar({ usuario: null, estadoSync: SEM_CONTA });

      expect(screen.getByText('Sem conta, o app funciona só neste aparelho.')).toBeOnTheScreen();
      expect(screen.getByText('•')).toBeOnTheScreen();
    });

    it('não mostra a linha da nuvem nem "Sincronizar agora"', async () => {
      const props = await renderizar({ usuario: null, estadoSync: SEM_CONTA });

      expect(screen.queryByText('Nuvem')).not.toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Sincronizar agora' })).not.toBeOnTheScreen();
      expect(props.onSincronizar).not.toHaveBeenCalled();
    });

    it('oferece "Entrar ou criar conta" (e não "Sair")', async () => {
      const props = await renderizar({ usuario: null, estadoSync: SEM_CONTA });

      const entrar = screen.getByRole('button', { name: 'Entrar ou criar conta' });
      expect(entrar).toHaveStyle({ backgroundColor: cores.primaria });
      await fireEvent.press(entrar);

      expect(props.onEntrar).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('button', { name: 'Sair da conta' })).not.toBeOnTheScreen();
    });

    it('a meta diária continua editável', async () => {
      const props = await renderizar({ usuario: null, estadoSync: SEM_CONTA, metaBase: 100 });

      await fireEvent.press(screen.getByText('R$ 100,00'));

      expect(props.onEditarMeta).toHaveBeenCalledTimes(1);
    });

    // Regressão do BUG documentado (linha "toque para entrar" que não fazia nada): sem conta, nenhum
    // texto promete "toque para entrar"; o convite é o botão primário, que de fato abre o login.
    it('nenhum convite "toque para entrar" fica sem ação', async () => {
      const props = await renderizar({ usuario: null, estadoSync: SEM_CONTA });

      expect(screen.queryByText(/toque para entrar/)).not.toBeOnTheScreen();
      await fireEvent.press(screen.getByText('Entrar ou criar conta'));

      expect(props.onEntrar).toHaveBeenCalledTimes(1);
    });
  });
});
