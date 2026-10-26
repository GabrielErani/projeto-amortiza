import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { cores, espaco, layout, opacidade, ponto, superficies, tamanho, textos } from '../theme';

export interface OpcaoPill<T extends string | number> {
  valor: T;
  rotulo: string;
  detalhe?: string; // segunda linha (ex.: total da semana)
  destaque?: boolean; // ex.: dia ou semana atual
  rotuloAcessivel?: string;
}

interface Props<T extends string | number> {
  opcoes: OpcaoPill<T>[];
  valor: T;
  onChange: (v: T) => void;
  rolavel?: boolean; // uma linha com rolagem horizontal (ex.: semanas do mês)
}

export function PillSelector<T extends string | number>({ opcoes, valor, onChange, rolavel }: Props<T>) {
  const pilulas = opcoes.map((o) => {
    const ativo = o.valor === valor;
    return (
      <TouchableOpacity
        key={String(o.valor)}
        style={[superficies.pilula, rolavel ? styles.larga : styles.flexivel, ativo && styles.ativa]}
        onPress={() => onChange(o.valor)}
        activeOpacity={opacidade.toque}
        accessibilityRole="button"
        accessibilityLabel={o.rotuloAcessivel}
        accessibilityState={{ selected: ativo }}
      >
        <Text style={[textos.legenda, ativo && styles.textoAtivo]}>{o.rotulo}</Text>
        {o.detalhe ? <Text style={[textos.legenda, textos.forte, ativo && styles.textoAtivo]}>{o.detalhe}</Text> : null}
        {o.destaque ? <View style={ponto(ativo ? cores.primariaTexto : cores.textoSuave, tamanho.pontoMini)} /> : null}
      </TouchableOpacity>
    );
  });

  return rolavel ? (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={layout.gapSm}>
      {pilulas}
    </ScrollView>
  ) : (
    <View style={styles.linha}>{pilulas}</View>
  );
}

const styles = StyleSheet.create({
  linha: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.xs },
  flexivel: { flexGrow: 1 },
  larga: { gap: espaco.xxs, paddingHorizontal: espaco.md, paddingVertical: espaco.xs },
  ativa: { backgroundColor: cores.primaria },
  textoAtivo: { color: cores.primariaTexto, fontWeight: '700' },
});
