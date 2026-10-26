// Amortiza — raiz do app: provedores, gate de sessão (splash → login → app) e modo offline.
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAuth } from './src/hooks/useAuth';
import { cores, layout, textos } from './src/theme';
import { AuthScreen } from './src/screens/AuthScreen';
import { PrincipalScreen } from './src/screens/PrincipalScreen';

const CHAVE_MODO_OFFLINE = '@amortiza_modo_offline_v1';

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Raiz />
    </SafeAreaProvider>
  );
}

function Raiz() {
  const { usuario, carregandoSessao } = useAuth();
  const [modoOffline, setModoOffline] = useState<boolean | null>(null);
  const [mostrarLogin, setMostrarLogin] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(CHAVE_MODO_OFFLINE)
      .then((v) => setModoOffline(v === '1'))
      .catch(() => setModoOffline(false));
  }, []);

  // Logado → fecha a tela de login; saiu da conta → volta a exigir login.
  const tinhaUsuario = useRef(false);
  useEffect(() => {
    if (usuario) {
      setMostrarLogin(false);
      tinhaUsuario.current = true;
    } else if (tinhaUsuario.current) {
      tinhaUsuario.current = false;
      setModoOffline(false);
    }
  }, [usuario]);

  const continuarSemConta = async () => {
    setModoOffline(true);
    try { await AsyncStorage.setItem(CHAVE_MODO_OFFLINE, '1'); } catch { /* ignora */ }
  };

  // Ao sair da conta o app volta a exigir login.
  const esquecerModoOffline = async () => {
    try { await AsyncStorage.removeItem(CHAVE_MODO_OFFLINE); } catch { /* ignora */ }
  };

  if (carregandoSessao || modoOffline === null) {
    return (
      <View style={[layout.centro, layout.gapLg, styles.splash]}>
        <Text style={textos.display}>Amortiza</Text>
        <ActivityIndicator color={cores.primaria} />
      </View>
    );
  }

  if (!usuario && (!modoOffline || mostrarLogin)) {
    return <AuthScreen onContinuarSemConta={continuarSemConta} onVoltar={mostrarLogin ? () => setMostrarLogin(false) : undefined} />;
  }

  return <PrincipalScreen usuario={usuario} onAbrirLogin={() => setMostrarLogin(true)} onSaiuDaConta={esquecerModoOffline} />;
}

const styles = StyleSheet.create({
  splash: { flex: 1, backgroundColor: cores.fundo },
});
