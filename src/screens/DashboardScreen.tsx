// Primeira página: só o essencial — total da semana, gráfico e o dia selecionado.
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Botao } from '../components/Botao';
import { GraficoSemana } from '../components/GraficoSemana';
import { rotuloDia } from '../components/rotulos';
import { cores, corPorStatus, espaco, layout, opacidade, ponto, raio, superficies, tamanho, textos } from '../theme';
import { GanhoDia } from '../types';
import { formatarMoeda, formatarMoedaCurta } from '../utils/formatacao';

interface Props {
  dias: GanhoDia[];
  diaSelecionadoIdx: number;
  onSelecionarDia: (idx: number) => void;
  metaBase: number;
  onEditarMeta: () => void;
  onLancarGanho: (idx: number) => void;
}

export function DashboardScreen({ dias, diaSelecionadoIdx, onSelecionarDia, metaBase, onEditarMeta, onLancarGanho }: Props) {
  const dia = dias[diaSelecionadoIdx] ?? dias[0];
  const totalSemana = dias.reduce((acc, d) => acc + d.valor, 0);
  const totalCoberto = dias.reduce((acc, d) => acc + d.valorCoberto, 0);
  const metaSemana = metaBase * 7;
  const diasCobertos = dias.filter((d) => d.percentual === 100).length;
  const progresso = metaSemana > 0 ? Math.min(100, Math.round((totalCoberto / metaSemana) * 100)) : 0;

  return (
    <View style={layout.gapXl}>
      <View style={layout.gapXs}>
        <Text style={textos.legenda}>Ganho total da semana</Text>
        <Text style={textos.hero}>{formatarMoeda(totalSemana)}</Text>
        <TouchableOpacity
          onPress={onEditarMeta}
          activeOpacity={opacidade.toque}
          // Toque expandido mais para baixo, para não pegar o valor grande logo acima.
          hitSlop={{ top: espaco.md, bottom: espaco.xl }}
          accessibilityRole="button"
          accessibilityHint="Ajustar a meta diária"
        >
          <Text style={textos.detalhe}>
            Meta <Text style={textos.forte}>{formatarMoedaCurta(metaSemana)}</Text> · <Text style={textos.forte}>{diasCobertos}/7</Text> dias cobertos
          </Text>
        </TouchableOpacity>
        <View
          style={styles.trilha}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Cobertura da meta da semana"
          accessibilityValue={{ min: 0, max: 100, now: progresso }}
        >
          <View style={[styles.progresso, { width: `${progresso}%` }]} />
        </View>
      </View>

      <GraficoSemana dias={dias} selecionadoIdx={diaSelecionadoIdx} onSelecionar={onSelecionarDia} />

      {dia && (
        <View style={superficies.cardBase}>
          <Text style={textos.detalhe}>{rotuloDia(dia)}</Text>
          <View style={[layout.linhaEntre, layout.gapMd]}>
            <Text style={textos.titulo}>{formatarMoeda(dia.valor)}</Text>
            <View style={[layout.linha, layout.gapXs, styles.status]}>
              <View style={ponto(corPorStatus(dia.statusAmortizacao))} />
              <Text style={[textos.legenda, styles.status]} numberOfLines={1}>{dia.detalheAmortizacao}</Text>
            </View>
          </View>
          <Botao titulo="Lançar ganho" onPress={() => onLancarGanho(diaSelecionadoIdx)} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  trilha: { height: tamanho.trilha, marginTop: espaco.xs, borderRadius: raio.xxs, overflow: 'hidden', backgroundColor: cores.superficieAlta },
  progresso: { height: '100%', backgroundColor: cores.primaria },
  status: { flexShrink: 1 },
});
