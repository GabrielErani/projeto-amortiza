// Barra inferior: Semana | + | Carteira
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { ALVO_TOQUE, circulo, cores, espaco, fonte, layout, opacidade, raio, sombras, tamanho, textos } from '../theme';

export type Aba = 'semana' | 'carteira';

interface Props {
  aba: Aba;
  onTrocar: (aba: Aba) => void;
  onAdicionar: () => void;
}

export function TabBar({ aba, onTrocar, onAdicionar }: Props) {
  return (
    <View style={styles.barra} accessibilityRole="tablist">
      <ItemAba rotulo="Semana" icone={styles.iconeSemana} ativo={aba === 'semana'} onPress={() => onTrocar('semana')} />
      <TouchableOpacity
        style={styles.fab}
        onPress={onAdicionar}
        activeOpacity={opacidade.toque}
        accessibilityRole="button"
        accessibilityLabel="Adicionar ganho"
      >
        <Text style={styles.fabTexto}>+</Text>
      </TouchableOpacity>
      <ItemAba rotulo="Carteira" icone={styles.iconeCarteira} ativo={aba === 'carteira'} onPress={() => onTrocar('carteira')} />
    </View>
  );
}

function ItemAba({ rotulo, icone, ativo, onPress }: { rotulo: string; icone: ViewStyle; ativo: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={styles.item}
      onPress={onPress}
      activeOpacity={opacidade.toque}
      accessibilityRole="tab"
      accessibilityState={{ selected: ativo }}
    >
      <View style={[icone, { borderColor: ativo ? cores.texto : cores.textoApagado }]} />
      <Text style={[textos.legendaSuave, ativo && textos.forte]}>{rotulo}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  barra: {
    ...layout.linha, paddingTop: espaco.sm, paddingBottom: espaco.xs, paddingHorizontal: espaco.xl,
    borderTopWidth: 1, borderTopColor: cores.borda, backgroundColor: cores.fundo,
  },
  item: { ...layout.centro, flex: 1, gap: espaco.xs, minHeight: ALVO_TOQUE },
  // Ícones discretos: traço (Semana) e carteira vazada; a cor vem da borda.
  iconeSemana: { width: tamanho.iconeAba, height: tamanho.trilha, borderRadius: raio.xxs, borderWidth: tamanho.contorno },
  iconeCarteira: { width: tamanho.iconeAba, height: tamanho.iconeCarteira, borderRadius: raio.xs, borderWidth: tamanho.contorno },
  fab: { ...circulo(tamanho.fab, cores.primaria), ...sombras.fab, marginTop: -tamanho.fab / 2 },
  fabTexto: { ...fonte.display, color: cores.primariaTexto },
});
