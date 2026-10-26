// Tela de acesso: entrar, criar conta, recuperar senha ou continuar sem conta (uso só local).
// Usa a mesma linguagem visual dos modais do app (pílulas, inputs e botões compartilhados).
// Documentação Supabase Auth: https://supabase.com/docs/reference/javascript/auth-signup
// Documentação KeyboardAvoidingView: https://reactnative.dev/docs/keyboardavoidingview
// Documentação BackHandler (Android): https://reactnative.dev/docs/backhandler

import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { TextInputInstance } from 'react-native';
import { cadastrar, entrar, recuperarSenha } from '../services/auth';
import { estilosCompartilhados } from '../styles/compartilhados';
import { ALVO_TOQUE, cores } from '../theme';

export type ModoAuth = 'entrar' | 'cadastrar';

export interface AuthScreenProps {
  onContinuarSemConta: () => void;
  /** Quando informado (tela aberta pelo menu), mostra o botão "Voltar". */
  onVoltar?: () => void;
}

export const SENHA_MINIMA = 6;
const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function emailValido(email: string): boolean {
  return REGEX_EMAIL.test(email.trim());
}

/** Validação no cliente: devolve a primeira mensagem de erro, ou null se estiver tudo certo. */
export function validarFormularioAuth(dados: {
  modo: ModoAuth;
  nome: string;
  email: string;
  senha: string;
}): string | null {
  if (dados.modo === 'cadastrar' && !dados.nome.trim()) return 'Informe seu nome.';
  if (!dados.email.trim()) return 'Informe seu e-mail.';
  if (!emailValido(dados.email)) return 'E-mail inválido. Verifique e tente novamente.';
  if (!dados.senha) return 'Informe sua senha.';
  if (dados.senha.length < SENHA_MINIMA) return `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`;
  return null;
}

export function AuthScreen({ onContinuarSemConta, onVoltar }: AuthScreenProps) {
  const [modo, setModo] = useState<ModoAuth>('entrar');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [acao, setAcao] = useState<'enviando' | 'recuperando' | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // E-mail do cadastro que aguarda confirmação (mostra o estado "Confirme seu e-mail")
  const [emailPendente, setEmailPendente] = useState<string | null>(null);

  const refEmail = useRef<TextInputInstance>(null);
  const refSenha = useRef<TextInputInstance>(null);
  const ocupado = acao !== null;

  // Botão "voltar" do Android equivale ao "Voltar" da tela
  useEffect(() => {
    if (!onVoltar) return;
    const assinatura = BackHandler.addEventListener('hardwareBackPress', () => {
      onVoltar();
      return true;
    });
    return () => assinatura.remove();
  }, [onVoltar]);

  // Ao digitar, some o erro anterior
  const aoDigitar = (setter: (texto: string) => void) => (texto: string) => {
    setter(texto);
    setErro(null);
  };

  const trocarModo = (novo: ModoAuth) => {
    setModo(novo);
    setErro(null);
    setAviso(null);
  };

  const handleEnviar = async () => {
    if (ocupado) return;
    const erroValidacao = validarFormularioAuth({ modo, nome, email, senha });
    setAviso(null);
    if (erroValidacao) {
      setErro(erroValidacao);
      return;
    }

    setErro(null);
    setAcao('enviando');
    try {
      if (modo === 'entrar') {
        // No sucesso a sessão muda e o App troca sozinho para a tela principal
        const res = await entrar(email, senha);
        if (!res.success) setErro(res.error);
      } else {
        const res = await cadastrar(email, senha, nome);
        if (!res.success) {
          setErro(res.error);
        } else if (res.data.precisaConfirmarEmail) {
          setEmailPendente(email.trim().toLowerCase());
          setSenha('');
        }
      }
    } finally {
      setAcao(null);
    }
  };

  const handleEsqueciSenha = async () => {
    if (ocupado) return;
    setAviso(null);
    if (!email.trim()) {
      setErro('Digite seu e-mail acima para recuperar a senha.');
      return;
    }
    if (!emailValido(email)) {
      setErro('E-mail inválido. Verifique e tente novamente.');
      return;
    }

    setErro(null);
    setAcao('recuperando');
    try {
      const res = await recuperarSenha(email);
      if (res.success) {
        setAviso(`Enviamos um link para redefinir a senha para ${email.trim().toLowerCase()}. Verifique sua caixa de entrada.`);
      } else {
        setErro(res.error);
      }
    } finally {
      setAcao(null);
    }
  };

  const voltarParaLogin = () => {
    setEmailPendente(null);
    trocarModo('entrar');
  };

  return (
    <KeyboardAvoidingView
      style={styles.authContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.authScroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {onVoltar && (
          <TouchableOpacity style={styles.authVoltar} onPress={onVoltar} accessibilityRole="button">
            <Text style={styles.authVoltarTexto}>Voltar</Text>
          </TouchableOpacity>
        )}

        <View style={styles.authConteudo}>
          <Text style={styles.authTitulo}>Amortiza</Text>
          <Text style={styles.authSubtitulo}>Gestão Operacional & Carteira Macro</Text>

          <View style={styles.cardModalCentral}>
            {emailPendente ? (
              // ─── CADASTRO FEITO: AGUARDANDO CONFIRMAÇÃO DO E-MAIL ───────────
              <>
                <Text style={styles.modalTitleText}>Confirme seu e-mail</Text>
                <Text style={styles.modalSubText}>
                  Enviamos um link de confirmação para {emailPendente}. Abra o e-mail, confirme o cadastro e depois entre com sua senha.
                </Text>
                <TouchableOpacity
                  style={styles.primaryActionButton}
                  onPress={voltarParaLogin}
                  accessibilityRole="button"
                >
                  <Text style={styles.primaryActionText}>Voltar para o login</Text>
                </TouchableOpacity>
              </>
            ) : (
              // ─── FORMULÁRIO: ENTRAR / CRIAR CONTA ───────────────────────────
              <>
                <View style={styles.diaSelectorRow} accessibilityRole="tablist">
                  {(['entrar', 'cadastrar'] as const).map((m) => {
                    const ativo = modo === m;
                    return (
                      <TouchableOpacity
                        key={m}
                        testID={`auth-modo-${m}`}
                        style={[styles.diaPill, styles.authPill, ativo && styles.diaPillAtivo]}
                        onPress={() => trocarModo(m)}
                        disabled={ocupado}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: ativo, disabled: ocupado }}
                      >
                        <Text style={[styles.diaPillTexto, styles.authPillTexto, ativo && styles.diaPillTextoAtivo]}>
                          {m === 'entrar' ? 'Entrar' : 'Criar conta'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={styles.modalSubText}>
                  {modo === 'entrar'
                    ? 'Entre para sincronizar seus ganhos e dívidas na nuvem.'
                    : 'Crie sua conta para guardar seus dados na nuvem e usar em outros aparelhos.'}
                </Text>

                {modo === 'cadastrar' && (
                  <>
                    <Text style={styles.inputLabel}>Nome</Text>
                    <TextInput
                      style={styles.modalInput}
                      value={nome}
                      onChangeText={aoDigitar(setNome)}
                      placeholder="Como podemos te chamar?"
                      placeholderTextColor={cores.textoApagado}
                      autoCapitalize="words"
                      autoComplete="name"
                      textContentType="name"
                      returnKeyType="next"
                      onSubmitEditing={() => refEmail.current?.focus()}
                      editable={!ocupado}
                      accessibilityLabel="Nome"
                    />
                  </>
                )}

                <Text style={styles.inputLabel}>E-mail</Text>
                <TextInput
                  ref={refEmail}
                  style={styles.modalInput}
                  value={email}
                  onChangeText={aoDigitar(setEmail)}
                  placeholder="seu@email.com"
                  placeholderTextColor={cores.textoApagado}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="next"
                  onSubmitEditing={() => refSenha.current?.focus()}
                  editable={!ocupado}
                  accessibilityLabel="E-mail"
                />

                <Text style={styles.inputLabel}>Senha</Text>
                <View style={styles.senhaContainer}>
                  <TextInput
                    ref={refSenha}
                    style={[styles.modalInput, styles.senhaInput]}
                    value={senha}
                    onChangeText={aoDigitar(setSenha)}
                    placeholder={`Mínimo ${SENHA_MINIMA} caracteres`}
                    placeholderTextColor={cores.textoApagado}
                    secureTextEntry={!mostrarSenha}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
                    textContentType={modo === 'entrar' ? 'password' : 'newPassword'}
                    returnKeyType="go"
                    onSubmitEditing={handleEnviar}
                    editable={!ocupado}
                    accessibilityLabel="Senha"
                  />
                  <TouchableOpacity
                    style={styles.btnMostrarSenha}
                    onPress={() => setMostrarSenha((v) => !v)}
                    accessibilityRole="button"
                    accessibilityLabel={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    <Text style={styles.btnMostrarSenhaTexto}>{mostrarSenha ? 'Ocultar' : 'Mostrar'}</Text>
                  </TouchableOpacity>
                </View>

                {erro && (
                  <Text style={styles.authErro} accessibilityRole="alert" accessibilityLiveRegion="polite">
                    {erro}
                  </Text>
                )}
                {aviso && (
                  <Text style={styles.authAviso} accessibilityLiveRegion="polite">
                    {aviso}
                  </Text>
                )}

                <TouchableOpacity
                  testID="auth-botao-principal"
                  style={styles.primaryActionButton}
                  onPress={handleEnviar}
                  disabled={ocupado}
                  accessibilityRole="button"
                  accessibilityLabel={modo === 'entrar' ? 'Entrar' : 'Criar conta'}
                  accessibilityState={{ disabled: ocupado, busy: acao === 'enviando' }}
                >
                  {acao === 'enviando' ? (
                    <ActivityIndicator color={cores.primariaTexto} />
                  ) : (
                    <Text style={styles.primaryActionText}>{modo === 'entrar' ? 'Entrar' : 'Criar conta'}</Text>
                  )}
                </TouchableOpacity>

                {modo === 'entrar' && (
                  <TouchableOpacity
                    style={styles.authLink}
                    onPress={handleEsqueciSenha}
                    disabled={ocupado}
                    accessibilityRole="button"
                  >
                    <Text style={styles.authLinkTexto}>
                      {acao === 'recuperando' ? 'Enviando...' : 'Esqueci minha senha'}
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>

          <TouchableOpacity
            style={[styles.secondaryActionButton, styles.authContinuar]}
            onPress={onContinuarSemConta}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryActionText}>Continuar sem conta</Text>
          </TouchableOpacity>
          <Text style={styles.authRodape}>Sem conta, os dados ficam salvos só neste aparelho.</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = {
  ...estilosCompartilhados,
  ...StyleSheet.create({
    authContainer: {
      flex: 1,
      backgroundColor: cores.fundo,
    },
    authScroll: {
      flexGrow: 1,
      paddingHorizontal: 20,
      paddingVertical: 24,
    },
    authConteudo: {
      flex: 1,
      justifyContent: 'center',
    },
    authVoltar: {
      alignSelf: 'flex-start',
      minHeight: ALVO_TOQUE,
      justifyContent: 'center',
      paddingRight: 16,
    },
    authVoltarTexto: {
      color: cores.textoSuave,
      fontSize: 15,
      fontWeight: '600',
    },
    authTitulo: {
      color: '#FFFFFF',
      fontSize: 34,
      fontWeight: '800',
      letterSpacing: -0.5,
      textAlign: 'center',
    },
    authSubtitulo: {
      color: cores.textoApagado,
      fontSize: 13,
      textAlign: 'center',
      marginTop: 4,
      marginBottom: 28,
    },
    authPill: {
      minHeight: ALVO_TOQUE,
    },
    authPillTexto: {
      fontSize: 14,
    },
    senhaContainer: {
      width: '100%',
      justifyContent: 'center',
    },
    senhaInput: {
      paddingRight: 96,
    },
    btnMostrarSenha: {
      position: 'absolute',
      right: 4,
      top: 0,
      bottom: 16, // compensa o marginBottom do modalInput
      minWidth: ALVO_TOQUE,
      paddingHorizontal: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnMostrarSenhaTexto: {
      color: cores.info,
      fontSize: 13,
      fontWeight: '700',
    },
    authErro: {
      color: cores.erro,
      fontSize: 13,
      lineHeight: 18,
      textAlign: 'center',
      marginBottom: 12,
    },
    authAviso: {
      color: cores.primaria,
      fontSize: 13,
      lineHeight: 18,
      textAlign: 'center',
      marginBottom: 12,
    },
    authLink: {
      alignSelf: 'center',
      minHeight: ALVO_TOQUE,
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    authLinkTexto: {
      color: cores.info,
      fontSize: 14,
      fontWeight: '600',
    },
    authContinuar: {
      marginTop: 16,
      borderColor: 'transparent',
    },
    authRodape: {
      color: '#475569',
      fontSize: 12,
      textAlign: 'center',
      marginTop: 4,
    },
  }),
};
