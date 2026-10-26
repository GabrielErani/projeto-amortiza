// Barra de navegação inferior (Semana / Carteira) com o FAB central de lançamento de ganho.
// Documentação React Native: https://reactnative.dev/docs/getting-started

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { cores } from '../theme';

export type TelaAtiva = 'dashboard' | 'carteira';

export interface BottomTabBarProps {
  telaAtiva: TelaAtiva;
  onSelecionarTela: (tela: TelaAtiva) => void;
  onPressionarFab: () => void;
}

export function BottomTabBar({ telaAtiva, onSelecionarTela, onPressionarFab }: BottomTabBarProps) {
  return (
    <View style={styles.bottomTabBar}>
      <TouchableOpacity
        style={[styles.tabBarItem, telaAtiva === 'dashboard' && styles.tabBarItemAtivo]}
        onPress={() => onSelecionarTela('dashboard')}
        activeOpacity={0.8}
      >
        <Text style={[styles.tabBarItemIcon, telaAtiva === 'dashboard' && styles.tabBarItemIconAtivo]}>
          📊
        </Text>
        <Text style={[styles.tabBarItemTexto, telaAtiva === 'dashboard' && styles.tabBarItemTextoAtivo]}>
          Semana
        </Text>
      </TouchableOpacity>

      {/* FAB FLUTUANTE CENTRAL DA CÂMERA / GANHO */}
      <TouchableOpacity
        style={styles.tabBarFab}
        onPress={onPressionarFab}
        activeOpacity={0.85}
      >
        <Text style={styles.tabBarFabIcon}>+</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.tabBarItem, telaAtiva === 'carteira' && styles.tabBarItemAtivo]}
        onPress={() => onSelecionarTela('carteira')}
        activeOpacity={0.8}
      >
        <Text style={[styles.tabBarItemIcon, telaAtiva === 'carteira' && styles.tabBarItemIconAtivo]}>
          💼
        </Text>
        <Text style={[styles.tabBarItemTexto, telaAtiva === 'carteira' && styles.tabBarItemTextoAtivo]}>
          Carteira
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  // ══════════════════════════════════════════════════════════════════════════
  // BARRA DE NAVEGAÇÃO INFERIOR (BOTTOM TABS)
  // ══════════════════════════════════════════════════════════════════════════
  bottomTabBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 72,
    backgroundColor: '#0F172A',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: cores.superficieAlta,
    paddingBottom: 8,
    paddingHorizontal: 20,
  },
  tabBarItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  tabBarItemAtivo: {},
  tabBarItemIcon: {
    fontSize: 22,
    opacity: 0.5,
  },
  tabBarItemIconAtivo: {
    opacity: 1,
  },
  tabBarItemTexto: {
    color: cores.textoApagado,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  tabBarItemTextoAtivo: {
    color: cores.primaria,
    fontWeight: '800',
  },
  tabBarFab: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: cores.primaria,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -28,
    elevation: 8,
    shadowColor: cores.primaria,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  tabBarFabIcon: {
    fontSize: 30,
    fontWeight: 'bold',
    color: cores.primariaTexto,
    marginTop: -2,
  },
});
