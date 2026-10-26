// Menu sanduíche (drawer lateral): navegação, meta diária, sincronização e conta do usuário.
// Documentação Modal: https://reactnative.dev/docs/modal

import React from 'react';
import { Dimensions, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { cores } from '../theme';
import { EstadoSync, Usuario } from '../types';
import { TelaAtiva } from './BottomTabBar';

const { width } = Dimensions.get('window');

export interface MenuDrawerProps {
  visivel: boolean;
  usuario: Usuario | null;
  estadoSync: EstadoSync;
  onFechar: () => void;
  onSelecionarTela: (tela: TelaAtiva) => void;
  onConfigurarMeta: () => void;
  onSincronizar: () => void;
  onEntrarOuCriarConta: () => void;
  onSairDaConta: () => void;
}

// ISO → "14:32" (hora local do aparelho)
function formatarHora(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '';
  return data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** Texto do rodapé do drawer com o estado da sincronização na nuvem. */
export function textoStatusSync(estado: EstadoSync, logado: boolean): string {
  if (!logado) return 'Sem conta • dados só neste aparelho';
  switch (estado.status) {
    case 'ok': {
      const hora = estado.ultimaSync ? formatarHora(estado.ultimaSync) : '';
      return hora ? `Sincronizado • ${hora}` : 'Sincronizado';
    }
    case 'sincronizando':
      return 'Sincronizando...';
    case 'offline':
      return 'Offline';
    case 'erro':
      return estado.mensagem || 'Erro ao sincronizar';
    default:
      // Instante entre o login e o início da primeira sincronização
      return 'Aguardando sincronização';
  }
}

export function MenuDrawer({
  visivel,
  usuario,
  estadoSync,
  onFechar,
  onSelecionarTela,
  onConfigurarMeta,
  onSincronizar,
  onEntrarOuCriarConta,
  onSairDaConta,
}: MenuDrawerProps) {
  // Fecha o drawer antes de executar a ação do item (como no menu original)
  const fecharE = (acao: () => void) => () => {
    onFechar();
    acao();
  };
  const syncComErro = !!usuario && estadoSync.status === 'erro';

  return (
    <Modal
      visible={visivel}
      animationType="fade"
      transparent
      onRequestClose={onFechar}
    >
      <View style={styles.drawerOverlay}>
        <View style={styles.drawerContainer}>
          <View style={styles.drawerHeader}>
            <Text style={styles.drawerTitle}>Amortiza</Text>
            <TouchableOpacity onPress={onFechar}>
              <Text style={styles.drawerCloseText}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.drawerSubtitle}>Gestão Operacional & Carteira Macro</Text>

          <TouchableOpacity
            style={styles.drawerItem}
            onPress={fecharE(() => onSelecionarTela('dashboard'))}
          >
            <Text style={styles.drawerItemText}>📊 Dashboard da Semana</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.drawerItem}
            onPress={fecharE(() => onSelecionarTela('carteira'))}
          >
            <Text style={styles.drawerItemText}>💼 Carteira & Controle Macro</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.drawerItem}
            onPress={fecharE(onConfigurarMeta)}
          >
            <Text style={styles.drawerItemText}>🎯 Configurar Meta Diária</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.drawerItem}
            onPress={fecharE(onSincronizar)}
          >
            <Text style={styles.drawerItemText}>🔄 Sincronizar Dados</Text>
          </TouchableOpacity>

          {/* CONTA */}
          <Text style={styles.drawerSecaoTitulo}>Conta</Text>
          {usuario ? (
            <>
              <Text style={styles.drawerContaEmail} numberOfLines={1}>
                {usuario.email ?? 'Conta conectada'}
              </Text>
              {/* Sem fechar o drawer: o Alert de confirmação aparece sobre ele */}
              <TouchableOpacity style={styles.drawerItem} onPress={onSairDaConta}>
                <Text style={styles.drawerItemText}>🚪 Sair da conta</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={styles.drawerItem}
              onPress={fecharE(onEntrarOuCriarConta)}
            >
              <Text style={styles.drawerItemText}>🔐 Entrar ou criar conta</Text>
            </TouchableOpacity>
          )}

          <View style={styles.drawerFooter}>
            <Text
              testID="drawer-status-sync"
              style={[styles.drawerFooterText, styles.drawerSyncText, syncComErro && styles.drawerSyncErro]}
              numberOfLines={3}
            >
              {textoStatusSync(estadoSync, !!usuario)}
            </Text>
            <Text style={styles.drawerFooterText}>Amortiza v1.2.0 • Offline-First</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // DRAWER MENU LATERAL
  drawerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-start',
  },
  drawerContainer: {
    width: width * 0.78,
    height: '100%',
    backgroundColor: '#0F172A',
    padding: 24,
    paddingTop: 54,
    borderRightWidth: 1,
    borderRightColor: cores.superficieAlta,
  },
  drawerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  drawerTitle: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  drawerSubtitle: {
    color: cores.textoApagado,
    fontSize: 13,
    marginBottom: 28,
  },
  drawerCloseText: {
    color: cores.textoSuave,
    fontSize: 22,
    padding: 6,
  },
  drawerItem: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: cores.superficieAlta,
  },
  drawerItemText: {
    color: cores.texto,
    fontSize: 16,
    fontWeight: '600',
  },
  drawerFooter: {
    marginTop: 'auto',
    paddingBottom: 20,
  },
  drawerFooterText: {
    color: '#475569',
    fontSize: 12,
    textAlign: 'center',
  },

  // SEÇÃO CONTA E STATUS DE SINCRONIZAÇÃO
  drawerSecaoTitulo: {
    color: cores.textoApagado,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 28,
    marginBottom: 4,
  },
  drawerContaEmail: {
    color: cores.textoSuave,
    fontSize: 13,
    marginBottom: 4,
  },
  drawerSyncText: {
    marginBottom: 6,
  },
  drawerSyncErro: {
    color: cores.erro,
  },
});
