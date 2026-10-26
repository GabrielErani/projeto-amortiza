import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { cores, corPorStatus, espaco, layout, opacidade, ponto, raio, tamanho, textos } from '../theme';
import { GanhoDia } from '../types';

interface Props {
  dias: GanhoDia[];
  selecionadoIdx: number;
  onSelecionar: (idx: number) => void;
}

const LEGENDA: [cor: string, texto: string][] = [
  [cores.primaria, 'Meta batida'],
  [cores.info, 'Adiantado'],
  [cores.alerta, 'Parcial'],
];

export function GraficoSemana({ dias, selecionadoIdx, onSelecionar }: Props) {
  return (
    <View style={layout.gapMd}>
      <View style={styles.barras}>
        {dias.map((dia, idx) => {
          const ativo = idx === selecionadoIdx;
          const cor = corPorStatus(dia.statusAmortizacao);
          return (
            <TouchableOpacity
              key={dia.dataISO}
              style={styles.coluna}
              onPress={() => onSelecionar(idx)}
              activeOpacity={opacidade.toque}
              accessibilityRole="button"
              accessibilityLabel={`${dia.diaCompleto}, ${dia.percentual}% da meta`}
              accessibilityState={{ selected: ativo }}
            >
              <Text style={[textos.mini, dia.percentual > 0 && { color: cor }]}>{dia.percentual}%</Text>
              <View style={[styles.trilha, ativo && styles.trilhaAtiva]}>
                <View style={[styles.preenchimento, { height: `${Math.max(tamanho.barraMinimaPct, dia.percentual)}%`, backgroundColor: cor }]} />
              </View>
              <Text style={[textos.legendaSuave, ativo && textos.forte]}>{dia.sigla}</Text>
              <View style={ponto(dia.isHoje ? cores.primaria : cores.transparente, tamanho.pontoMini)} />
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={[layout.linha, layout.gapMd]}>
        {LEGENDA.map(([cor, texto]) => (
          <View key={texto} style={[layout.linha, layout.gapXs]}>
            <View style={[styles.legendaCor, { backgroundColor: cor }]} />
            <Text style={textos.mini}>{texto}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  barras: { flexDirection: 'row', alignItems: 'flex-end', gap: espaco.xs },
  coluna: { flex: 1, alignItems: 'center', gap: espaco.xs },
  trilha: {
    width: '100%', maxWidth: tamanho.barra, height: tamanho.grafico, justifyContent: 'flex-end',
    overflow: 'hidden', borderRadius: raio.sm, backgroundColor: cores.superficie,
  },
  trilhaAtiva: { borderWidth: tamanho.contorno, borderColor: cores.contorno },
  preenchimento: { width: '100%', borderRadius: raio.sm },
  legendaCor: { width: tamanho.quadradoLegenda, height: tamanho.quadradoLegenda, borderRadius: raio.xxs },
});
