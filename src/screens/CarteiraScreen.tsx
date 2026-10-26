// Tela 2: Carteira (Visão Macro de Controle: ganhos da semana/mês e gestão de dívidas)
// Documentação React Native: https://reactnative.dev/docs/getting-started
// Documentação ScrollView horizontal: https://reactnative.dev/docs/scrollview

import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { estilosCompartilhados } from '../styles/compartilhados';
import { cores } from '../theme';
import { DividaItem, SemanaMesInfo } from '../types';
import { calcularResumoDividas, rotuloFrequencia } from '../utils/dividas';

export interface CarteiraScreenProps {
  totalSemana: number;
  diasAmortizadosCompletos: number;
  semanasMes: SemanaMesInfo[];
  totalMes: number; // só dias do mês (somarGanhosDoMes)
  semanaMesSelecionadaIdx: number;
  dividas: DividaItem[];
  onSelecionarSemana: (idx: number) => void;
  onAdicionarDivida: (tipo: DividaItem['tipo']) => void;
  onExcluirDivida: (id: string, descricao: string) => void;
}

export function CarteiraScreen({
  totalSemana,
  diasAmortizadosCompletos,
  semanasMes,
  totalMes,
  semanaMesSelecionadaIdx,
  dividas,
  onSelecionarSemana,
  onAdicionarDivida,
  onExcluirDivida,
}: CarteiraScreenProps) {
  const resumoDividas = useMemo(() => calcularResumoDividas(dividas), [dividas]);
  const semanaSelecionadaInfo = semanasMes[semanaMesSelecionadaIdx] || semanasMes[0];

  const dividasDiarias = dividas.filter(d => d.tipo === 'diaria');
  const dividasMensais = dividas.filter(d => d.tipo === 'mensal');
  const dividasImprevistas = dividas.filter(d => d.tipo === 'imprevista');

  return (
    <View style={styles.carteiraContainer}>
      {/* ─── BLOCO 1: GANHOS MACRO ───────────────────────────────────── */}
      <Text style={styles.secaoMacroTitulo}>💼 Visão Macro de Ganhos</Text>

      {/* CARDS LADO A LADO: SEMANA ATUAL VS MÊS TOTAL */}
      <View style={styles.macroCardsRow}>
        <View style={styles.macroCardItem}>
          <Text style={styles.macroCardLabel}>SEMANA ATUAL</Text>
          <Text style={styles.macroCardValorDestaque}>
            R$ {totalSemana.toFixed(2)}
          </Text>
          <Text style={styles.macroCardSub}>
            {diasAmortizadosCompletos} de 7 metas batidas
          </Text>
        </View>

        <View style={styles.macroCardItem}>
          <Text style={styles.macroCardLabel}>TOTAL DO MÊS</Text>
          <Text style={[styles.macroCardValorDestaque, { color: cores.info }]}>
            R$ {totalMes.toFixed(2)}
          </Text>
          <Text style={styles.macroCardSub}>
            Todas as semanas somadas
          </Text>
        </View>
      </View>

      {/* SELETOR DE OUTRAS SEMANAS DO MÊS */}
      <Text style={styles.subSecaoTitulo}>Navegar nas Semanas do Mês:</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.semanasScrollRow}
      >
        {semanasMes.map((s, idx) => {
          const ativa = idx === semanaMesSelecionadaIdx;
          return (
            <TouchableOpacity
              key={idx}
              style={[styles.semanaCardPill, ativa && styles.semanaCardPillAtiva]}
              onPress={() => onSelecionarSemana(idx)}
              activeOpacity={0.8}
            >
              <Text style={[styles.semanaPillNome, ativa && styles.semanaPillNomeAtiva]}>
                {s.rotulo}
                {s.isAtual ? ' ★' : ''}
              </Text>
              <Text style={[styles.semanaPillValor, ativa && styles.semanaPillValorAtiva]}>
                R$ {s.totalGanhos.toFixed(2)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.detalheSemanaCard}>
        <Text style={styles.detalheSemanaTitulo}>
          Detalhe da {semanaSelecionadaInfo?.rotulo}:
        </Text>
        <Text style={styles.detalheSemanaGanhos}>
          Total arrecadado: <Text style={{ color: cores.primaria, fontWeight: 'bold' }}>R$ {semanaSelecionadaInfo?.totalGanhos.toFixed(2)}</Text>
        </Text>
      </View>

      <View style={styles.horizontalDivider} />

      {/* ─── BLOCO 2: GESTÃO DE DÍVIDAS MACRO ─────────────────────────── */}
      <Text style={styles.secaoMacroTitulo}>📉 Gestão de Dívidas & Custos</Text>

      {/* CARD DESTAQUE: DÍVIDA ANUAL PROJETADA (CÁLCULO AUTOMÁTICO) */}
      <View style={styles.cardDividaAnual}>
        <View style={styles.dividaAnualHeader}>
          <Text style={styles.dividaAnualTitulo}>⚡ Dívida Anual Projetada</Text>
          <Text style={styles.dividaAnualBadge}>Automático 365 dias</Text>
        </View>

        <Text style={styles.dividaAnualValor}>
          R$ {resumoDividas.totalAnualCalculado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </Text>
        <Text style={styles.dividaAnualExplicacao}>
          Calculada com base nas suas dívidas diárias (x365), mensais (x12) e imprevistos acumulados.
        </Text>

        <View style={styles.dividaAnualBreakdownRow}>
          <View style={styles.breakdownItem}>
            <Text style={styles.breakdownItemLabel}>Diárias/Ano</Text>
            <Text style={styles.breakdownItemVal}>R$ {(resumoDividas.totalDiario * 365).toFixed(0)}</Text>
          </View>
          <View style={styles.breakdownItem}>
            <Text style={styles.breakdownItemLabel}>Mensais/Ano</Text>
            <Text style={styles.breakdownItemVal}>R$ {(resumoDividas.totalMensal * 12).toFixed(0)}</Text>
          </View>
          <View style={styles.breakdownItem}>
            <Text style={styles.breakdownItemLabel}>Imprevistos</Text>
            <Text style={styles.breakdownItemVal}>R$ {resumoDividas.totalImprevistosAnualizado.toFixed(0)}</Text>
          </View>
        </View>
      </View>

      {/* 1. DÍVIDAS DIÁRIAS (GASTOS DIÁRIOS) */}
      <View style={styles.categoriaDividaBox}>
        <View style={styles.categoriaDividaHeader}>
          <View>
            <Text style={styles.categoriaDividaTitulo}>☀️ Dívidas Diárias (Gasto Diário)</Text>
            <Text style={styles.categoriaDividaTotal}>
              R$ {resumoDividas.totalDiario.toFixed(2)} / dia
            </Text>
          </View>
          <TouchableOpacity
            style={styles.btnAddDivida}
            onPress={() => onAdicionarDivida('diaria')}
          >
            <Text style={styles.btnAddDividaTexto}>+ Adicionar</Text>
          </TouchableOpacity>
        </View>

        {dividasDiarias.length === 0 ? (
          <Text style={styles.dividaVaziaTexto}>Nenhum gasto diário registrado (ex: combustível, almoço).</Text>
        ) : (
          dividasDiarias.map(item => (
            <View key={item.id} style={styles.itemDividaRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemDividaDesc}>{item.descricao}</Text>
                <Text style={styles.itemDividaSub}>Impacto: R$ {(item.valor * 365).toFixed(2)}/ano</Text>
              </View>
              <Text style={styles.itemDividaValor}>R$ {item.valor.toFixed(2)}/dia</Text>
              <TouchableOpacity
                style={styles.btnExcluirDivida}
                onPress={() => onExcluirDivida(item.id, item.descricao)}
              >
                <Text style={styles.btnExcluirDividaTexto}>✕</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      {/* 2. DÍVIDAS MENSAIS (CUSTOS FIXOS) */}
      <View style={styles.categoriaDividaBox}>
        <View style={styles.categoriaDividaHeader}>
          <View>
            <Text style={styles.categoriaDividaTitulo}>📅 Dívidas Mensais (Custos Fixos)</Text>
            <Text style={styles.categoriaDividaTotal}>
              R$ {resumoDividas.totalMensal.toFixed(2)} / mês
            </Text>
          </View>
          <TouchableOpacity
            style={styles.btnAddDivida}
            onPress={() => onAdicionarDivida('mensal')}
          >
            <Text style={styles.btnAddDividaTexto}>+ Adicionar</Text>
          </TouchableOpacity>
        </View>

        {dividasMensais.length === 0 ? (
          <Text style={styles.dividaVaziaTexto}>Nenhuma dívida mensal registrada (ex: aluguel carro, seguro, parcela).</Text>
        ) : (
          dividasMensais.map(item => (
            <View key={item.id} style={styles.itemDividaRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemDividaDesc}>{item.descricao}</Text>
                <Text style={styles.itemDividaSub}>Impacto: R$ {(item.valor * 12).toFixed(2)}/ano</Text>
              </View>
              <Text style={styles.itemDividaValor}>R$ {item.valor.toFixed(2)}/mês</Text>
              <TouchableOpacity
                style={styles.btnExcluirDivida}
                onPress={() => onExcluirDivida(item.id, item.descricao)}
              >
                <Text style={styles.btnExcluirDividaTexto}>✕</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      {/* 3. DÍVIDAS IMPREVISTAS (CONFIGURÁVEL) */}
      <View style={styles.categoriaDividaBox}>
        <View style={styles.categoriaDividaHeader}>
          <View>
            <Text style={styles.categoriaDividaTitulo}>🚨 Dívidas Imprevistas</Text>
            <Text style={styles.categoriaDividaTotal}>
              Impacto anual: R$ {resumoDividas.totalImprevistosAnualizado.toFixed(2)}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.btnAddDivida}
            onPress={() => onAdicionarDivida('imprevista')}
          >
            <Text style={styles.btnAddDividaTexto}>+ Lançar</Text>
          </TouchableOpacity>
        </View>

        {dividasImprevistas.length === 0 ? (
          <Text style={styles.dividaVaziaTexto}>Nenhum imprevisto registrado (ex: manutenção inesperada, multa).</Text>
        ) : (
          dividasImprevistas.map(item => (
            <View key={item.id} style={styles.itemDividaRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemDividaDesc}>{item.descricao}</Text>
                <Text style={styles.itemDividaSub}>
                  Frequência: {rotuloFrequencia(item.frequenciaImprevisto)}
                </Text>
              </View>
              <Text style={[styles.itemDividaValor, { color: cores.erro }]}>R$ {item.valor.toFixed(2)}</Text>
              <TouchableOpacity
                style={styles.btnExcluirDivida}
                onPress={() => onExcluirDivida(item.id, item.descricao)}
              >
                <Text style={styles.btnExcluirDividaTexto}>✕</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

const styles = {
  ...estilosCompartilhados,
  ...StyleSheet.create({
    // ════════════════════════════════════════════════════════════════════════
    // ESTILOS DA CARTEIRA & VISÃO MACRO
    // ════════════════════════════════════════════════════════════════════════
    carteiraContainer: {
      marginTop: 10,
    },
    secaoMacroTitulo: {
      color: cores.texto,
      fontSize: 18,
      fontWeight: '800',
      marginBottom: 14,
      letterSpacing: -0.3,
    },
    subSecaoTitulo: {
      color: cores.textoSuave,
      fontSize: 13,
      fontWeight: '600',
      marginTop: 14,
      marginBottom: 8,
    },
    macroCardsRow: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 6,
    },
    macroCardItem: {
      flex: 1,
      backgroundColor: '#131C2E',
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: cores.superficieAlta,
    },
    macroCardLabel: {
      color: cores.textoSuave,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.5,
      marginBottom: 4,
    },
    macroCardValorDestaque: {
      color: cores.primaria,
      fontSize: 24,
      fontWeight: '800',
      marginBottom: 4,
    },
    macroCardSub: {
      color: cores.textoApagado,
      fontSize: 11,
    },
    semanasScrollRow: {
      flexDirection: 'row',
      gap: 8,
      paddingVertical: 6,
    },
    semanaCardPill: {
      backgroundColor: '#131C2E',
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: cores.superficieAlta,
      minWidth: 120,
    },
    semanaCardPillAtiva: {
      borderColor: cores.primaria,
      backgroundColor: cores.superficieAlta,
    },
    semanaPillNome: {
      color: cores.textoSuave,
      fontSize: 11,
      fontWeight: '600',
      marginBottom: 2,
    },
    semanaPillNomeAtiva: {
      color: '#FFFFFF',
      fontWeight: '700',
    },
    semanaPillValor: {
      color: cores.texto,
      fontSize: 14,
      fontWeight: '700',
    },
    semanaPillValorAtiva: {
      color: cores.primaria,
    },
    detalheSemanaCard: {
      backgroundColor: '#0F172A',
      borderRadius: 12,
      padding: 12,
      marginTop: 8,
      borderWidth: 1,
      borderColor: cores.superficieAlta,
    },
    detalheSemanaTitulo: {
      color: cores.textoSuave,
      fontSize: 12,
      marginBottom: 2,
    },
    detalheSemanaGanhos: {
      color: cores.texto,
      fontSize: 13,
    },

    // CARD DESTAQUE DÍVIDA ANUAL
    cardDividaAnual: {
      backgroundColor: '#1E1B2E',
      borderRadius: 18,
      padding: 20,
      borderLeftWidth: 4,
      borderLeftColor: cores.erro,
      borderWidth: 1,
      borderColor: '#373052',
      marginBottom: 20,
    },
    dividaAnualHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 6,
    },
    dividaAnualTitulo: {
      color: cores.texto,
      fontSize: 16,
      fontWeight: '800',
    },
    dividaAnualBadge: {
      backgroundColor: 'rgba(248, 113, 113, 0.15)',
      color: cores.erro,
      fontSize: 10,
      fontWeight: '700',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
    },
    dividaAnualValor: {
      color: '#FFFFFF',
      fontSize: 34,
      fontWeight: '800',
      marginVertical: 4,
      letterSpacing: -0.5,
    },
    dividaAnualExplicacao: {
      color: cores.textoSuave,
      fontSize: 12,
      lineHeight: 18,
      marginBottom: 14,
    },
    dividaAnualBreakdownRow: {
      flexDirection: 'row',
      borderTopWidth: 1,
      borderTopColor: '#2D2845',
      paddingTop: 10,
    },
    breakdownItem: {
      flex: 1,
      alignItems: 'center',
    },
    breakdownItemLabel: {
      color: cores.textoSuave,
      fontSize: 10,
      marginBottom: 2,
    },
    breakdownItemVal: {
      color: cores.erro,
      fontSize: 13,
      fontWeight: '700',
    },

    // CATEGORIAS DE DÍVIDAS
    categoriaDividaBox: {
      backgroundColor: '#131C2E',
      borderRadius: 16,
      padding: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: cores.superficieAlta,
    },
    categoriaDividaHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    categoriaDividaTitulo: {
      color: cores.texto,
      fontSize: 14,
      fontWeight: '700',
    },
    categoriaDividaTotal: {
      color: cores.primaria,
      fontSize: 15,
      fontWeight: '800',
      marginTop: 2,
    },
    btnAddDivida: {
      backgroundColor: cores.superficieAlta,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: cores.info,
    },
    btnAddDividaTexto: {
      color: cores.info,
      fontSize: 12,
      fontWeight: '700',
    },
    dividaVaziaTexto: {
      color: cores.textoApagado,
      fontSize: 12,
      fontStyle: 'italic',
      paddingVertical: 6,
    },
    itemDividaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: cores.superficieAlta,
    },
    itemDividaDesc: {
      color: cores.texto,
      fontSize: 14,
      fontWeight: '600',
    },
    itemDividaSub: {
      color: cores.textoApagado,
      fontSize: 11,
      marginTop: 2,
    },
    itemDividaValor: {
      color: cores.texto,
      fontSize: 14,
      fontWeight: '700',
      marginRight: 12,
    },
    btnExcluirDivida: {
      padding: 6,
      backgroundColor: cores.superficieAlta,
      borderRadius: 6,
    },
    btnExcluirDividaTexto: {
      color: '#EF4444',
      fontSize: 12,
      fontWeight: 'bold',
    },
  }),
};
