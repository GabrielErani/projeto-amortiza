// Entrar / Criar conta — tela única, minimalista, com modo offline opcional.
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { cadastrar, entrar, recuperarSenha } from '../services/auth';
import { ALVO_TOQUE, circulo, cores, espaco, fonte, layout, opacidade, raio, tamanho, textos } from '../theme';
import { Botao } from '../components/Botao';
import { CampoTexto } from '../components/CampoTexto';

type Modo = 'entrar' | 'cadastrar';
type Etapa = 'form' | 'confirmar_email' | 'senha_enviada';

interface Props {
  onContinuarSemConta: () => void;
  // Quando aberta de dentro do app (modo offline), permite voltar sem logar.
  onVoltar?: () => void;
}

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function AuthScreen({ onContinuarSemConta, onVoltar }: Props) {
  const [modo, setModo] = useState<Modo>('entrar');
  const [etapa, setEtapa] = useState<Etapa>('form');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erros, setErros] = useState<{ nome?: string; email?: string; senha?: string; geral?: string }>({});

  const cadastro = modo === 'cadastrar';

  const validar = () => {
    const e: typeof erros = {};
    if (cadastro && !nome.trim()) e.nome = 'Informe seu nome.';
    if (!REGEX_EMAIL.test(email.trim())) e.email = 'Informe um e-mail válido.';
    if (senha.length < 6) e.senha = 'A senha precisa ter pelo menos 6 caracteres.';
    setErros(e);
    return Object.keys(e).length === 0;
  };

  const enviar = async () => {
    if (carregando) return;
    if (!validar()) return;
    setCarregando(true);
    setErros({});
    try {
      if (cadastro) {
        const r = await cadastrar(email.trim(), senha, nome.trim());
        if (!r.success) return setErros({ geral: r.error });
        if (r.data.precisaConfirmarEmail) setEtapa('confirmar_email');
        // Se não precisa confirmar, observarSessao do App troca a tela sozinho.
      } else {
        const r = await entrar(email.trim(), senha);
        if (!r.success) setErros({ geral: r.error });
      }
    } finally {
      setCarregando(false);
    }
  };

  const esqueciSenha = async () => {
    if (!REGEX_EMAIL.test(email.trim())) {
      setErros({ email: 'Digite seu e-mail para recuperar a senha.' });
      return;
    }
    setCarregando(true);
    setErros({});
    try {
      const r = await recuperarSenha(email.trim());
      if (!r.success) setErros({ geral: r.error });
      else setEtapa('senha_enviada');
    } finally {
      setCarregando(false);
    }
  };

  const trocarModo = (m: Modo) => {
    setModo(m);
    setErros({});
  };

  return (
    <SafeAreaView style={styles.tela}>
      <StatusBar style="light" />
      <KeyboardAvoidingView style={layout.preencher} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.conteudo} keyboardShouldPersistTaps="handled">
          <View style={layout.gapXs}>
            <View style={styles.selo} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Text style={styles.seloLetra}>A</Text>
            </View>
            <Text style={[textos.display, styles.nomeMarca]} accessibilityRole="header">Amortiza</Text>
            <Text style={textos.corpoSuave}>Suas metas da semana, no seu ritmo.</Text>
          </View>

          {etapa === 'confirmar_email' && (
            <Confirmacao
              titulo="Confirme seu e-mail"
              botao="Voltar para entrar"
              onPress={() => {
                setEtapa('form');
                trocarModo('entrar');
              }}
            >
              Enviamos um link para <Text style={textos.forte}>{email.trim()}</Text>. Abra o e-mail, confirme e volte para entrar.
            </Confirmacao>
          )}

          {etapa === 'senha_enviada' && (
            <Confirmacao titulo="Link enviado" botao="Voltar" onPress={() => setEtapa('form')}>
              Se <Text style={textos.forte}>{email.trim()}</Text> estiver cadastrado, você receberá um e-mail para redefinir a senha.
            </Confirmacao>
          )}

          {etapa === 'form' && (
            <View style={layout.gapMd}>
              <View style={styles.segmentos} accessibilityRole="tablist">
                <Segmento ativo={!cadastro} rotulo="Entrar" onPress={() => trocarModo('entrar')} />
                <Segmento ativo={cadastro} rotulo="Criar conta" onPress={() => trocarModo('cadastrar')} />
              </View>

              {cadastro && (
                <CampoTexto
                  label="Nome"
                  placeholder="Como quer ser chamado"
                  value={nome}
                  onChangeText={setNome}
                  erro={erros.nome}
                  autoCapitalize="words"
                  textContentType="name"
                />
              )}
              <CampoTexto
                label="E-mail"
                placeholder="voce@exemplo.com"
                value={email}
                onChangeText={setEmail}
                erro={erros.email}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="emailAddress"
              />
              <CampoTexto
                label="Senha"
                placeholder="Mínimo 6 caracteres"
                value={senha}
                onChangeText={setSenha}
                erro={erros.senha}
                secureTextEntry={!mostrarSenha}
                autoCapitalize="none"
                textContentType={cadastro ? 'newPassword' : 'password'}
                acaoDireita={{
                  rotulo: mostrarSenha ? 'Ocultar' : 'Mostrar',
                  rotuloAcessivel: mostrarSenha ? 'Ocultar senha' : 'Mostrar senha',
                  onPress: () => setMostrarSenha((v) => !v),
                }}
                onSubmitEditing={enviar}
                returnKeyType="done"
              />

              {erros.geral ? (
                <View style={styles.faixaErro} accessible accessibilityRole="alert" accessibilityLiveRegion="polite">
                  <Text style={textos.erro}>{erros.geral}</Text>
                </View>
              ) : null}

              <Botao titulo={cadastro ? 'Criar conta' : 'Entrar'} onPress={enviar} carregando={carregando} />
              {!cadastro && <Botao titulo="Esqueci minha senha" variante="texto" onPress={esqueciSenha} desabilitado={carregando} />}

              {onVoltar ? (
                <Botao titulo="Voltar" variante="texto" onPress={onVoltar} />
              ) : (
                <>
                  <View style={[layout.linha, layout.gapMd]}>
                    <View style={styles.traco} />
                    <Text style={textos.legendaSuave}>ou</Text>
                    <View style={styles.traco} />
                  </View>
                  <Botao titulo="Continuar sem conta" variante="secundario" onPress={onContinuarSemConta} />
                </>
              )}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Segmento({ ativo, rotulo, onPress }: { ativo: boolean; rotulo: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.segmento, ativo && styles.segmentoAtivo]}
      onPress={onPress}
      activeOpacity={opacidade.toque}
      accessibilityRole="tab"
      accessibilityState={{ selected: ativo }}
    >
      <Text style={[textos.corpoSuave, ativo && textos.forte]}>{rotulo}</Text>
    </TouchableOpacity>
  );
}

function Confirmacao({ titulo, botao, onPress, children }: { titulo: string; botao: string; onPress: () => void; children: React.ReactNode }) {
  return (
    <View style={styles.confirmacao}>
      <View style={styles.iconeOk} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Text style={styles.iconeOkTexto}>✓</Text>
      </View>
      <Text style={textos.titulo}>{titulo}</Text>
      <Text style={[textos.corpoSuave, styles.centralizado]}>{children}</Text>
      <Botao titulo={botao} variante="secundario" onPress={onPress} estilo={styles.largo} />
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  conteudo: { flexGrow: 1, gap: espaco.xxl, paddingHorizontal: espaco.xl, paddingVertical: espaco.xxl },
  selo: { ...circulo(tamanho.marca, cores.primaria), borderRadius: raio.md },
  seloLetra: { ...fonte.titulo, color: cores.primariaTexto },
  nomeMarca: { marginTop: espaco.sm },
  segmentos: { flexDirection: 'row', padding: espaco.xs, borderRadius: raio.md, borderWidth: 1, borderColor: cores.borda, backgroundColor: cores.superficie },
  segmento: { ...layout.centro, flex: 1, minHeight: ALVO_TOQUE, borderRadius: raio.sm },
  segmentoAtivo: { backgroundColor: cores.superficieAlta },
  faixaErro: { padding: espaco.md, borderRadius: raio.md, backgroundColor: cores.erroSuave },
  traco: { flex: 1, height: 1, backgroundColor: cores.borda },
  confirmacao: { alignItems: 'center', gap: espaco.md, paddingVertical: espaco.xl },
  iconeOk: circulo(tamanho.iconeConfirmacao, cores.primariaSuave),
  iconeOkTexto: { ...fonte.display, color: cores.primaria },
  centralizado: { textAlign: 'center' },
  largo: { alignSelf: 'stretch' },
});
