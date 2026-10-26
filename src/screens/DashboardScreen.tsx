// Tela 1: Dashboard Operacional Semanal (ganho total, gráfico de amortização e Regra Amortiza)
// Documentação React Native: https://reactnative.dev/docs/getting-started

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { estilosCompartilhados } from '../styles/compartilhados';
import { corPorStatus, cores } from '../theme';
import { GanhoDia } from '../types';

export interface DashboardScreenProps {
  diasSemana: GanhoDia[];
  diaSelecionadoIdx: number;
  metaDiariaBase: number;
  totalSemana: number;
  totalCobertoSemana: number;
  diasAmortizadosCompletos: number;
  onSelecionarDia: (idx: number) => void;
  onAbrirMetaBase: () => void;
  onLancarGanho: (idx: number) => void;
}

export function DashboardScreen({
  diasSemana,
  diaSelecionadoIdx,
  metaDiariaBase,
  totalSemana,
  totalCobertoSemana,
  diasAmortizadosCompletos,
  onSelecionarDia,
  onAbrirMetaBase,
  onLancarGanho,
}: DashboardScreenProps) {
  const diaSelecionado = diasSemana[diaSelecionadoIdx] || diasSemana[0];
  const metaTotalSemana = metaDiariaBase * 7;

  return (
    <>
      {/* GANHO TOTAL DA SEMANA */}
      <View style={styles.mainEarningsCard}>
        <View style={styles.earningsHeaderRow}>
          <Text style={styles.earningsLabel}>Ganho Total da Semana</Text>
          <TouchableOpacity style={styles.gearButton} onPress={onAbrirMetaBase}>
            <Text style={styles.gearButtonText}>⚙️ Meta: R$ {metaDiariaBase.toFixed(0)}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.totalAmountText}>
          R$ {totalSemana.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </Text>

        {/* SUB-DESTAQUE: DIA SELECIONADO & BOTÃO LANÇAR */}
        <View style={styles.selectedDayRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.selectedDayLabel}>{diaSelecionado.diaCompleto}:</Text>
            <Text style={styles.selectedDayValue}>
              {diaSelecionado.valor > 0
                ? `Fez R$ ${diaSelecionado.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : 'Sem ganho trabalhado'}
            </Text>
            <Text style={styles.selectedDayMetaInfo}>
              Status: {diaSelecionado.detalheAmortizacao}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.btnEditarGanho}
            onPress={() => onLancarGanho(diaSelecionadoIdx)}
            activeOpacity={0.8}
          >
            <Text style={styles.btnEditarGanhoTexto}>
              {diaSelecionado.valor > 0 ? '+ Adicionar' : '+ Inserir'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* GRÁFICO DE BARRAS DE AMORTIZAÇÃO POR FASES */}
      <View style={styles.chartContainer}>
        <View style={styles.barsRow}>
          {diasSemana.map((item, index) => {
            const isSelected = index === diaSelecionadoIdx;
            const alturaBarra = Math.max(10, item.percentual);
            // Atingida = verde, Adiantada = azul, Parcial = amarelo, Pendente = cinza
            const corBarra = corPorStatus(item.statusAmortizacao);

            return (
              <TouchableOpacity
                key={index}
                style={styles.barColumn}
                onPress={() => onSelecionarDia(index)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.barTopValue,
                    isSelected && { color: '#FFFFFF', fontWeight: 'bold' },
                    item.percentual === 100 && { color: cores.primaria },
                  ]}
                >
                  {item.percentual > 0 ? `${item.percentual}%` : '0%'}
                </Text>

                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        height: `${alturaBarra}%`,
                        backgroundColor: corBarra,
                      },
                      isSelected && styles.barFillSelected,
                    ]}
                  />
                </View>

                <Text
                  style={[
                    styles.dayLabel,
                    isSelected && styles.dayLabelActive,
                    item.isHoje && styles.dayLabelHoje,
                  ]}
                >
                  {item.sigla}
                </Text>

                {item.valor > 0 && (
                  <Text style={styles.dayValorSub}>R${Math.round(item.valor)}</Text>
                )}

                {item.isHoje && <View style={styles.hojeIndicator} />}
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.chartLegend}>
          Barras mostram o % amortizado de cada dia • Azul = Adiantado
        </Text>
      </View>

      <View style={styles.horizontalDivider} />

      {/* CARD DE AMORTIZAÇÃO OPERACIONAL */}
      <View style={styles.amortizacaoCard}>
        <View style={styles.amortizacaoHeader}>
          <Text style={styles.amortizacaoTitle}>⚡ Regra Amortiza</Text>
          <Text style={styles.amortizacaoBadge}>
            {diasAmortizadosCompletos}/7 Dias Pagos
          </Text>
        </View>

        <View style={{ marginVertical: 8 }}>
          <Text style={styles.amortizacaoSubHeader}>
            Progresso Semanal (Meta: R$ {metaTotalSemana.toFixed(2)}):
          </Text>
          <Text style={styles.amortizacaoAmount}>
            R$ {totalCobertoSemana.toFixed(2)} cobertos
          </Text>
        </View>

        <View style={styles.progressContainer}>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.min(100, Math.round((totalCobertoSemana / metaTotalSemana) * 100))}%` },
              ]}
            />
          </View>
          <Text style={styles.progressText}>
            {Math.round((totalCobertoSemana / metaTotalSemana) * 100)}% da semana concluída
          </Text>
        </View>

        <View style={styles.impactoContainer}>
          <Text style={styles.impactoTitulo}>
            📅 {diaSelecionado.diaCompleto}:
          </Text>
          <Text style={styles.impactoValor}>
            Fez: <Text style={{ color: cores.primaria, fontWeight: 'bold' }}>R$ {diaSelecionado.valor.toFixed(2)}</Text> • Meta Base: R$ {metaDiariaBase.toFixed(2)}
          </Text>
          <Text style={styles.impactoExplicacao}>
            Status: <Text style={{ color: cores.texto, fontWeight: 'bold' }}>{diaSelecionado.detalheAmortizacao}</Text>
          </Text>
        </View>
      </View>
    </>
  );
}

const styles = {
  ...estilosCompartilhados,
  ...StyleSheet.create({
    // CARD DE GANHOS PRINCIPAL
    mainEarningsCard: {
      marginTop: 20,
      marginBottom: 16,
      minHeight: 80,
    },
    earningsHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    earningsLabel: {
      color: cores.textoSuave,
      fontSize: 13,
      fontWeight: '500',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    gearButton: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      backgroundColor: cores.superficieAlta,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: cores.neutro,
    },
    gearButtonText: {
      fontSize: 12,
      color: cores.texto,
      fontWeight: '700',
    },
    totalAmountText: {
      color: '#FFFFFF',
      fontSize: 40,
      fontWeight: '800',
      marginVertical: 4,
      letterSpacing: -1,
    },
    selectedDayRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 10,
      backgroundColor: '#131C2E',
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: cores.superficieAlta,
    },
    selectedDayLabel: {
      color: cores.textoApagado,
      fontSize: 12,
      marginBottom: 2,
    },
    selectedDayValue: {
      color: cores.primaria,
      fontSize: 16,
      fontWeight: '700',
    },
    selectedDayMetaInfo: {
      color: cores.textoSuave,
      fontSize: 11,
      marginTop: 2,
    },
    btnEditarGanho: {
      backgroundColor: cores.superficieAlta,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: cores.primaria,
    },
    btnEditarGanhoTexto: {
      color: cores.primaria,
      fontSize: 13,
      fontWeight: '700',
    },

    // GRÁFICO DE BARRAS
    chartContainer: {
      backgroundColor: '#131C2E',
      borderRadius: 16,
      padding: 18,
      marginVertical: 10,
      borderWidth: 1,
      borderColor: cores.superficieAlta,
    },
    barsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      height: 150,
      paddingTop: 20,
    },
    barColumn: {
      flex: 1,
      alignItems: 'center',
    },
    barTopValue: {
      color: cores.textoApagado,
      fontSize: 9,
      fontWeight: '700',
      marginBottom: 4,
    },
    barTrack: {
      width: 22,
      height: 110,
      backgroundColor: cores.superficieAlta,
      borderRadius: 11,
      justifyContent: 'flex-end',
      overflow: 'hidden',
    },
    barFill: {
      width: '100%',
      borderRadius: 11,
    },
    barFillSelected: {
      borderWidth: 1,
      borderColor: '#FFFFFF',
    },
    dayLabel: {
      color: cores.textoApagado,
      fontSize: 11,
      marginTop: 8,
      fontWeight: '600',
    },
    dayLabelActive: {
      color: '#FFFFFF',
      fontWeight: '700',
    },
    dayLabelHoje: {
      color: cores.primaria,
    },
    dayValorSub: {
      color: cores.textoSuave,
      fontSize: 8.5,
      marginTop: 1,
    },
    hojeIndicator: {
      width: 4,
      height: 4,
      borderRadius: 2,
      backgroundColor: cores.primaria,
      marginTop: 2,
    },
    chartLegend: {
      color: cores.textoApagado,
      fontSize: 11,
      textAlign: 'center',
      marginTop: 12,
      fontStyle: 'italic',
    },

    // CARD DE AMORTIZAÇÃO
    amortizacaoCard: {
      backgroundColor: '#131C2E',
      borderRadius: 16,
      padding: 20,
      borderLeftWidth: 4,
      borderLeftColor: cores.primaria,
      borderWidth: 1,
      borderColor: cores.superficieAlta,
    },
    amortizacaoHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    amortizacaoTitle: {
      color: cores.texto,
      fontSize: 16,
      fontWeight: '700',
    },
    amortizacaoBadge: {
      backgroundColor: 'rgba(0, 210, 106, 0.15)',
      color: cores.primaria,
      fontSize: 11,
      fontWeight: '700',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    amortizacaoSubHeader: {
      color: cores.textoSuave,
      fontSize: 12,
      fontWeight: '500',
      marginTop: 8,
    },
    amortizacaoAmount: {
      color: '#FFFFFF',
      fontSize: 30,
      fontWeight: '800',
      marginVertical: 4,
    },
    progressContainer: {
      marginTop: 4,
    },
    progressTrack: {
      height: 8,
      backgroundColor: cores.superficieAlta,
      borderRadius: 4,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      backgroundColor: cores.primaria,
      borderRadius: 4,
    },
    progressText: {
      color: cores.textoSuave,
      fontSize: 12,
      marginTop: 6,
      fontWeight: '500',
    },
    impactoContainer: {
      marginTop: 16,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: cores.superficieAlta,
    },
    impactoTitulo: {
      color: cores.texto,
      fontSize: 13,
      fontWeight: '700',
      marginBottom: 2,
    },
    impactoValor: {
      color: cores.textoSuave,
      fontSize: 13,
      marginBottom: 4,
    },
    impactoExplicacao: {
      color: cores.textoApagado,
      fontSize: 12,
      lineHeight: 18,
    },
  }),
};
