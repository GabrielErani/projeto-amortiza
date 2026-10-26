import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AuthScreen } from '../../src/screens/AuthScreen';
import { cadastrar, entrar, recuperarSenha } from '../../src/services/auth';
import { cores } from '../../src/theme';

jest.mock('../../src/services/auth', () => ({
  cadastrar: jest.fn(),
  entrar: jest.fn(),
  recuperarSenha: jest.fn(),
}));

const USUARIO = { id: 'u1', email: 'ana@exemplo.com', nome: 'Ana' };

const campoNome = () => screen.getByPlaceholderText('Como quer ser chamado');
const campoEmail = () => screen.getByPlaceholderText('voce@exemplo.com');
const campoSenha = () => screen.getByPlaceholderText('Mínimo 6 caracteres');
const indicadoresDeCarregamento = () =>
  screen.container.queryAll((el) => el.type === 'ActivityIndicator');

function deferred<T>() {
  let resolve: (v: T) => void = () => {};
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

async function renderizar(props: Partial<React.ComponentProps<typeof AuthScreen>> = {}) {
  const onContinuarSemConta = jest.fn();
  await render(<AuthScreen onContinuarSemConta={onContinuarSemConta} {...props} />);
  return { onContinuarSemConta };
}

async function preencherLogin(email = 'ana@exemplo.com', senha = 'segredo1') {
  await fireEvent.changeText(campoEmail(), email);
  await fireEvent.changeText(campoSenha(), senha);
}

async function irParaCadastro() {
  await fireEvent.press(screen.getByRole('tab', { name: 'Criar conta' }));
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(entrar).mockResolvedValue({ success: true, data: USUARIO });
  jest.mocked(cadastrar).mockResolvedValue({ success: true, data: { precisaConfirmarEmail: true } });
  jest.mocked(recuperarSenha).mockResolvedValue({ success: true, data: undefined });
});

describe('AuthScreen', () => {
  describe('estrutura inicial (modo Entrar)', () => {
    it('mostra marca, abas, campos de e-mail e senha e o botão Entrar', async () => {
      await renderizar();

      expect(screen.getByRole('header', { name: 'Amortiza' })).toBeOnTheScreen();
      expect(screen.getByText('Suas metas da semana, no seu ritmo.')).toBeOnTheScreen();
      expect(screen.getByRole('tab', { name: 'Entrar' })).toBeSelected();
      expect(screen.getByRole('tab', { name: 'Criar conta' })).not.toBeSelected();
      expect(campoEmail()).toBeOnTheScreen();
      expect(campoSenha()).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Esqueci minha senha' })).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Continuar sem conta' })).toBeOnTheScreen();
    });

    it('o selo "A" da marca é decorativo (oculto para leitores de tela)', async () => {
      await renderizar();

      expect(screen.queryByText('A')).not.toBeOnTheScreen();
      expect(screen.getByText('A', { includeHiddenElements: true }).parent).toHaveStyle({ backgroundColor: cores.primaria });
    });

    it('Entrar | Criar conta é um controle segmentado (tablist) com o segmento ativo destacado', async () => {
      await renderizar();

      const entrarAba = screen.getByRole('tab', { name: 'Entrar' });
      expect(entrarAba.parent).toHaveProp('accessibilityRole', 'tablist');
      expect(entrarAba).toHaveStyle({ backgroundColor: cores.superficieAlta });
      expect(screen.getByRole('tab', { name: 'Criar conta' })).not.toHaveStyle({ backgroundColor: cores.superficieAlta });
    });

    it('ordem do mockup: botão primário, "Esqueci minha senha", divisor "ou" e "Continuar sem conta"', async () => {
      await renderizar();

      const botoes = screen.getAllByRole('button').map((b) => b.props.accessibilityLabel);
      expect(botoes.slice(-3)).toEqual(['Entrar', 'Esqueci minha senha', 'Continuar sem conta']);
      expect(screen.getByText('ou')).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Entrar' })).toHaveStyle({ backgroundColor: cores.primaria });
      expect(screen.getByRole('button', { name: 'Continuar sem conta' })).toHaveStyle({ borderColor: cores.neutro });
    });

    it('os campos usam o rótulo como nome acessível', async () => {
      await renderizar();

      expect(screen.getByLabelText('E-mail')).toBe(campoEmail());
      expect(screen.getByLabelText('Senha')).toBe(campoSenha());
    });

    it('não mostra o campo Nome no modo Entrar', async () => {
      await renderizar();

      expect(screen.queryByPlaceholderText('Como quer ser chamado')).not.toBeOnTheScreen();
      expect(screen.queryByText('Nome')).not.toBeOnTheScreen();
    });

    it('configura o teclado e o autocompletar dos campos', async () => {
      await renderizar();

      expect(campoEmail()).toHaveProp('keyboardType', 'email-address');
      expect(campoEmail()).toHaveProp('autoCapitalize', 'none');
      expect(campoSenha()).toHaveProp('textContentType', 'password');
    });
  });

  describe('alternar Entrar / Criar conta', () => {
    it('"Criar conta" mostra o campo Nome, troca o botão e esconde "Esqueci minha senha"', async () => {
      await renderizar();

      await irParaCadastro();

      expect(screen.getByRole('tab', { name: 'Criar conta' })).toBeSelected();
      expect(screen.getByText('Nome')).toBeOnTheScreen();
      expect(campoNome()).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Criar conta' })).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Entrar' })).not.toBeOnTheScreen();
      expect(screen.queryByText('Esqueci minha senha')).not.toBeOnTheScreen();
      expect(campoSenha()).toHaveProp('textContentType', 'newPassword');
    });

    it('voltar para "Entrar" esconde o campo Nome', async () => {
      await renderizar();
      await irParaCadastro();

      await fireEvent.press(screen.getByRole('tab', { name: 'Entrar' }));

      expect(screen.queryByPlaceholderText('Como quer ser chamado')).not.toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Entrar' })).toBeOnTheScreen();
    });

    it('trocar de aba limpa os erros exibidos', async () => {
      await renderizar();
      await fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));
      expect(screen.getByText('Informe um e-mail válido.')).toBeOnTheScreen();

      await irParaCadastro();

      expect(screen.queryByText('Informe um e-mail válido.')).not.toBeOnTheScreen();
    });

    it('mantém o e-mail e a senha digitados ao trocar de aba', async () => {
      await renderizar();
      await preencherLogin();

      await irParaCadastro();

      expect(campoEmail()).toHaveDisplayValue('ana@exemplo.com');
      expect(campoSenha()).toHaveDisplayValue('segredo1');
    });
  });

  describe('mostrar/ocultar senha', () => {
    it('a senha começa oculta e alterna com "Mostrar"/"Ocultar" (nomes acessíveis "… senha")', async () => {
      await renderizar();
      expect(campoSenha()).toHaveProp('secureTextEntry', true);
      expect(screen.getByText('Mostrar')).toBeOnTheScreen();

      await fireEvent.press(screen.getByRole('button', { name: 'Mostrar senha' }));
      expect(campoSenha()).toHaveProp('secureTextEntry', false);
      expect(screen.getByText('Ocultar')).toBeOnTheScreen();

      await fireEvent.press(screen.getByRole('button', { name: 'Ocultar senha' }));
      expect(campoSenha()).toHaveProp('secureTextEntry', true);
      expect(screen.getByRole('button', { name: 'Mostrar senha' })).toBeOnTheScreen();
    });
  });

  describe('validação inline (sem chamar o serviço)', () => {
    it('campos vazios: erro de e-mail e de senha', async () => {
      await renderizar();

      await fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));

      expect(screen.getByText('Informe um e-mail válido.')).toBeOnTheScreen();
      expect(screen.getByText('A senha precisa ter pelo menos 6 caracteres.')).toBeOnTheScreen();
      expect(entrar).not.toHaveBeenCalled();
    });

    it.each(['ana', 'ana@', 'ana@exemplo', 'ana@exemplo.c', 'ana @exemplo.com'])('e-mail inválido "%s"', async (email) => {
      await renderizar();
      await preencherLogin(email, 'segredo1');

      await fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));

      expect(screen.getByText('Informe um e-mail válido.')).toBeOnTheScreen();
      expect(screen.queryByText('A senha precisa ter pelo menos 6 caracteres.')).not.toBeOnTheScreen();
      expect(entrar).not.toHaveBeenCalled();
    });

    it('senha com menos de 6 caracteres', async () => {
      await renderizar();
      await preencherLogin('ana@exemplo.com', '12345');

      await fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));

      expect(screen.getByText('A senha precisa ter pelo menos 6 caracteres.')).toBeOnTheScreen();
      expect(screen.queryByText('Informe um e-mail válido.')).not.toBeOnTheScreen();
      expect(entrar).not.toHaveBeenCalled();
    });

    it('no cadastro, nome vazio (ou só espaços) é obrigatório', async () => {
      await renderizar();
      await irParaCadastro();
      await fireEvent.changeText(campoNome(), '   ');
      await preencherLogin();

      await fireEvent.press(screen.getByRole('button', { name: 'Criar conta' }));

      expect(screen.getByText('Informe seu nome.')).toBeOnTheScreen();
      expect(cadastrar).not.toHaveBeenCalled();
    });

    it('no cadastro, valida nome, e-mail e senha ao mesmo tempo', async () => {
      await renderizar();
      await irParaCadastro();

      await fireEvent.press(screen.getByRole('button', { name: 'Criar conta' }));

      expect(screen.getByText('Informe seu nome.')).toBeOnTheScreen();
      expect(screen.getByText('Informe um e-mail válido.')).toBeOnTheScreen();
      expect(screen.getByText('A senha precisa ter pelo menos 6 caracteres.')).toBeOnTheScreen();
      expect(cadastrar).not.toHaveBeenCalled();
    });

    it('corrigir os campos e reenviar remove os erros antigos', async () => {
      await renderizar();
      await fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));

      await preencherLogin();
      await fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));

      expect(screen.queryByText('Informe um e-mail válido.')).not.toBeOnTheScreen();
      expect(screen.queryByText('A senha precisa ter pelo menos 6 caracteres.')).not.toBeOnTheScreen();
      expect(entrar).toHaveBeenCalledTimes(1);
    });
  });

  describe('entrar', () => {
    it('com sucesso, chama entrar(email sem espaços, senha) e não mostra erro', async () => {
      await renderizar();
      await preencherLogin('  ana@exemplo.com  ', 'segredo1');

      await fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));

      expect(entrar).toHaveBeenCalledTimes(1);
      expect(entrar).toHaveBeenCalledWith('ana@exemplo.com', 'segredo1');
      expect(cadastrar).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled();
    });

    it('a senha é enviada exatamente como digitada (sem trim)', async () => {
      await renderizar();
      await preencherLogin('ana@exemplo.com', ' com espaço ');

      await fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));

      expect(entrar).toHaveBeenCalledWith('ana@exemplo.com', ' com espaço ');
    });

    it('erro do serviço aparece na tela', async () => {
      jest.mocked(entrar).mockResolvedValue({ success: false, error: 'E-mail ou senha incorretos.' });
      await renderizar();
      await preencherLogin();

      await fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));

      expect(screen.getByText('E-mail ou senha incorretos.')).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled();
    });

    it('o erro do serviço aparece numa faixa com papel de alerta', async () => {
      jest.mocked(entrar).mockResolvedValue({ success: false, error: 'E-mail ou senha incorretos.' });
      await renderizar();
      await preencherLogin();

      await fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));

      const alerta = screen.getByRole('alert');
      expect(alerta).toHaveTextContent('E-mail ou senha incorretos.');
      expect(alerta).toHaveStyle({ backgroundColor: cores.erroSuave });
    });

    it('confirmar no teclado (submitEditing da senha) também envia', async () => {
      await renderizar();
      await preencherLogin();

      await fireEvent(campoSenha(), 'submitEditing');

      expect(entrar).toHaveBeenCalledWith('ana@exemplo.com', 'segredo1');
    });

    it('o botão fica desabilitado e com carregamento enquanto a promise está pendente', async () => {
      const pendente = deferred<Awaited<ReturnType<typeof entrar>>>();
      jest.mocked(entrar).mockReturnValue(pendente.promise);
      await renderizar();
      await preencherLogin();
      const botao = screen.getByRole('button', { name: 'Entrar' });

      // Não aguardamos o press: o handler só termina quando a promise resolver.
      const envio = fireEvent.press(botao);
      await waitFor(() => expect(botao).toBeDisabled());
      expect(indicadoresDeCarregamento()).toHaveLength(1);
      // Durante o carregamento o botão continua achável pelo nome e anuncia que está ocupado.
      expect(screen.getByRole('button', { name: 'Entrar' })).toBeBusy();
      expect(screen.getByRole('button', { name: 'Esqueci minha senha' })).toBeDisabled();

      // Toques extras no botão e no "Esqueci minha senha" são ignorados.
      await fireEvent.press(botao);
      await fireEvent.press(screen.getByText('Esqueci minha senha'));
      expect(entrar).toHaveBeenCalledTimes(1);
      expect(recuperarSenha).not.toHaveBeenCalled();

      await act(async () => pendente.resolve({ success: false, error: 'Sem conexão com a internet. Verifique sua rede.' }));
      await envio;

      expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Entrar' })).not.toBeBusy();
      expect(indicadoresDeCarregamento()).toHaveLength(0);
      expect(screen.getByText('Sem conexão com a internet. Verifique sua rede.')).toBeOnTheScreen();
    });

    // BUG documentado (ver relatório): enviar() não verifica `carregando`. Com o botão já desabilitado,
    // o "done" do teclado (onSubmitEditing do campo de senha) dispara um segundo entrar().
    it('confirmar pelo teclado durante um envio pendente não chama entrar() de novo', async () => {
      const pendentes: Array<ReturnType<typeof deferred<Awaited<ReturnType<typeof entrar>>>>> = [];
      jest.mocked(entrar).mockImplementation(() => {
        const p = deferred<Awaited<ReturnType<typeof entrar>>>();
        pendentes.push(p);
        return p.promise;
      });
      await renderizar();
      await preencherLogin();
      const botao = screen.getByRole('button', { name: 'Entrar' });
      const envio = fireEvent.press(botao);
      await waitFor(() => expect(botao).toBeDisabled());

      // Com o botão desabilitado, o usuário confirma pelo teclado.
      const envioTeclado = fireEvent(campoSenha(), 'submitEditing');
      await waitFor(() => expect(botao).toBeDisabled()); // deixa o evento do teclado assentar
      await act(async () => pendentes.forEach((p) => p.resolve({ success: true, data: USUARIO })));
      await envio;
      await envioTeclado;

      expect(entrar).toHaveBeenCalledTimes(1);
    });
  });

  describe('criar conta', () => {
    async function preencherCadastro() {
      await irParaCadastro();
      await fireEvent.changeText(campoNome(), '  Ana  ');
      await preencherLogin(' ana@exemplo.com ', 'segredo1');
    }

    it('chama cadastrar(email, senha, nome) com espaços removidos de e-mail e nome', async () => {
      await renderizar();
      await preencherCadastro();

      await fireEvent.press(screen.getByRole('button', { name: 'Criar conta' }));

      expect(cadastrar).toHaveBeenCalledTimes(1);
      expect(cadastrar).toHaveBeenCalledWith('ana@exemplo.com', 'segredo1', 'Ana');
      expect(entrar).not.toHaveBeenCalled();
    });

    it('quando precisa confirmar o e-mail, mostra o aviso e o botão para voltar ao login', async () => {
      await renderizar();
      await preencherCadastro();

      await fireEvent.press(screen.getByRole('button', { name: 'Criar conta' }));

      expect(screen.getByText('Confirme seu e-mail')).toBeOnTheScreen();
      expect(
        screen.getByText('Enviamos um link para ana@exemplo.com. Abra o e-mail, confirme e volte para entrar.'),
      ).toBeOnTheScreen();
      // O e-mail aparece em destaque dentro do texto.
      expect(screen.getByText('ana@exemplo.com')).toHaveStyle({ color: cores.texto, fontWeight: '700' });
      // O círculo com ✓ é decorativo.
      expect(screen.getByText('✓', { includeHiddenElements: true }).parent).toHaveStyle({ backgroundColor: cores.primariaSuave });
      // O formulário (e o "Continuar sem conta") some enquanto o aviso está visível.
      expect(screen.queryByRole('tab')).not.toBeOnTheScreen();
      expect(screen.queryByPlaceholderText('voce@exemplo.com')).not.toBeOnTheScreen();
      expect(screen.queryByText('Continuar sem conta')).not.toBeOnTheScreen();
    });

    it('"Voltar para entrar" volta ao formulário no modo Entrar, mantendo o e-mail', async () => {
      await renderizar();
      await preencherCadastro();
      await fireEvent.press(screen.getByRole('button', { name: 'Criar conta' }));

      await fireEvent.press(screen.getByRole('button', { name: 'Voltar para entrar' }));

      expect(screen.queryByText('Confirme seu e-mail')).not.toBeOnTheScreen();
      expect(screen.getByRole('tab', { name: 'Entrar' })).toBeSelected();
      expect(screen.queryByPlaceholderText('Como quer ser chamado')).not.toBeOnTheScreen();
      expect(campoEmail()).toHaveDisplayValue(' ana@exemplo.com ');
    });

    it('quando não precisa confirmar o e-mail, permanece no formulário (o App troca de tela pela sessão)', async () => {
      jest.mocked(cadastrar).mockResolvedValue({ success: true, data: { precisaConfirmarEmail: false } });
      await renderizar();
      await preencherCadastro();

      await fireEvent.press(screen.getByRole('button', { name: 'Criar conta' }));

      expect(screen.queryByText('Confirme seu e-mail')).not.toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Criar conta' })).toBeEnabled();
    });

    it('erro do serviço aparece na tela', async () => {
      jest.mocked(cadastrar).mockResolvedValue({ success: false, error: 'Este e-mail já está cadastrado. Tente entrar.' });
      await renderizar();
      await preencherCadastro();

      await fireEvent.press(screen.getByRole('button', { name: 'Criar conta' }));

      expect(screen.getByText('Este e-mail já está cadastrado. Tente entrar.')).toBeOnTheScreen();
      expect(screen.queryByText('Confirme seu e-mail')).not.toBeOnTheScreen();
    });

    it('o botão fica desabilitado enquanto o cadastro está pendente', async () => {
      const pendente = deferred<Awaited<ReturnType<typeof cadastrar>>>();
      jest.mocked(cadastrar).mockReturnValue(pendente.promise);
      await renderizar();
      await preencherCadastro();
      const botao = screen.getByRole('button', { name: 'Criar conta' });

      const envio = fireEvent.press(botao);
      await waitFor(() => expect(botao).toBeDisabled());
      await fireEvent.press(botao);
      expect(cadastrar).toHaveBeenCalledTimes(1);

      await act(async () => pendente.resolve({ success: true, data: { precisaConfirmarEmail: true } }));
      await envio;
      expect(screen.getByText('Confirme seu e-mail')).toBeOnTheScreen();
    });
  });

  describe('recuperar senha', () => {
    it('sem e-mail válido, pede o e-mail e não chama o serviço', async () => {
      await renderizar();
      await fireEvent.changeText(campoEmail(), 'ana@');

      await fireEvent.press(screen.getByText('Esqueci minha senha'));

      expect(screen.getByText('Digite seu e-mail para recuperar a senha.')).toBeOnTheScreen();
      expect(recuperarSenha).not.toHaveBeenCalled();
    });

    it('com e-mail válido, chama recuperarSenha e mostra a confirmação', async () => {
      await renderizar();
      await fireEvent.changeText(campoEmail(), ' ana@exemplo.com ');

      await fireEvent.press(screen.getByText('Esqueci minha senha'));

      expect(recuperarSenha).toHaveBeenCalledTimes(1);
      expect(recuperarSenha).toHaveBeenCalledWith('ana@exemplo.com');
      expect(screen.getByText('Link enviado')).toBeOnTheScreen();
      expect(
        screen.getByText('Se ana@exemplo.com estiver cadastrado, você receberá um e-mail para redefinir a senha.'),
      ).toBeOnTheScreen();
    });

    it('"Voltar" na confirmação retorna ao formulário', async () => {
      await renderizar();
      await fireEvent.changeText(campoEmail(), 'ana@exemplo.com');
      await fireEvent.press(screen.getByText('Esqueci minha senha'));

      await fireEvent.press(screen.getByRole('button', { name: 'Voltar' }));

      expect(screen.queryByText('Link enviado')).not.toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Entrar' })).toBeOnTheScreen();
    });

    it('erro do serviço aparece na tela e mantém o formulário', async () => {
      jest.mocked(recuperarSenha).mockResolvedValue({ success: false, error: 'Muitas tentativas. Aguarde um instante e tente novamente.' });
      await renderizar();
      await fireEvent.changeText(campoEmail(), 'ana@exemplo.com');

      await fireEvent.press(screen.getByText('Esqueci minha senha'));

      expect(screen.getByText('Muitas tentativas. Aguarde um instante e tente novamente.')).toBeOnTheScreen();
      expect(screen.queryByText('Link enviado')).not.toBeOnTheScreen();
    });
  });

  describe('rodapé', () => {
    it('"Continuar sem conta" chama o callback correspondente', async () => {
      const { onContinuarSemConta } = await renderizar();

      await fireEvent.press(screen.getByText('Continuar sem conta'));

      expect(onContinuarSemConta).toHaveBeenCalledTimes(1);
      expect(entrar).not.toHaveBeenCalled();
    });

    it('aberta de dentro do app (onVoltar), mostra "Voltar" no lugar de "Continuar sem conta"', async () => {
      const onVoltar = jest.fn();
      const { onContinuarSemConta } = await renderizar({ onVoltar });

      expect(screen.queryByText('Continuar sem conta')).not.toBeOnTheScreen();
      // Sem o divisor "ou": "Voltar" é um botão de texto discreto.
      expect(screen.queryByText('ou')).not.toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('button', { name: 'Voltar' }));

      expect(onVoltar).toHaveBeenCalledTimes(1);
      expect(onContinuarSemConta).not.toHaveBeenCalled();
    });
  });
});
