// Serviço de Autenticação (Supabase Auth — e-mail e senha)
// Documentação: https://supabase.com/docs/reference/javascript/auth-signup

import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { ResultadoServico, Usuario } from '../types';

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const SENHA_MIN = 6;

// ─── UTILITÁRIOS ──────────────────────────────────────────────────────────────

function paraUsuario(user: User | null | undefined): Usuario | null {
  if (!user) return null;
  const meta = (user.user_metadata || {}) as Record<string, unknown>;
  const nome = typeof meta.nome === 'string' && meta.nome.trim() ? meta.nome.trim() : null;
  return { id: user.id, email: user.email ?? null, nome };
}

function validarEmail(email: string): string | null {
  const limpo = email.trim();
  if (!limpo) return 'Informe seu e-mail.';
  if (!REGEX_EMAIL.test(limpo)) return 'E-mail inválido. Verifique e tente novamente.';
  return null;
}

function validarSenha(senha: string): string | null {
  if (!senha) return 'Informe sua senha.';
  if (senha.length < SENHA_MIN) return `A senha precisa ter pelo menos ${SENHA_MIN} caracteres.`;
  return null;
}

/** Traduz mensagens de erro do Supabase Auth para português amigável. */
export function traduzirErroAuth(mensagem: string): string {
  const m = (mensagem || '').toLowerCase();

  if (m.includes('invalid login credentials') || m.includes('invalid_credentials')) {
    return 'E-mail ou senha incorretos.';
  }
  if (m.includes('email not confirmed')) {
    return 'E-mail ainda não confirmado. Verifique sua caixa de entrada.';
  }
  if (m.includes('user already registered') || m.includes('already been registered') || m.includes('already exists')) {
    return 'Este e-mail já está cadastrado. Tente entrar.';
  }
  if (m.includes('password should be at least') || m.includes('weak password') || m.includes('password is too short')) {
    return `A senha precisa ter pelo menos ${SENHA_MIN} caracteres.`;
  }
  if (m.includes('unable to validate email') || m.includes('invalid email') || m.includes('invalid format')) {
    return 'E-mail inválido. Verifique e tente novamente.';
  }
  if (m.includes('signup is disabled') || m.includes('signups not allowed')) {
    return 'Cadastro desativado neste projeto. Fale com o administrador.';
  }
  if (m.includes('rate limit') || m.includes('too many requests') || m.includes('over_email_send_rate_limit')) {
    return 'Muitas tentativas. Aguarde um instante e tente novamente.';
  }
  if (m.includes('network request failed') || m.includes('failed to fetch') || m.includes('fetch failed') || m.includes('network')) {
    return 'Sem conexão com a internet. Verifique sua rede.';
  }
  if (m.includes('session') && (m.includes('missing') || m.includes('expired'))) {
    return 'Sessão expirada. Entre novamente.';
  }
  if (m.includes('user not found')) {
    return 'Nenhuma conta encontrada com este e-mail.';
  }
  return mensagem || 'Erro inesperado na autenticação.';
}

function mensagemDe(err: unknown): string {
  const m = (err as { message?: string } | null)?.message;
  return traduzirErroAuth(m || '');
}

// ─── API PÚBLICA ──────────────────────────────────────────────────────────────

/**
 * Cria uma conta com e-mail e senha. Se o projeto exige confirmação de e-mail,
 * `precisaConfirmarEmail` vem true e não há sessão ativa até o usuário confirmar.
 */
export async function cadastrar(
  email: string,
  senha: string,
  nome?: string
): Promise<ResultadoServico<{ precisaConfirmarEmail: boolean }>> {
  const erroEmail = validarEmail(email);
  if (erroEmail) return { success: false, error: erroEmail };
  const erroSenha = validarSenha(senha);
  if (erroSenha) return { success: false, error: erroSenha };

  try {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password: senha,
      options: { data: { nome: (nome || '').trim() } },
    });
    if (error) return { success: false, error: traduzirErroAuth(error.message) };

    // Supabase retorna user com identities vazio quando o e-mail já existe (sem vazar a info no erro).
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      return { success: false, error: 'Este e-mail já está cadastrado. Tente entrar.' };
    }

    return { success: true, data: { precisaConfirmarEmail: !data.session } };
  } catch (err) {
    return { success: false, error: mensagemDe(err) };
  }
}

/** Entra com e-mail e senha. */
export async function entrar(email: string, senha: string): Promise<ResultadoServico<Usuario>> {
  const erroEmail = validarEmail(email);
  if (erroEmail) return { success: false, error: erroEmail };
  if (!senha) return { success: false, error: 'Informe sua senha.' };

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password: senha,
    });
    if (error) return { success: false, error: traduzirErroAuth(error.message) };
    const usuario = paraUsuario(data.user);
    if (!usuario) return { success: false, error: 'Não foi possível iniciar a sessão.' };
    return { success: true, data: usuario };
  } catch (err) {
    return { success: false, error: mensagemDe(err) };
  }
}

/** Encerra a sessão. Nunca lança exceção. */
export async function sair(): Promise<void> {
  try {
    await supabase.auth.signOut();
  } catch {
    // Mesmo offline a sessão local é descartada pelo cliente.
  }
}

/** Envia e-mail de redefinição de senha. */
export async function recuperarSenha(email: string): Promise<ResultadoServico> {
  const erroEmail = validarEmail(email);
  if (erroEmail) return { success: false, error: erroEmail };

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase());
    if (error) return { success: false, error: traduzirErroAuth(error.message) };
    return { success: true, data: undefined };
  } catch (err) {
    return { success: false, error: mensagemDe(err) };
  }
}

/** Retorna o usuário da sessão persistida (ou null se não há sessão). */
export async function obterUsuarioAtual(): Promise<Usuario | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return paraUsuario(data.session?.user);
  } catch {
    return null;
  }
}

/**
 * Observa mudanças de sessão (login, logout, refresh). Dispara imediatamente
 * com o estado atual e retorna a função para cancelar a observação.
 */
export function observarSessao(cb: (usuario: Usuario | null) => void): () => void {
  let ativo = true;

  obterUsuarioAtual().then((u) => {
    if (ativo) cb(u);
  });

  const { data } = supabase.auth.onAuthStateChange((_evento, sessao: Session | null) => {
    if (ativo) cb(paraUsuario(sessao?.user));
  });

  return () => {
    ativo = false;
    data.subscription.unsubscribe();
  };
}
