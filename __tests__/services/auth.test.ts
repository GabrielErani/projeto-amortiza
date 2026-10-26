// Testes unitários do serviço de autenticação (src/services/auth.ts).
// O cliente Supabase é substituído por um objeto `supabase.auth` com jest.fn,
// então nenhum teste acessa a rede.

import {
  cadastrar,
  entrar,
  observarSessao,
  obterUsuarioAtual,
  recuperarSenha,
  sair,
  traduzirErroAuth,
} from '../../src/services/auth';
import { supabase } from '../../src/services/supabase';

jest.mock('../../src/services/supabase', () => ({
  supabase: {
    auth: {
      signUp: jest.fn(),
      signInWithPassword: jest.fn(),
      signOut: jest.fn(),
      resetPasswordForEmail: jest.fn(),
      getSession: jest.fn(),
      getUser: jest.fn(),
      onAuthStateChange: jest.fn(),
    },
  },
}));

type MetodoAuth =
  | 'signUp'
  | 'signInWithPassword'
  | 'signOut'
  | 'resetPasswordForEmail'
  | 'getSession'
  | 'getUser'
  | 'onAuthStateChange';

const authMock = supabase.auth as unknown as Record<MetodoAuth, jest.Mock>;
const cancelarInscricaoAuth = jest.fn();

const MSG_EMAIL_VAZIO = 'Informe seu e-mail.';
const MSG_EMAIL_INVALIDO = 'E-mail inválido. Verifique e tente novamente.';
const MSG_SENHA_VAZIA = 'Informe sua senha.';
const MSG_SENHA_CURTA = 'A senha precisa ter pelo menos 6 caracteres.';
const MSG_EMAIL_JA_CADASTRADO = 'Este e-mail já está cadastrado. Tente entrar.';
const MSG_SEM_CONEXAO = 'Sem conexão com a internet. Verifique sua rede.';
const MSG_ERRO_INESPERADO = 'Erro inesperado na autenticação.';

const EMAILS_INVALIDOS = [
  'joao',
  'joao@',
  '@exemplo.com',
  'joao@exemplo',
  'joao@exemplo.c',
  'joao silva@exemplo.com',
  'joao@@exemplo.com',
];

function usuarioSupabase(sobrescrever: Record<string, unknown> = {}) {
  return {
    id: 'user-123',
    email: 'joao@exemplo.com',
    user_metadata: { nome: 'João' },
    identities: [{ id: 'identidade-1', provider: 'email' }],
    ...sobrescrever,
  };
}

/** Deixa todas as promessas pendentes (microtarefas) resolverem. */
const esvaziarFila = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  Object.values(authMock).forEach((fn) => fn.mockReset());
  cancelarInscricaoAuth.mockReset();
  authMock.onAuthStateChange.mockImplementation(() => ({
    data: { subscription: { unsubscribe: cancelarInscricaoAuth } },
  }));
});

describe('traduzirErroAuth', () => {
  it.each([
    ['Invalid login credentials', 'E-mail ou senha incorretos.'],
    ['invalid_credentials', 'E-mail ou senha incorretos.'],
    ['Email not confirmed', 'E-mail ainda não confirmado. Verifique sua caixa de entrada.'],
    ['User already registered', MSG_EMAIL_JA_CADASTRADO],
    ['A user with this email address has already been registered', MSG_EMAIL_JA_CADASTRADO],
    ['Identity already exists', MSG_EMAIL_JA_CADASTRADO],
    ['Password should be at least 6 characters.', MSG_SENHA_CURTA],
    ['Weak password', MSG_SENHA_CURTA],
    ['Password is too short', MSG_SENHA_CURTA],
    ['Unable to validate email address: invalid format', MSG_EMAIL_INVALIDO],
    ['Invalid email', MSG_EMAIL_INVALIDO],
    ['invalid format', MSG_EMAIL_INVALIDO],
    ['Signup is disabled', 'Cadastro desativado neste projeto. Fale com o administrador.'],
    ['Signups not allowed for this instance', 'Cadastro desativado neste projeto. Fale com o administrador.'],
    ['Email rate limit exceeded', 'Muitas tentativas. Aguarde um instante e tente novamente.'],
    ['Too many requests', 'Muitas tentativas. Aguarde um instante e tente novamente.'],
    ['over_email_send_rate_limit', 'Muitas tentativas. Aguarde um instante e tente novamente.'],
    ['Network request failed', MSG_SEM_CONEXAO],
    ['Failed to fetch', MSG_SEM_CONEXAO],
    ['TypeError: fetch failed', MSG_SEM_CONEXAO],
    ['A network error occurred', MSG_SEM_CONEXAO],
    ['Auth session missing!', 'Sessão expirada. Entre novamente.'],
    ['Session expired', 'Sessão expirada. Entre novamente.'],
    ['User not found', 'Nenhuma conta encontrada com este e-mail.'],
  ])('traduz "%s"', (mensagem, esperado) => {
    expect(traduzirErroAuth(mensagem)).toBe(esperado);
  });

  it('ignora maiúsculas/minúsculas ao comparar', () => {
    expect(traduzirErroAuth('INVALID LOGIN CREDENTIALS')).toBe('E-mail ou senha incorretos.');
  });

  it('aplica a primeira regra que casar quando a mensagem tem vários termos', () => {
    expect(traduzirErroAuth('Invalid login credentials (network)')).toBe('E-mail ou senha incorretos.');
  });

  it('não confunde "session" sem "missing"/"expired" com sessão expirada', () => {
    expect(traduzirErroAuth('Session created')).toBe('Session created');
  });

  it('devolve a mensagem original quando não há tradução mapeada', () => {
    expect(traduzirErroAuth('Database error saving new user')).toBe('Database error saving new user');
  });

  it('usa mensagem genérica para mensagem vazia ou ausente', () => {
    expect(traduzirErroAuth('')).toBe(MSG_ERRO_INESPERADO);
    expect(traduzirErroAuth(undefined as unknown as string)).toBe(MSG_ERRO_INESPERADO);
    expect(traduzirErroAuth(null as unknown as string)).toBe(MSG_ERRO_INESPERADO);
  });
});

describe('cadastrar', () => {
  it('recusa e-mail vazio (ou só espaços) sem chamar a rede', async () => {
    await expect(cadastrar('', '123456')).resolves.toEqual({ success: false, error: MSG_EMAIL_VAZIO });
    await expect(cadastrar('   ', '123456')).resolves.toEqual({ success: false, error: MSG_EMAIL_VAZIO });
    expect(authMock.signUp).not.toHaveBeenCalled();
  });

  it.each(EMAILS_INVALIDOS)('recusa e-mail inválido "%s" sem chamar a rede', async (email) => {
    await expect(cadastrar(email, '123456')).resolves.toEqual({ success: false, error: MSG_EMAIL_INVALIDO });
    expect(authMock.signUp).not.toHaveBeenCalled();
  });

  it('recusa senha vazia sem chamar a rede', async () => {
    await expect(cadastrar('joao@exemplo.com', '')).resolves.toEqual({ success: false, error: MSG_SENHA_VAZIA });
    expect(authMock.signUp).not.toHaveBeenCalled();
  });

  it('recusa senha com menos de 6 caracteres sem chamar a rede', async () => {
    await expect(cadastrar('joao@exemplo.com', '12345')).resolves.toEqual({ success: false, error: MSG_SENHA_CURTA });
    expect(authMock.signUp).not.toHaveBeenCalled();
  });

  it('valida o e-mail antes da senha', async () => {
    await expect(cadastrar('invalido', '1')).resolves.toEqual({ success: false, error: MSG_EMAIL_INVALIDO });
  });

  it('aceita senha com exatamente 6 caracteres', async () => {
    authMock.signUp.mockResolvedValue({ data: { user: usuarioSupabase(), session: {} }, error: null });
    await expect(cadastrar('joao@exemplo.com', '123456')).resolves.toEqual({
      success: true,
      data: { precisaConfirmarEmail: false },
    });
    expect(authMock.signUp).toHaveBeenCalledTimes(1);
  });

  it('normaliza o e-mail (trim + minúsculas), mantém a senha e envia o nome aparado nos metadados', async () => {
    authMock.signUp.mockResolvedValue({ data: { user: usuarioSupabase(), session: {} }, error: null });
    await cadastrar('  Joao@Exemplo.COM ', ' Senha Forte ', '  João Silva  ');
    expect(authMock.signUp).toHaveBeenCalledWith({
      email: 'joao@exemplo.com',
      password: ' Senha Forte ',
      options: { data: { nome: 'João Silva' } },
    });
  });

  it('envia nome vazio quando o nome não é informado', async () => {
    authMock.signUp.mockResolvedValue({ data: { user: usuarioSupabase(), session: {} }, error: null });
    await cadastrar('joao@exemplo.com', '123456');
    expect(authMock.signUp).toHaveBeenCalledWith(
      expect.objectContaining({ options: { data: { nome: '' } } })
    );
  });

  it('retorna precisaConfirmarEmail=false quando o Supabase já devolve uma sessão', async () => {
    authMock.signUp.mockResolvedValue({
      data: { user: usuarioSupabase(), session: { access_token: 'token' } },
      error: null,
    });
    await expect(cadastrar('joao@exemplo.com', '123456')).resolves.toEqual({
      success: true,
      data: { precisaConfirmarEmail: false },
    });
  });

  it('retorna precisaConfirmarEmail=true quando não há sessão (confirmação de e-mail pendente)', async () => {
    authMock.signUp.mockResolvedValue({ data: { user: usuarioSupabase(), session: null }, error: null });
    await expect(cadastrar('joao@exemplo.com', '123456')).resolves.toEqual({
      success: true,
      data: { precisaConfirmarEmail: true },
    });
  });

  it('detecta e-mail já cadastrado quando o usuário volta com identities vazio', async () => {
    authMock.signUp.mockResolvedValue({
      data: { user: usuarioSupabase({ identities: [] }), session: null },
      error: null,
    });
    await expect(cadastrar('joao@exemplo.com', '123456')).resolves.toEqual({
      success: false,
      error: MSG_EMAIL_JA_CADASTRADO,
    });
  });

  it('não acusa e-mail existente quando identities não é um array', async () => {
    authMock.signUp.mockResolvedValue({
      data: { user: usuarioSupabase({ identities: undefined }), session: null },
      error: null,
    });
    await expect(cadastrar('joao@exemplo.com', '123456')).resolves.toEqual({
      success: true,
      data: { precisaConfirmarEmail: true },
    });
  });

  it('traduz o erro devolvido pelo Supabase', async () => {
    authMock.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'User already registered' },
    });
    await expect(cadastrar('joao@exemplo.com', '123456')).resolves.toEqual({
      success: false,
      error: MSG_EMAIL_JA_CADASTRADO,
    });
  });

  it('não lança quando a chamada rejeita e traduz a mensagem da exceção', async () => {
    authMock.signUp.mockRejectedValue(new Error('Network request failed'));
    await expect(cadastrar('joao@exemplo.com', '123456')).resolves.toEqual({
      success: false,
      error: MSG_SEM_CONEXAO,
    });
  });

  it('usa mensagem genérica quando a exceção não tem message', async () => {
    authMock.signUp.mockRejectedValue(undefined);
    await expect(cadastrar('joao@exemplo.com', '123456')).resolves.toEqual({
      success: false,
      error: MSG_ERRO_INESPERADO,
    });
  });
});

describe('entrar', () => {
  it('recusa e-mail vazio ou inválido sem chamar a rede', async () => {
    await expect(entrar('', 'segredo')).resolves.toEqual({ success: false, error: MSG_EMAIL_VAZIO });
    await expect(entrar('joao@exemplo', 'segredo')).resolves.toEqual({ success: false, error: MSG_EMAIL_INVALIDO });
    expect(authMock.signInWithPassword).not.toHaveBeenCalled();
  });

  it('recusa senha vazia sem chamar a rede', async () => {
    await expect(entrar('joao@exemplo.com', '')).resolves.toEqual({ success: false, error: MSG_SENHA_VAZIA });
    expect(authMock.signInWithPassword).not.toHaveBeenCalled();
  });

  it('não exige tamanho mínimo de senha no login (quem decide é o servidor)', async () => {
    authMock.signInWithPassword.mockResolvedValue({ data: { user: usuarioSupabase() }, error: null });
    const resultado = await entrar('joao@exemplo.com', '123');
    expect(resultado.success).toBe(true);
    expect(authMock.signInWithPassword).toHaveBeenCalledWith({ email: 'joao@exemplo.com', password: '123' });
  });

  it('normaliza o e-mail e devolve o usuário mapeado em caso de sucesso', async () => {
    authMock.signInWithPassword.mockResolvedValue({
      data: { user: usuarioSupabase({ user_metadata: { nome: '  Maria  ' } }) },
      error: null,
    });
    await expect(entrar('  JOAO@Exemplo.com ', 'segredo')).resolves.toEqual({
      success: true,
      data: { id: 'user-123', email: 'joao@exemplo.com', nome: 'Maria' },
    });
    expect(authMock.signInWithPassword).toHaveBeenCalledWith({ email: 'joao@exemplo.com', password: 'segredo' });
  });

  it.each([
    ['sem user_metadata', { user_metadata: undefined }],
    ['com nome em branco', { user_metadata: { nome: '   ' } }],
    ['com nome que não é texto', { user_metadata: { nome: 42 } }],
  ])('usa nome null quando o usuário vem %s', async (_caso, sobrescrever) => {
    authMock.signInWithPassword.mockResolvedValue({ data: { user: usuarioSupabase(sobrescrever) }, error: null });
    await expect(entrar('joao@exemplo.com', 'segredo')).resolves.toEqual({
      success: true,
      data: { id: 'user-123', email: 'joao@exemplo.com', nome: null },
    });
  });

  it('usa email null quando o usuário não tem e-mail', async () => {
    authMock.signInWithPassword.mockResolvedValue({
      data: { user: usuarioSupabase({ email: undefined }) },
      error: null,
    });
    await expect(entrar('joao@exemplo.com', 'segredo')).resolves.toEqual({
      success: true,
      data: { id: 'user-123', email: null, nome: 'João' },
    });
  });

  it('traduz o erro de credenciais inválidas', async () => {
    authMock.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials' },
    });
    await expect(entrar('joao@exemplo.com', 'errada')).resolves.toEqual({
      success: false,
      error: 'E-mail ou senha incorretos.',
    });
  });

  it('falha com mensagem própria quando não há erro mas também não há usuário', async () => {
    authMock.signInWithPassword.mockResolvedValue({ data: { user: null, session: null }, error: null });
    await expect(entrar('joao@exemplo.com', 'segredo')).resolves.toEqual({
      success: false,
      error: 'Não foi possível iniciar a sessão.',
    });
  });

  it('não lança quando a chamada rejeita e traduz a mensagem da exceção', async () => {
    authMock.signInWithPassword.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(entrar('joao@exemplo.com', 'segredo')).resolves.toEqual({
      success: false,
      error: MSG_SEM_CONEXAO,
    });
  });
});

describe('sair', () => {
  it('encerra a sessão no Supabase', async () => {
    authMock.signOut.mockResolvedValue({ error: null });
    await expect(sair()).resolves.toBeUndefined();
    expect(authMock.signOut).toHaveBeenCalledTimes(1);
  });

  it('nunca lança, mesmo se o signOut rejeitar (ex.: offline)', async () => {
    authMock.signOut.mockRejectedValue(new Error('Network request failed'));
    await expect(sair()).resolves.toBeUndefined();
  });

  it('nunca lança, mesmo se o signOut lançar de forma síncrona', async () => {
    authMock.signOut.mockImplementation(() => {
      throw new Error('falha inesperada');
    });
    await expect(sair()).resolves.toBeUndefined();
  });
});

describe('recuperarSenha', () => {
  it('recusa e-mail vazio ou inválido sem chamar a rede', async () => {
    await expect(recuperarSenha('')).resolves.toEqual({ success: false, error: MSG_EMAIL_VAZIO });
    await expect(recuperarSenha('joao@')).resolves.toEqual({ success: false, error: MSG_EMAIL_INVALIDO });
    expect(authMock.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it('envia o e-mail de redefinição com o endereço normalizado', async () => {
    authMock.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    await expect(recuperarSenha(' Joao@Exemplo.com ')).resolves.toEqual({ success: true, data: undefined });
    expect(authMock.resetPasswordForEmail).toHaveBeenCalledWith('joao@exemplo.com');
  });

  it('traduz o erro devolvido pelo Supabase', async () => {
    authMock.resetPasswordForEmail.mockResolvedValue({ data: null, error: { message: 'Email rate limit exceeded' } });
    await expect(recuperarSenha('joao@exemplo.com')).resolves.toEqual({
      success: false,
      error: 'Muitas tentativas. Aguarde um instante e tente novamente.',
    });
  });

  it('não lança quando a chamada rejeita e traduz a mensagem da exceção', async () => {
    authMock.resetPasswordForEmail.mockRejectedValue(new Error('fetch failed'));
    await expect(recuperarSenha('joao@exemplo.com')).resolves.toEqual({
      success: false,
      error: MSG_SEM_CONEXAO,
    });
  });
});

describe('obterUsuarioAtual', () => {
  it('devolve o usuário da sessão persistida', async () => {
    authMock.getSession.mockResolvedValue({ data: { session: { user: usuarioSupabase() } }, error: null });
    await expect(obterUsuarioAtual()).resolves.toEqual({ id: 'user-123', email: 'joao@exemplo.com', nome: 'João' });
  });

  it('devolve null quando não há sessão', async () => {
    authMock.getSession.mockResolvedValue({ data: { session: null }, error: null });
    await expect(obterUsuarioAtual()).resolves.toBeNull();
  });

  it('devolve null quando getSession rejeita', async () => {
    authMock.getSession.mockRejectedValue(new Error('storage corrompido'));
    await expect(obterUsuarioAtual()).resolves.toBeNull();
  });
});

describe('observarSessao', () => {
  function ouvinteRegistrado(): (evento: string, sessao: unknown) => void {
    expect(authMock.onAuthStateChange).toHaveBeenCalledTimes(1);
    return authMock.onAuthStateChange.mock.calls[0][0];
  }

  it('emite o estado inicial a partir da sessão persistida', async () => {
    authMock.getSession.mockResolvedValue({ data: { session: { user: usuarioSupabase() } }, error: null });
    const cb = jest.fn();

    observarSessao(cb);
    expect(cb).not.toHaveBeenCalled(); // a emissão inicial é assíncrona
    await esvaziarFila();

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith({ id: 'user-123', email: 'joao@exemplo.com', nome: 'João' });
  });

  it('emite null como estado inicial quando não há sessão ou getSession falha', async () => {
    authMock.getSession.mockRejectedValue(new Error('falhou'));
    const cb = jest.fn();
    observarSessao(cb);
    await esvaziarFila();
    expect(cb).toHaveBeenCalledWith(null);
  });

  it('emite as mudanças de sessão (login e logout) recebidas do onAuthStateChange', async () => {
    authMock.getSession.mockResolvedValue({ data: { session: null }, error: null });
    const cb = jest.fn();
    observarSessao(cb);
    await esvaziarFila();
    const ouvinte = ouvinteRegistrado();

    ouvinte('SIGNED_IN', { user: usuarioSupabase({ id: 'user-999', email: 'ana@exemplo.com', user_metadata: {} }) });
    ouvinte('SIGNED_OUT', null);

    expect(cb.mock.calls).toEqual([
      [null],
      [{ id: 'user-999', email: 'ana@exemplo.com', nome: null }],
      [null],
    ]);
  });

  it('retorna função que cancela a inscrição no Supabase e para de emitir', async () => {
    authMock.getSession.mockResolvedValue({ data: { session: null }, error: null });
    const cb = jest.fn();
    const cancelar = observarSessao(cb);
    await esvaziarFila();
    const ouvinte = ouvinteRegistrado();
    cb.mockClear();

    cancelar();
    ouvinte('SIGNED_IN', { user: usuarioSupabase() });

    expect(cancelarInscricaoAuth).toHaveBeenCalledTimes(1);
    expect(cb).not.toHaveBeenCalled();
  });

  it('não emite o estado inicial se a observação for cancelada antes de getSession responder', async () => {
    authMock.getSession.mockResolvedValue({ data: { session: { user: usuarioSupabase() } }, error: null });
    const cb = jest.fn();

    const cancelar = observarSessao(cb);
    cancelar();
    await esvaziarFila();

    expect(cb).not.toHaveBeenCalled();
  });
});
