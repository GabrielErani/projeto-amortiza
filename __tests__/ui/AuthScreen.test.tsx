// Testes de src/screens/AuthScreen.tsx: SENHA_MINIMA, emailValido, validarFormularioAuth e a tela de acesso
// (entrar, criar conta, confirmação de e-mail, recuperar senha, continuar sem conta e voltar).
//
// O serviço de autenticação (src/services/auth) é mockado: nenhum teste acessa o Supabase.
// O BackHandler do preset de testes é o stub de iOS (não emite eventos), então ele é espionado.

import React from 'react';
import { BackHandler, TextInput } from 'react-native';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import {
  AuthScreen,
  emailValido,
  SENHA_MINIMA,
  validarFormularioAuth,
  type AuthScreenProps,
  type ModoAuth,
} from '../../src/screens/AuthScreen';
import { cadastrar, entrar, recuperarSenha } from '../../src/services/auth';
import type { ResultadoServico, Usuario } from '../../src/types';

jest.mock('../../src/services/auth', () => ({
  entrar: jest.fn(),
  cadastrar: jest.fn(),
  recuperarSenha: jest.fn(),
  sair: jest.fn(),
  observarSessao: jest.fn(),
}));

const entrarMock = jest.mocked(entrar);
const cadastrarMock = jest.mocked(cadastrar);
const recuperarSenhaMock = jest.mocked(recuperarSenha);

const USUARIO: Usuario = { id: 'user-123', email: 'joao@exemplo.com', nome: 'João' };

const MSG = {
  nome: 'Informe seu nome.',
  emailVazio: 'Informe seu e-mail.',
  emailInvalido: 'E-mail inválido. Verifique e tente novamente.',
  senhaVazia: 'Informe sua senha.',
  senhaCurta: 'A senha precisa ter pelo menos 6 caracteres.',
  emailParaRecuperar: 'Digite seu e-mail acima para recuperar a senha.',
};
const TEXTO_ENTRAR = 'Entre para sincronizar seus ganhos e dívidas na nuvem.';
const TEXTO_CADASTRAR = 'Crie sua conta para guardar seus dados na nuvem e usar em outros aparelhos.';

/** O mock de TextInput do React Native compartilha um jest.fn de focus() entre todas as instâncias. */
const focoDoTextInput = (TextInput as unknown as { prototype: { focus: jest.Mock } }).prototype.focus;

function adiado<T>() {
  let resolver!: (valor: T) => void;
  const promessa = new Promise<T>((resolve) => {
    resolver = resolve;
  });
  return { promessa, resolver };
}

// ─── Auxiliares de tela ───────────────────────────────────────────────────────

async function renderizar(props: Partial<AuthScreenProps> = {}) {
  const onContinuarSemConta = jest.fn();
  await render(<AuthScreen onContinuarSemConta={onContinuarSemConta} {...props} />);
  return { onContinuarSemConta };
}

const botaoPrincipal = () => screen.getByTestId('auth-botao-principal');
const pilula = (modo: ModoAuth) => screen.getByTestId(`auth-modo-${modo}`);
const campoNome = () => screen.getByLabelText('Nome');
const campoEmail = () => screen.getByLabelText('E-mail');
const campoSenha = () => screen.getByLabelText('Senha');
const linkEsqueci = () => screen.getByRole('button', { name: /Esqueci minha senha|Enviando\.\.\./ });
const spinners = () => screen.container.queryAll((el) => el.type === 'ActivityIndicator');

async function preencher(campos: { nome?: string; email?: string; senha?: string }) {
  if (campos.nome !== undefined) await fireEvent.changeText(campoNome(), campos.nome);
  if (campos.email !== undefined) await fireEvent.changeText(campoEmail(), campos.email);
  if (campos.senha !== undefined) await fireEvent.changeText(campoSenha(), campos.senha);
}

async function irParaCadastro() {
  await fireEvent.press(pilula('cadastrar'));
}

// ─── Configuração ─────────────────────────────────────────────────────────────

let adicionarBackHandler: jest.SpyInstance;
let handlersVoltar: Array<() => boolean | null | undefined>;
const removerBackHandler = jest.fn();

beforeEach(() => {
  entrarMock.mockReset().mockResolvedValue({ success: true, data: USUARIO });
  cadastrarMock.mockReset().mockResolvedValue({ success: true, data: { precisaConfirmarEmail: false } });
  recuperarSenhaMock.mockReset().mockResolvedValue({ success: true, data: undefined });
  focoDoTextInput.mockClear();
  removerBackHandler.mockClear();
  handlersVoltar = [];
  adicionarBackHandler = jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_evento, handler) => {
    handlersVoltar.push(handler as () => boolean | null | undefined);
    return { remove: removerBackHandler };
  });
});

afterEach(() => {
  adicionarBackHandler.mockRestore();
});

// ─── Funções exportadas ───────────────────────────────────────────────────────

describe('SENHA_MINIMA', () => {
  it('exige pelo menos 6 caracteres (mesmo mínimo padrão do Supabase)', () => {
    expect(SENHA_MINIMA).toBe(6);
  });
});

describe('emailValido', () => {
  it.each(['joao@exemplo.com', 'maria.silva+app@empresa.com.br', 'a@b.co', '  joao@exemplo.com  '])(
    'aceita %j',
    (email) => {
      expect(emailValido(email)).toBe(true);
    }
  );

  it.each(['', '   ', 'joao', 'joao@', '@exemplo.com', 'joao@exemplo', 'joao@exemplo.c', 'joao silva@exemplo.com', 'joao@@exemplo.com'])(
    'rejeita %j',
    (email) => {
      expect(emailValido(email)).toBe(false);
    }
  );
});

describe('validarFormularioAuth', () => {
  const OK = { nome: 'João', email: 'joao@exemplo.com', senha: 'segredo1' };

  it.each<ModoAuth>(['entrar', 'cadastrar'])('devolve null quando está tudo certo (modo %s)', (modo) => {
    expect(validarFormularioAuth({ modo, ...OK })).toBeNull();
  });

  it('no cadastro exige o nome (espaços não contam)', () => {
    expect(validarFormularioAuth({ modo: 'cadastrar', ...OK, nome: '' })).toBe(MSG.nome);
    expect(validarFormularioAuth({ modo: 'cadastrar', ...OK, nome: '   ' })).toBe(MSG.nome);
  });

  it('ao entrar, o nome é ignorado', () => {
    expect(validarFormularioAuth({ modo: 'entrar', ...OK, nome: '' })).toBeNull();
  });

  it.each(['', '   '])('exige o e-mail (%j)', (email) => {
    expect(validarFormularioAuth({ modo: 'entrar', ...OK, email })).toBe(MSG.emailVazio);
  });

  it('rejeita e-mail inválido', () => {
    expect(validarFormularioAuth({ modo: 'entrar', ...OK, email: 'joao@exemplo' })).toBe(MSG.emailInvalido);
  });

  it('exige a senha', () => {
    expect(validarFormularioAuth({ modo: 'entrar', ...OK, senha: '' })).toBe(MSG.senhaVazia);
  });

  it('exige o mínimo de caracteres na senha (inclusive ao entrar)', () => {
    expect(validarFormularioAuth({ modo: 'entrar', ...OK, senha: '12345' })).toBe(MSG.senhaCurta);
    expect(validarFormularioAuth({ modo: 'cadastrar', ...OK, senha: '12345' })).toBe(MSG.senhaCurta);
    expect(validarFormularioAuth({ modo: 'entrar', ...OK, senha: '123456' })).toBeNull();
  });

  it('não apara a senha: espaços contam como caracteres', () => {
    expect(validarFormularioAuth({ modo: 'entrar', ...OK, senha: '      ' })).toBeNull();
  });

  it('devolve só o primeiro erro, na ordem nome → e-mail → senha', () => {
    expect(validarFormularioAuth({ modo: 'cadastrar', nome: '', email: '', senha: '' })).toBe(MSG.nome);
    expect(validarFormularioAuth({ modo: 'cadastrar', nome: 'João', email: 'x', senha: '' })).toBe(MSG.emailInvalido);
    expect(validarFormularioAuth({ modo: 'entrar', nome: '', email: 'joao@exemplo.com', senha: '1' })).toBe(MSG.senhaCurta);
  });
});

// ─── Tela ─────────────────────────────────────────────────────────────────────

describe('AuthScreen', () => {
  describe('estado inicial', () => {
    it('abre no modo "Entrar" com e-mail, senha e as ações de acesso', async () => {
      await renderizar();

      expect(screen.getByText('Amortiza')).toBeOnTheScreen();
      expect(screen.getByText('Gestão Operacional & Carteira Macro')).toBeOnTheScreen();
      expect(screen.getByRole('tab', { name: 'Entrar' })).toBeSelected();
      expect(screen.getByRole('tab', { name: 'Criar conta' })).not.toBeSelected();
      expect(screen.getByText(TEXTO_ENTRAR)).toBeOnTheScreen();
      expect(screen.queryByLabelText('Nome')).not.toBeOnTheScreen();
      expect(campoEmail()).toHaveDisplayValue('');
      expect(campoSenha()).toHaveDisplayValue('');
      expect(screen.getByRole('button', { name: 'Mostrar senha' })).toHaveTextContent('Mostrar');
      expect(botaoPrincipal()).toHaveAccessibleName('Entrar');
      expect(within(botaoPrincipal()).getByText('Entrar')).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Esqueci minha senha' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Continuar sem conta' })).toBeOnTheScreen();
      expect(screen.getByText('Sem conta, os dados ficam salvos só neste aparelho.')).toBeOnTheScreen();
      expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
    });

    it('as pílulas de modo ficam em uma lista de abas', async () => {
      await renderizar();

      expect(screen.getAllByRole('tab')).toHaveLength(2);
      // O contêiner não é "accessible", então não aparece em *ByRole; o papel fica na prop
      expect(pilula('entrar').parent).toHaveProp('accessibilityRole', 'tablist');
      expect(pilula('cadastrar').parent).toBe(pilula('entrar').parent);
    });

    it('campos com teclado e preenchimento automático adequados', async () => {
      await renderizar();

      expect(campoEmail()).toHaveProp('keyboardType', 'email-address');
      expect(campoEmail()).toHaveProp('autoCapitalize', 'none');
      expect(campoEmail()).toHaveProp('autoComplete', 'email');
      expect(campoEmail()).toHaveProp('placeholder', 'seu@email.com');
      expect(campoSenha()).toHaveProp('secureTextEntry', true);
      expect(campoSenha()).toHaveProp('autoComplete', 'current-password');
      expect(campoSenha()).toHaveProp('textContentType', 'password');
      expect(campoSenha()).toHaveProp('placeholder', 'Mínimo 6 caracteres');
      expect(campoSenha()).toHaveProp('returnKeyType', 'go');
    });

    it('sem onVoltar não mostra "Voltar" nem escuta o botão voltar do Android', async () => {
      await renderizar();

      expect(screen.queryByRole('button', { name: 'Voltar' })).not.toBeOnTheScreen();
      expect(adicionarBackHandler).not.toHaveBeenCalled();
    });
  });

  describe('alternar entre Entrar e Criar conta', () => {
    it('"Criar conta" mostra o campo Nome, troca textos e esconde "Esqueci minha senha"', async () => {
      await renderizar();

      await irParaCadastro();

      expect(screen.getByRole('tab', { name: 'Criar conta' })).toBeSelected();
      expect(screen.getByRole('tab', { name: 'Entrar' })).not.toBeSelected();
      expect(screen.getByText(TEXTO_CADASTRAR)).toBeOnTheScreen();
      expect(campoNome()).toHaveProp('placeholder', 'Como podemos te chamar?');
      expect(campoNome()).toHaveProp('autoCapitalize', 'words');
      expect(botaoPrincipal()).toHaveAccessibleName('Criar conta');
      expect(within(botaoPrincipal()).getByText('Criar conta')).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Esqueci minha senha' })).not.toBeOnTheScreen();
      expect(campoSenha()).toHaveProp('autoComplete', 'new-password');
      expect(campoSenha()).toHaveProp('textContentType', 'newPassword');
    });

    it('voltar para "Entrar" esconde o Nome e mantém e-mail e senha digitados', async () => {
      await renderizar();
      await irParaCadastro();
      await preencher({ nome: 'João', email: 'joao@exemplo.com', senha: 'segredo1' });

      await fireEvent.press(pilula('entrar'));

      expect(screen.queryByLabelText('Nome')).not.toBeOnTheScreen();
      expect(screen.getByText(TEXTO_ENTRAR)).toBeOnTheScreen();
      expect(campoEmail()).toHaveDisplayValue('joao@exemplo.com');
      expect(campoSenha()).toHaveDisplayValue('segredo1');
    });

    it('trocar de modo limpa o erro exibido', async () => {
      await renderizar();
      await fireEvent.press(botaoPrincipal());
      expect(screen.getByRole('alert')).toHaveTextContent(MSG.emailVazio);

      await irParaCadastro();

      expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
    });
  });

  it('"Mostrar"/"Ocultar" alterna a visibilidade da senha', async () => {
    await renderizar();

    await fireEvent.press(screen.getByRole('button', { name: 'Mostrar senha' }));
    expect(campoSenha()).toHaveProp('secureTextEntry', false);
    expect(screen.getByRole('button', { name: 'Ocultar senha' })).toHaveTextContent('Ocultar');

    await fireEvent.press(screen.getByRole('button', { name: 'Ocultar senha' }));
    expect(campoSenha()).toHaveProp('secureTextEntry', true);
    expect(screen.getByRole('button', { name: 'Mostrar senha' })).toBeOnTheScreen();
  });

  describe('validação no aparelho (sem chamar o serviço)', () => {
    it.each([
      [{}, MSG.emailVazio],
      [{ email: 'joao@exemplo' }, MSG.emailInvalido],
      [{ email: 'joao@exemplo.com' }, MSG.senhaVazia],
      [{ email: 'joao@exemplo.com', senha: '12345' }, MSG.senhaCurta],
    ])('ao entrar com %j mostra "%s"', async (campos, mensagem) => {
      await renderizar();
      await preencher(campos);

      await fireEvent.press(botaoPrincipal());

      expect(screen.getByRole('alert')).toHaveTextContent(mensagem);
      expect(entrarMock).not.toHaveBeenCalled();
    });

    it('no cadastro exige o nome antes de tudo', async () => {
      await renderizar();
      await irParaCadastro();
      await preencher({ email: 'joao@exemplo.com', senha: 'segredo1' });

      await fireEvent.press(botaoPrincipal());

      expect(screen.getByRole('alert')).toHaveTextContent(MSG.nome);
      expect(cadastrarMock).not.toHaveBeenCalled();
    });

    it.each([
      ['Nome', () => campoNome()],
      ['E-mail', () => campoEmail()],
      ['Senha', () => campoSenha()],
    ])('digitar no campo %s apaga o erro', async (_nome, campo) => {
      await renderizar();
      await irParaCadastro();
      await fireEvent.press(botaoPrincipal());
      expect(screen.getByRole('alert')).toHaveTextContent(MSG.nome);

      await fireEvent.changeText(campo(), 'a');

      expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
    });
  });

  describe('entrar', () => {
    it('envia e-mail e senha como digitados e não mostra erro no sucesso', async () => {
      await renderizar();
      await preencher({ email: ' Joao@Exemplo.com ', senha: 'segredo1' });

      await fireEvent.press(botaoPrincipal());

      expect(entrarMock).toHaveBeenCalledTimes(1);
      expect(entrarMock).toHaveBeenCalledWith(' Joao@Exemplo.com ', 'segredo1');
      expect(cadastrarMock).not.toHaveBeenCalled();
      expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
      // A troca de tela vem da sessão (App); aqui o formulário só volta a ficar disponível
      expect(botaoPrincipal()).toBeEnabled();
    });

    it('mostra na tela o erro devolvido pelo serviço', async () => {
      entrarMock.mockResolvedValueOnce({ success: false, error: 'E-mail ou senha incorretos.' });
      await renderizar();
      await preencher({ email: 'joao@exemplo.com', senha: 'errada1' });

      await fireEvent.press(botaoPrincipal());

      expect(screen.getByRole('alert')).toHaveTextContent('E-mail ou senha incorretos.');
      expect(botaoPrincipal()).toBeEnabled();
      expect(campoSenha()).toHaveDisplayValue('errada1');
    });

    it('a tecla "go" do teclado na senha também envia', async () => {
      await renderizar();
      await preencher({ email: 'joao@exemplo.com', senha: 'segredo1' });

      await fireEvent(campoSenha(), 'submitEditing');

      expect(entrarMock).toHaveBeenCalledWith('joao@exemplo.com', 'segredo1');
    });

    it('a tecla "próximo" passa do e-mail para a senha', async () => {
      await renderizar();

      await fireEvent(campoEmail(), 'submitEditing');

      expect(focoDoTextInput).toHaveBeenCalledTimes(1);
      const [campoFocado] = focoDoTextInput.mock.contexts as Array<{ props: { accessibilityLabel?: string } }>;
      expect(campoFocado.props.accessibilityLabel).toBe('Senha');
      expect(entrarMock).not.toHaveBeenCalled();
    });

    it('durante o envio bloqueia botão, abas, campos e link; envio duplo (botão ou teclado) é ignorado', async () => {
      const pendente = adiado<ResultadoServico<Usuario>>();
      entrarMock.mockReturnValueOnce(pendente.promessa);
      await renderizar();
      await preencher({ email: 'joao@exemplo.com', senha: 'segredo1' });

      const envio = fireEvent.press(botaoPrincipal());
      await waitFor(() => expect(botaoPrincipal()).toBeDisabled());

      expect(botaoPrincipal()).toBeBusy();
      expect(within(botaoPrincipal()).queryByText('Entrar')).not.toBeOnTheScreen();
      expect(botaoPrincipal().queryAll((el) => el.type === 'ActivityIndicator')).toHaveLength(1);
      expect(pilula('entrar')).toBeDisabled();
      expect(pilula('cadastrar')).toBeDisabled();
      expect(campoEmail()).toHaveProp('editable', false);
      expect(campoSenha()).toHaveProp('editable', false);
      expect(linkEsqueci()).toBeDisabled();

      // Segundo toque no botão (desabilitado) e "go" do teclado chamando o handler direto
      await fireEvent.press(botaoPrincipal());
      await act(async () => {
        campoSenha().props.onSubmitEditing();
      });
      expect(entrarMock).toHaveBeenCalledTimes(1);

      await act(async () => pendente.resolver({ success: true, data: USUARIO }));
      await envio;

      expect(botaoPrincipal()).toBeEnabled();
      expect(botaoPrincipal()).not.toBeBusy();
      expect(within(botaoPrincipal()).getByText('Entrar')).toBeOnTheScreen();
      expect(campoEmail()).toHaveProp('editable', true);
      expect(spinners()).toHaveLength(0);
    });

    it('"Continuar sem conta" continua disponível durante o envio', async () => {
      const pendente = adiado<ResultadoServico<Usuario>>();
      entrarMock.mockReturnValueOnce(pendente.promessa);
      const { onContinuarSemConta } = await renderizar();
      await preencher({ email: 'joao@exemplo.com', senha: 'segredo1' });

      const envio = fireEvent.press(botaoPrincipal());
      await waitFor(() => expect(botaoPrincipal()).toBeDisabled());
      await fireEvent.press(screen.getByRole('button', { name: 'Continuar sem conta' }));

      expect(onContinuarSemConta).toHaveBeenCalledTimes(1);
      await act(async () => pendente.resolver({ success: true, data: USUARIO }));
      await envio;
    });
  });

  describe('criar conta', () => {
    it('envia e-mail, senha e nome ao serviço', async () => {
      await renderizar();
      await irParaCadastro();
      await preencher({ nome: 'João Silva', email: 'joao@exemplo.com', senha: 'segredo1' });

      await fireEvent.press(botaoPrincipal());

      expect(cadastrarMock).toHaveBeenCalledTimes(1);
      expect(cadastrarMock).toHaveBeenCalledWith('joao@exemplo.com', 'segredo1', 'João Silva');
      expect(entrarMock).not.toHaveBeenCalled();
    });

    it('a tecla "próximo" passa do nome para o e-mail', async () => {
      await renderizar();
      await irParaCadastro();

      await fireEvent(campoNome(), 'submitEditing');

      const [campoFocado] = focoDoTextInput.mock.contexts as Array<{ props: { accessibilityLabel?: string } }>;
      expect(campoFocado.props.accessibilityLabel).toBe('E-mail');
    });

    it('sem confirmação de e-mail (sessão criada) permanece no formulário até o App trocar de tela', async () => {
      await renderizar();
      await irParaCadastro();
      await preencher({ nome: 'João', email: 'joao@exemplo.com', senha: 'segredo1' });

      await fireEvent.press(botaoPrincipal());

      expect(screen.queryByText('Confirme seu e-mail')).not.toBeOnTheScreen();
      expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
      expect(botaoPrincipal()).toBeEnabled();
    });

    it('mostra o erro do serviço e continua no modo cadastro', async () => {
      cadastrarMock.mockResolvedValueOnce({ success: false, error: 'Este e-mail já está cadastrado. Tente entrar.' });
      await renderizar();
      await irParaCadastro();
      await preencher({ nome: 'João', email: 'joao@exemplo.com', senha: 'segredo1' });

      await fireEvent.press(botaoPrincipal());

      expect(screen.getByRole('alert')).toHaveTextContent('Este e-mail já está cadastrado. Tente entrar.');
      expect(screen.getByRole('tab', { name: 'Criar conta' })).toBeSelected();
      expect(campoNome()).toHaveDisplayValue('João');
    });

    it('com confirmação pendente mostra "Confirme seu e-mail" com o e-mail normalizado', async () => {
      cadastrarMock.mockResolvedValueOnce({ success: true, data: { precisaConfirmarEmail: true } });
      const { onContinuarSemConta } = await renderizar();
      await irParaCadastro();
      await preencher({ nome: 'João', email: '  Joao@Exemplo.COM ', senha: 'segredo1' });

      await fireEvent.press(botaoPrincipal());

      expect(screen.getByText('Confirme seu e-mail')).toBeOnTheScreen();
      expect(
        screen.getByText(
          'Enviamos um link de confirmação para joao@exemplo.com. Abra o e-mail, confirme o cadastro e depois entre com sua senha.'
        )
      ).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Voltar para o login' })).toBeOnTheScreen();
      // O formulário some, mas "Continuar sem conta" segue disponível
      expect(screen.queryByRole('tab')).not.toBeOnTheScreen();
      expect(screen.queryByLabelText('E-mail')).not.toBeOnTheScreen();
      expect(screen.queryByTestId('auth-botao-principal')).not.toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('button', { name: 'Continuar sem conta' }));
      expect(onContinuarSemConta).toHaveBeenCalledTimes(1);
    });

    it('"Voltar para o login" reabre o formulário em "Entrar", mantendo o e-mail e limpando a senha', async () => {
      cadastrarMock.mockResolvedValueOnce({ success: true, data: { precisaConfirmarEmail: true } });
      await renderizar();
      await irParaCadastro();
      await preencher({ nome: 'João', email: 'joao@exemplo.com', senha: 'segredo1' });
      await fireEvent.press(botaoPrincipal());

      await fireEvent.press(screen.getByRole('button', { name: 'Voltar para o login' }));

      expect(screen.queryByText('Confirme seu e-mail')).not.toBeOnTheScreen();
      expect(screen.getByRole('tab', { name: 'Entrar' })).toBeSelected();
      expect(screen.queryByLabelText('Nome')).not.toBeOnTheScreen();
      expect(campoEmail()).toHaveDisplayValue('joao@exemplo.com');
      expect(campoSenha()).toHaveDisplayValue('');
      expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
    });
  });

  describe('recuperar senha', () => {
    it('sem e-mail pede para digitá-lo, sem chamar o serviço', async () => {
      await renderizar();

      await fireEvent.press(screen.getByRole('button', { name: 'Esqueci minha senha' }));

      expect(screen.getByRole('alert')).toHaveTextContent(MSG.emailParaRecuperar);
      expect(recuperarSenhaMock).not.toHaveBeenCalled();
    });

    it('com e-mail inválido avisa, sem chamar o serviço', async () => {
      await renderizar();
      await preencher({ email: 'joao@' });

      await fireEvent.press(screen.getByRole('button', { name: 'Esqueci minha senha' }));

      expect(screen.getByRole('alert')).toHaveTextContent(MSG.emailInvalido);
      expect(recuperarSenhaMock).not.toHaveBeenCalled();
    });

    it('envia o link e confirma para qual e-mail (normalizado) ele foi enviado', async () => {
      await renderizar();
      await preencher({ email: ' Joao@Exemplo.com ' });

      await fireEvent.press(screen.getByRole('button', { name: 'Esqueci minha senha' }));

      expect(recuperarSenhaMock).toHaveBeenCalledWith(' Joao@Exemplo.com ');
      expect(
        screen.getByText(
          'Enviamos um link para redefinir a senha para joao@exemplo.com. Verifique sua caixa de entrada.'
        )
      ).toBeOnTheScreen();
      expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
      expect(entrarMock).not.toHaveBeenCalled();
    });

    it('mostra o erro do serviço', async () => {
      recuperarSenhaMock.mockResolvedValueOnce({
        success: false,
        error: 'Muitas tentativas. Aguarde um instante e tente novamente.',
      });
      await renderizar();
      await preencher({ email: 'joao@exemplo.com' });

      await fireEvent.press(screen.getByRole('button', { name: 'Esqueci minha senha' }));

      expect(screen.getByRole('alert')).toHaveTextContent('Muitas tentativas. Aguarde um instante e tente novamente.');
      expect(screen.queryByText(/^Enviamos um link/)).not.toBeOnTheScreen();
    });

    it('durante o envio mostra "Enviando..." e bloqueia o formulário (sem indicador no botão principal)', async () => {
      const pendente = adiado<ResultadoServico>();
      recuperarSenhaMock.mockReturnValueOnce(pendente.promessa);
      await renderizar();
      await preencher({ email: 'joao@exemplo.com', senha: 'segredo1' });

      const envio = fireEvent.press(screen.getByRole('button', { name: 'Esqueci minha senha' }));
      await waitFor(() => expect(linkEsqueci()).toHaveTextContent('Enviando...'));

      expect(linkEsqueci()).toBeDisabled();
      expect(botaoPrincipal()).toBeDisabled();
      expect(botaoPrincipal()).not.toBeBusy();
      expect(spinners()).toHaveLength(0);
      await fireEvent.press(botaoPrincipal());
      expect(entrarMock).not.toHaveBeenCalled();

      await act(async () => pendente.resolver({ success: true, data: undefined }));
      await envio;

      expect(linkEsqueci()).toHaveTextContent('Esqueci minha senha');
      expect(linkEsqueci()).toBeEnabled();
    });

    it('o aviso de link enviado some ao enviar o formulário ou trocar de modo', async () => {
      await renderizar();
      await preencher({ email: 'joao@exemplo.com' });
      await fireEvent.press(screen.getByRole('button', { name: 'Esqueci minha senha' }));
      expect(screen.getByText(/^Enviamos um link/)).toBeOnTheScreen();

      await fireEvent.press(botaoPrincipal()); // falha na validação (sem senha)
      expect(screen.queryByText(/^Enviamos um link/)).not.toBeOnTheScreen();

      await fireEvent.press(screen.getByRole('button', { name: 'Esqueci minha senha' }));
      expect(screen.getByText(/^Enviamos um link/)).toBeOnTheScreen();
      await irParaCadastro();
      expect(screen.queryByText(/^Enviamos um link/)).not.toBeOnTheScreen();
    });
  });

  it('"Continuar sem conta" chama onContinuarSemConta sem usar o serviço', async () => {
    const { onContinuarSemConta } = await renderizar();

    await fireEvent.press(screen.getByRole('button', { name: 'Continuar sem conta' }));

    expect(onContinuarSemConta).toHaveBeenCalledTimes(1);
    expect(entrarMock).not.toHaveBeenCalled();
    expect(cadastrarMock).not.toHaveBeenCalled();
  });

  describe('aberta pelo menu (com onVoltar)', () => {
    it('mostra "Voltar", que chama onVoltar', async () => {
      const onVoltar = jest.fn();
      await renderizar({ onVoltar });

      await fireEvent.press(screen.getByRole('button', { name: 'Voltar' }));

      expect(onVoltar).toHaveBeenCalledTimes(1);
    });

    it('o botão voltar do Android chama onVoltar e é consumido', async () => {
      const onVoltar = jest.fn();
      await renderizar({ onVoltar });

      expect(adicionarBackHandler).toHaveBeenCalledWith('hardwareBackPress', expect.any(Function));
      const consumido = handlersVoltar[handlersVoltar.length - 1]();

      expect(consumido).toBe(true);
      expect(onVoltar).toHaveBeenCalledTimes(1);
    });

    it('para de escutar o botão voltar do Android ao desmontar', async () => {
      await renderizar({ onVoltar: jest.fn() });
      expect(removerBackHandler).not.toHaveBeenCalled();

      await screen.unmount();

      expect(removerBackHandler).toHaveBeenCalledTimes(1);
    });

    it('para de escutar quando onVoltar deixa de ser informado', async () => {
      const onContinuarSemConta = jest.fn();
      await render(<AuthScreen onContinuarSemConta={onContinuarSemConta} onVoltar={jest.fn()} />);

      await screen.rerender(<AuthScreen onContinuarSemConta={onContinuarSemConta} />);

      expect(removerBackHandler).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('button', { name: 'Voltar' })).not.toBeOnTheScreen();
    });
  });
});
