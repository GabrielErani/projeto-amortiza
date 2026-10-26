// Cabeçalho: título da aba e período à esquerda; chip de sincronização e avatar da conta à direita.
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { circulo, cores, espaco, expandirToque, layout, opacidade, tamanho, textos } from '../theme';
import { EstadoSync } from '../types';
import { IndicadorSync } from './IndicadorSync';

interface Props {
  titulo: string;
  subtitulo: string;
  estadoSync: EstadoSync;
  inicial: string;
  onSync: () => void;
  onConta: () => void;
}

export function Cabecalho({ titulo, subtitulo, estadoSync, inicial, onSync, onConta }: Props) {
  return (
    <View style={styles.cabecalho}>
      <View style={layout.preencher}>
        <Text style={textos.titulo} accessibilityRole="header">{titulo}</Text>
        <Text style={textos.legenda}>{subtitulo}</Text>
      </View>
      <IndicadorSync estado={estadoSync} onPress={onSync} />
      <TouchableOpacity
        style={styles.avatar}
        onPress={onConta}
        activeOpacity={opacidade.toque}
        hitSlop={expandirToque(tamanho.avatar)}
        accessibilityRole="button"
        accessibilityLabel="Conta"
      >
        <Text style={[textos.corpo, textos.forte]}>{inicial}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  cabecalho: { ...layout.linha, gap: espaco.sm, paddingHorizontal: espaco.xl, paddingTop: espaco.md, paddingBottom: espaco.sm },
  avatar: { ...circulo(tamanho.avatar), borderWidth: 1, borderColor: cores.borda },
});
