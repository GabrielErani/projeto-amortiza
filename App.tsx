// Aplicativo Amortiza - Dashboard Operacional Semanal e Carteira Macro
// Documentação React Native: https://reactnative.dev/docs/getting-started
// Documentação Safe Area Context: https://github.com/AppAndFlow/react-native-safe-area-context
// Documentação AsyncStorage: https://react-native-async-storage.github.io/async-storage/
//
// Estrutura: App (providers) → PortaoAutenticacao (splash / login / app) → AppPrincipal.
// Dados e regras de negócio: src/hooks/useDadosApp.ts. Telas: src/screens. Componentes: src/components.

import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { BottomTabBar, TelaAtiva } from './src/components/BottomTabBar';
import { HistoricoRegistros } from './src/components/HistoricoRegistros';
import { MenuDrawer } from './src/components/MenuDrawer';
import { ModalDivida } from './src/components/ModalDivida';
import { ModalEscolhaFAB } from './src/components/ModalEscolhaFAB';
import { ModalLancarGanho } from './src/components/ModalLancarGanho';
import { ModalMetaBase } from './src/components/ModalMetaBase';
import { useAuth } from './src/hooks/useAuth';
import { useDadosApp } from './src/hooks/useDadosApp';
import { useModoOffline } from './src/hooks/useModoOffline';
import { AuthScreen } from './src/screens/AuthScreen';
import { CarteiraScreen } from './src/screens/CarteiraScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { sair } from './src/services/auth';
import { limparDadosLocais } from './src/services/storage';
import { sincronizarTudo } from './src/services/sync';
import { cores } from './src/theme';
import { Usuario } from './src/types';

export default function App() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <PortaoAutenticacao />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

// ─── PORTÃO: SPLASH → LOGIN/CADASTRO → APP ────────────────────────────────────

function PortaoAutenticacao() {
  const { usuario, carregandoSessao } = useAuth();
  const { modoOffline, ativarModoOffline, desativarModoOffline } = useModoOffline();
  // AuthScreen aberta pelo drawer por quem está usando sem conta (mostra "Voltar")
  const [authAberta, setAuthAberta] = useState<boolean>(false);
  const usuarioId = usuario?.id ?? null;
  const usuarioAnteriorId = useRef<string | null>(null);

  // Logout (logado → null), pelo menu ou por sessão encerrada: limpa a flag e volta à AuthScreen
  useEffect(() => {
    if (carregandoSessao) return;
    if (usuarioAnteriorId.current && !usuarioId) void desativarModoOffline();
    if (usuarioId) setAuthAberta(false);
    usuarioAnteriorId.current = usuarioId;
  }, [usuarioId, carregandoSessao, desativarModoOffline]);

  // Antes de sair, sincroniza para não perder o que ainda só está no aparelho
  const executarSaida = async (ignorarFalhaSync = false) => {
    if (usuarioId && !ignorarFalhaSync) {
      const resultado = await sincronizarTudo(usuarioId);
      if (!resultado.success) {
        Alert.alert(
          'Não foi possível sincronizar',
          `${resultado.error}\n\nSe sair agora, as alterações que ainda não foram enviadas serão apagadas deste aparelho.`,
          [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Sair mesmo assim', style: 'destructive', onPress: () => void executarSaida(true) },
          ]
        );
        return;
      }
    }
    // A flag sai primeiro: assim, ao virar "sem usuário", o portão já mostra a AuthScreen
    await desativarModoOffline();
    await sair();
    await limparDadosLocais();
  };

  const confirmarSaida = () => {
    Alert.alert('Sair da conta', 'Seus dados ficam salvos na nuvem.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: () => void executarSaida() },
    ]);
  };

  if (carregandoSessao || modoOffline === null) {
    return (
      <View style={styles.splash}>
        <Text style={styles.splashTitulo}>Amortiza</Text>
        <ActivityIndicator size="large" color={cores.primaria} style={{ marginTop: 16 }} />
      </View>
    );
  }

  if (!usuario && (!modoOffline || authAberta)) {
    return (
      <AuthScreen
        onContinuarSemConta={() => {
          setAuthAberta(false);
          void ativarModoOffline();
        }}
        onVoltar={authAberta ? () => setAuthAberta(false) : undefined}
      />
    );
  }

  return (
    <AppPrincipal
      usuario={usuario}
      onEntrarOuCriarConta={() => setAuthAberta(true)}
      onSairDaConta={confirmarSaida}
    />
  );
}

// ─── APP PRINCIPAL: HEADER + TELAS + TAB BAR + MODAIS ─────────────────────────

interface AppPrincipalProps {
  usuario: Usuario | null;
  onEntrarOuCriarConta: () => void;
  onSairDaConta: () => void;
}

function AppPrincipal({ usuario, onEntrarOuCriarConta, onSairDaConta }: AppPrincipalProps) {
  const dados = useDadosApp(usuario?.id ?? null);
  const [telaAtiva, setTelaAtiva] = useState<TelaAtiva>('dashboard');
  const [menuDrawerAberto, setMenuDrawerAberto] = useState<boolean>(false);

  return (
    <>
      {/* HEADER MINIMALISTA */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => setMenuDrawerAberto(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.headerIconText}>☰</Text>
        </TouchableOpacity>

        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerMainTitle}>
            {telaAtiva === 'dashboard' ? 'Amortiza • Semana' : 'Amortiza • Carteira'}
          </Text>
        </View>

        <TouchableOpacity style={styles.iconButton} onPress={dados.onRefresh} activeOpacity={0.7}>
          <Text style={styles.headerIconText}>↻</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={dados.atualizando}
            onRefresh={dados.onRefresh}
            tintColor={cores.primaria}
            colors={[cores.primaria]}
          />
        }
      >
        {/* TELA 1: DASHBOARD OPERACIONAL SEMANAL */}
        {telaAtiva === 'dashboard' && (
          <DashboardScreen
            diasSemana={dados.diasSemana}
            diaSelecionadoIdx={dados.diaSelecionadoIdx}
            metaDiariaBase={dados.metaDiariaBase}
            totalSemana={dados.totalSemana}
            totalCobertoSemana={dados.totalCobertoSemana}
            diasAmortizadosCompletos={dados.diasAmortizadosCompletos}
            onSelecionarDia={dados.setDiaSelecionadoIdx}
            onAbrirMetaBase={dados.abrirMetaBase}
            onLancarGanho={dados.abrirModalParaDia}
          />
        )}

        {/* TELA 2: CARTEIRA (VISÃO MACRO DE CONTROLE: GANHOS & DÍVIDAS) */}
        {telaAtiva === 'carteira' && (
          <CarteiraScreen
            totalSemana={dados.totalSemana}
            diasAmortizadosCompletos={dados.diasAmortizadosCompletos}
            semanasMes={dados.semanasMes}
            totalMes={dados.totalMes}
            semanaMesSelecionadaIdx={dados.semanaMesSelecionadaIdx}
            dividas={dados.dividas}
            onSelecionarSemana={dados.setSemanaMesSelecionadaIdx}
            onAdicionarDivida={dados.abrirNovaDivida}
            onExcluirDivida={dados.excluirDivida}
          />
        )}

        {/* HISTÓRICO DE REGISTROS (ganhos salvos no aparelho) */}
        <HistoricoRegistros registros={dados.historico} />
      </ScrollView>

      {/* BARRA DE NAVEGAÇÃO INFERIOR (BOTTOM TABS) + FAB */}
      <BottomTabBar
        telaAtiva={telaAtiva}
        onSelecionarTela={setTelaAtiva}
        onPressionarFab={dados.abrirEscolhaFAB}
      />

      {/* MODAIS (mesma ordem de empilhamento do original) */}
      <ModalDivida {...dados.modalDivida} />
      <MenuDrawer
        visivel={menuDrawerAberto}
        usuario={usuario}
        estadoSync={dados.estadoSync}
        onFechar={() => setMenuDrawerAberto(false)}
        onSelecionarTela={setTelaAtiva}
        onConfigurarMeta={dados.abrirMetaBase}
        onSincronizar={dados.onRefresh}
        onEntrarOuCriarConta={onEntrarOuCriarConta}
        onSairDaConta={onSairDaConta}
      />
      <ModalMetaBase {...dados.modalMetaBase} />
      <ModalEscolhaFAB {...dados.modalEscolhaFAB} />
      <ModalLancarGanho {...dados.modalLancarGanho} />
    </>
  );
}

// ─── DESIGN SYSTEM MINIMALISTA FINTECH/UBER ───────────────────────────────────
// Estilos do shell (container + header). Telas e modais têm os próprios estilos;
// os compartilhados ficam em src/styles/compartilhados.ts.
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: cores.fundo,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 110,
  },

  // HEADER
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: cores.superficieAlta,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: cores.superficieAlta,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconText: {
    color: cores.texto,
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  headerMainTitle: {
    color: cores.texto,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
  },

  // SPLASH (enquanto a sessão salva é lida)
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: cores.fundo,
  },
  splashTitulo: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
});
