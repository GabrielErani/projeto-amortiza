import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, ViewStyle } from 'react-native';
import { ALVO_TOQUE, cores, espaco, fonte, layout, opacidade, raio, tamanho } from '../theme';

type Variante = 'primario' | 'secundario' | 'texto' | 'perigo';

interface Props {
  titulo: string;
  onPress: () => void;
  variante?: Variante;
  carregando?: boolean;
  desabilitado?: boolean;
  estilo?: ViewStyle;
}

const VARIANTES: Record<Variante, { caixa: ViewStyle; cor: string }> = {
  primario: { caixa: { backgroundColor: cores.primaria }, cor: cores.primariaTexto },
  secundario: { caixa: { borderColor: cores.neutro }, cor: cores.texto },
  texto: { caixa: { minHeight: ALVO_TOQUE }, cor: cores.textoSuave },
  perigo: { caixa: { borderColor: cores.erroBorda }, cor: cores.erro },
};

export function Botao({ titulo, onPress, variante = 'primario', carregando = false, desabilitado = false, estilo }: Props) {
  const inativo = carregando || desabilitado;
  const { caixa, cor } = VARIANTES[variante];

  return (
    <TouchableOpacity
      style={[styles.base, caixa, inativo && styles.inativo, estilo]}
      onPress={onPress}
      disabled={inativo}
      activeOpacity={opacidade.toque}
      accessibilityRole="button"
      // O nome continua acessível quando o rótulo dá lugar ao indicador de carregamento.
      accessibilityLabel={titulo}
      accessibilityState={{ disabled: inativo, busy: carregando }}
    >
      {carregando ? <ActivityIndicator color={cor} /> : <Text style={[fonte.subtitulo, { color: cor }]}>{titulo}</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    ...layout.centro, minHeight: tamanho.botao, paddingHorizontal: espaco.lg,
    borderRadius: raio.md, borderWidth: 1, borderColor: cores.transparente,
  },
  inativo: { opacity: opacidade.inativo },
});
