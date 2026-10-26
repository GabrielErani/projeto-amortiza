// Aplicativo Amortiza - Dashboard Estilo Uber com Amortização e OCR On-Device
// Documentação React Native: https://reactnative.dev/docs/getting-started
// Documentação Safe Area Context: https://github.com/AppAndFlow/react-native-safe-area-context
// Documentação Supabase JS Client: https://supabase.com/docs/reference/javascript/initializing

import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import { processarOCRLocal } from './src/services/ocr';
import { salvarMetaSupabase, buscarMetasPorSemana, buscarMetasSupabase } from './src/services/supabase';
import { MetaNumerica, GanhoDia } from './src/types';

const { width } = Dimensions.get('window');

const META_DIARIA_PADRAO = 200.00;

// ─── UTILITÁRIOS DE DATA ──────────────────────────────────────────────────────
function toISOLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatarDataExibicao(date: Date): string {
  return date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace('.', '');
}

function formatarDiaCompleto(date: Date): string {
  const diaSemana = date.toLocaleDateString('pt-BR', { weekday: 'long' });
  const diaMes = formatarDataExibicao(date);
  return `${diaSemana.charAt(0).toUpperCase() + diaSemana.slice(1)}, ${diaMes}`;
}

function obterSegundaDaSemana(date: Date): Date {
  const d = new Date(date);
  const diaSemana = d.getDay(); // 0 = domingo, 1 = segunda...
  const diff = diaSemana === 0 ? -6 : 1 - diaSemana;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

const SIGLAS_DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

function gerarEstruturaSemana(hoje: Date): GanhoDia[] {
  const segunda = obterSegundaDaSemana(hoje);
  const hojeISO = toISOLocal(hoje);

  return Array.from({ length: 7 }, (_, i) => {
    const dia = new Date(segunda);
    dia.setDate(segunda.getDate() + i);
    const dataISO = toISOLocal(dia);
    return {
      data: dia,
      dataISO,
      dataExibicao: formatarDataExibicao(dia),
      diaCompleto: formatarDiaCompleto(dia),
      sigla: SIGLAS_DIAS[i],
      valor: 0,
      metaDoDia: META_DIARIA_PADRAO,
      saldoDia: 0,
      percentual: 0,
      isHoje: dataISO === hojeISO,
      temRegistro: false,
    };
  });
}

function formatarPeriodo(dias: GanhoDia[]): string {
  if (dias.length === 0) return '';
  return `${dias[0].dataExibicao} – ${dias[6].dataExibicao}`;
}

// ─── MOTOR DE CÁLCULO DE AMORTIZAÇÃO ──────────────────────────────────────────
/**
 * Regra Amortiza:
 * O dia 1 começa com a meta base.
 * Se o ganho do dia for menor que a meta, o déficit acumula para o próximo dia (meta sobe).
 * Se o ganho do dia for maior que a meta, o superávit amortiza o próximo dia (meta desce).
 */
function aplicarAmortizacaoSemana(dias: GanhoDia[], metaBase: number): GanhoDia[] {
  let saldoAcumulado = 0;

  return dias.map((dia) => {
    // Meta deste dia = meta base + o que sobrou (déficit positivo) ou faltou (superávit negativo)
    const metaDoDia = Math.max(0, metaBase + saldoAcumulado);

    // Se este dia tem registro de ganho:
    if (dia.temRegistro) {
      // Diferença = meta - ganho
      // Se meta era 200 e fez 100 -> faltou 100 -> saldoAcumulado = +100
      // Se meta era 200 e fez 250 -> sobrou 50 -> saldoAcumulado = -50
      saldoAcumulado = metaDoDia - dia.valor;
    }

    const saldoDia = metaDoDia - dia.valor;
    const percentual = metaDoDia > 0
      ? Math.min(200, Math.round((dia.valor / metaDoDia) * 100))
      : (dia.valor > 0 ? 100 : 0);

    return {
      ...dia,
      metaDoDia,
      saldoDia,
      percentual,
    };
  });
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────

export default function App() {
  const hoje = new Date();

  // Meta Base Diária Configurável (Ex: R$ 200, R$ 250...)
  const [metaDiariaBase, setMetaDiariaBase] = useState<number>(META_DIARIA_PADRAO);

  // Semana completa com cálculos
  const [diasSemana, setDiasSemana] = useState<GanhoDia[]>(() => {
    const estrutura = gerarEstruturaSemana(hoje);
    return aplicarAmortizacaoSemana(estrutura, META_DIARIA_PADRAO);
  });

  const [diaSelecionadoIdx, setDiaSelecionadoIdx] = useState<number>(() => {
    const estrutura = gerarEstruturaSemana(hoje);
    const idx = estrutura.findIndex(d => d.isHoje);
    return idx >= 0 ? idx : 0;
  });

  // Modais de Navegação e Menu
  const [menuDrawerAberto, setMenuDrawerAberto] = useState<boolean>(false);
  const [modalMetaBaseAberto, setModalMetaBaseAberto] = useState<boolean>(false);
  const [novaMetaBaseInput, setNovaMetaBaseInput] = useState<string>('200');
  const [modalEscolhaFABAberto, setModalEscolhaFABAberto] = useState<boolean>(false);

  // Estados de Inserção / OCR
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [analisandoOCR, setAnalisandoOCR] = useState<boolean>(false);
  const [ocrConfirmacaoPronta, setOcrConfirmacaoPronta] = useState<boolean>(false);
  const [valorExtraidoOCR, setValorExtraidoOCR] = useState<number>(0);
  const [salvandoNoBanco, setSalvandoNoBanco] = useState<boolean>(false);

  // Edição Manual
  const [modoEdicaoManual, setModoEdicaoManual] = useState<boolean>(false);
  const [valorManual, setValorManual] = useState<string>('');
  const [descricaoManual, setDescricaoManual] = useState<string>('');

  // Histórico Supabase
  const [metasBanco, setMetasBanco] = useState<MetaNumerica[]>([]);
  const [carregandoMetas, setCarregandoMetas] = useState<boolean>(false);
  const [atualizando, setAtualizando] = useState<boolean>(false);

  // Computados
  const diaSelecionado = diasSemana[diaSelecionadoIdx] || diasSemana[0];
  const totalSemana = diasSemana.reduce((acc, d) => acc + d.valor, 0);
  const periodo = formatarPeriodo(diasSemana);
  const maxValorSemana = Math.max(...diasSemana.map(d => Math.max(d.valor, d.metaDoDia)), metaDiariaBase);

  // Próximo dia em relação ao dia selecionado
  const proximoDiaIdx = diaSelecionadoIdx + 1;
  const proximoDia = proximoDiaIdx < diasSemana.length ? diasSemana[proximoDiaIdx] : null;

  // ─── Carregamento Inicial do Banco ────────────────────────────────────────
  useEffect(() => {
    carregarDadosDaSemana();
    carregarHistorico();
  }, [metaDiariaBase]);

  const carregarDadosDaSemana = useCallback(async () => {
    setCarregandoMetas(true);
    const estrutura = gerarEstruturaSemana(hoje);
    const dataInicio = estrutura[0].dataISO;
    const dataFim = estrutura[6].dataISO;

    const result = await buscarMetasPorSemana(dataInicio, dataFim);

    let diasComValores = estrutura;
    if (result.success && result.data && result.data.length > 0) {
      const mapaGanhos = new Map<string, number>();
      result.data.forEach(meta => {
        if (meta.data_referencia) {
          mapaGanhos.set(meta.data_referencia, Number(meta.valor_atingido));
        }
      });

      diasComValores = estrutura.map(dia => {
        const val = mapaGanhos.get(dia.dataISO);
        const temReg = val !== undefined && val !== null;
        return {
          ...dia,
          valor: temReg ? val : 0,
          temRegistro: temReg,
        };
      });
    }

    const semanaComAmortizacao = aplicarAmortizacaoSemana(diasComValores, metaDiariaBase);
    setDiasSemana(semanaComAmortizacao);
    setCarregandoMetas(false);
  }, [metaDiariaBase]);

  const carregarHistorico = useCallback(async () => {
    const result = await buscarMetasSupabase();
    if (result.success && result.data) {
      setMetasBanco(result.data);
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setAtualizando(true);
    await Promise.all([carregarDadosDaSemana(), carregarHistorico()]);
    setAtualizando(false);
  }, [carregarDadosDaSemana, carregarHistorico]);

  // ─── Ação: Abrir Inserção Manual para um Dia ──────────────────────────────
  const abrirInsercaoManualParaDia = (idx: number) => {
    setDiaSelecionadoIdx(idx);
    const dia = diasSemana[idx];
    setValorManual(dia.valor > 0 ? dia.valor.toString() : '');
    setDescricaoManual(`Ganho ${dia.diaCompleto}`);
    setModoEdicaoManual(true);
    setAnalisandoOCR(false);
    setOcrConfirmacaoPronta(false);
    setModalVisible(true);
  };

  // ─── Ação: Captura OCR via Imagem ─────────────────────────────────────────
  const handleAbrirCapturaOCR = async () => {
    setModalEscolhaFABAberto(false);
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permissão necessária', 'É preciso permitir acesso às fotos para carregar o print de ganhos.');
        return;
      }

      const pickerResult = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
      });

      if (!pickerResult.canceled && pickerResult.assets && pickerResult.assets.length > 0) {
        const uri = pickerResult.assets[0].uri;

        setModalVisible(true);
        setAnalisandoOCR(true);
        setOcrConfirmacaoPronta(false);
        setModoEdicaoManual(false);

        processarImagemComOCR(uri);
      }
    } catch (error: any) {
      Alert.alert('Erro', 'Falha ao abrir a galeria: ' + (error?.message || 'Tente novamente'));
    }
  };

  const processarImagemComOCR = async (uri: string) => {
    try {
      const resultado = await processarOCRLocal(uri);
      const valorEncontrado = resultado.valorMetaExtrado ?? 0;
      setValorExtraidoOCR(valorEncontrado);
      setValorManual(valorEncontrado > 0 ? valorEncontrado.toFixed(2) : '');

      setTimeout(() => {
        setAnalisandoOCR(false);
        setOcrConfirmacaoPronta(true);
      }, 1000);
    } catch (error) {
      setAnalisandoOCR(false);
      setModoEdicaoManual(true);
    }
  };

  // ─── Salvar Ganho e Aplicar Regra Amortiza em Cascata ─────────────────────
  const handleConfirmarERecalcular = async () => {
    const valorFinal = modoEdicaoManual
      ? parseFloat(valorManual.replace(',', '.')) || 0
      : valorExtraidoOCR;

    if (valorFinal < 0) {
      Alert.alert('Valor inválido', 'Por favor, informe um valor de ganho válido.');
      return;
    }

    setSalvandoNoBanco(true);

    try {
      const diaAtual = diasSemana[diaSelecionadoIdx];
      const dataAlvoISO = diaAtual.dataISO;

      // 1. Atualiza o registro deste dia
      const semanaModificada = diasSemana.map((d, i) =>
        i === diaSelecionadoIdx ? { ...d, valor: valorFinal, temRegistro: true } : d
      );

      // 2. Aplica a amortização em cadeia em toda a semana
      const semanaRecalculada = aplicarAmortizacaoSemana(semanaModificada, metaDiariaBase);
      setDiasSemana(semanaRecalculada);

      const diaAtualizado = semanaRecalculada[diaSelecionadoIdx];

      // 3. Salva no Supabase
      await salvarMetaSupabase({
        descricao: modoEdicaoManual
          ? (descricaoManual || `Ganho manual - ${diaAtualizado.dataExibicao}`)
          : `Ganho OCR - ${diaAtualizado.dataExibicao}`,
        valor_meta: diaAtualizado.metaDoDia,
        valor_atingido: valorFinal,
        percentual: diaAtualizado.percentual,
        data_referencia: dataAlvoISO,
      });

      setModalVisible(false);
      carregarHistorico();

      // Feedback contextual sobre o impacto no próximo dia
      const proximo = diaSelecionadoIdx + 1 < semanaRecalculada.length ? semanaRecalculada[diaSelecionadoIdx + 1] : null;
      let mensagemEfeito = `Ganho de R$ ${valorFinal.toFixed(2)} registrado para ${diaAtualizado.sigla}.`;
      if (proximo) {
        mensagemEfeito += `\n\n⚡ Meta de ${proximo.sigla} recalculada para R$ ${proximo.metaDoDia.toFixed(2)}.`;
      }

      Alert.alert('✅ Meta Atualizada!', mensagemEfeito);
    } catch (err: any) {
      Alert.alert('Erro ao Salvar', err?.message || 'Falha ao persistir no Supabase');
    } finally {
      setSalvandoNoBanco(false);
    }
  };

  // ─── Salvar Nova Meta Base (Problema 1 Resolvido) ─────────────────────────
  const handleSalvarNovaMetaBase = () => {
    const novaBase = parseFloat(novaMetaBaseInput.replace(',', '.'));
    if (isNaN(novaBase) || novaBase <= 0) {
      Alert.alert('Valor Inválido', 'A meta diária precisa ser maior que zero.');
      return;
    }
    setMetaDiariaBase(novaBase);

    // Recalcula a semana inteira com a nova meta base
    const semanaAtualizada = aplicarAmortizacaoSemana(diasSemana, novaBase);
    setDiasSemana(semanaAtualizada);
    setModalMetaBaseAberto(false);

    Alert.alert('Meta Base Atualizada!', `Sua meta diária base agora é de R$ ${novaBase.toFixed(2)}.`);
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />

        {/* HEADER MINIMALISTA */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => setMenuDrawerAberto(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.headerIconText}>☰</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.periodDropdown}
            onPress={() => Alert.alert('Período Ativo', `Semana de ${periodo}.\nTodas as metas recalculam em tempo real.`)}
            activeOpacity={0.8}
          >
            <Text style={styles.periodDropdownText}>{periodo} ▾</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.iconButton} onPress={onRefresh} activeOpacity={0.7}>
            <Text style={styles.headerIconText}>↻</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={atualizando}
              onRefresh={onRefresh}
              tintColor="#00D26A"
              colors={['#00D26A']}
            />
          }
        >
          {/* VALOR TOTAL DA SEMANA */}
          <View style={styles.mainEarningsCard}>
            {carregandoMetas ? (
              <ActivityIndicator size="large" color="#00D26A" style={{ marginVertical: 20 }} />
            ) : (
              <>
                <View style={styles.earningsHeaderRow}>
                  <Text style={styles.earningsLabel}>Ganho Total da Semana</Text>
                  <TouchableOpacity
                    style={styles.gearButton}
                    onPress={() => {
                      setNovaMetaBaseInput(metaDiariaBase.toString());
                      setModalMetaBaseAberto(true);
                    }}
                  >
                    <Text style={styles.gearButtonText}>⚙️</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.totalAmountText}>
                  {totalSemana > 0
                    ? `R$ ${totalSemana.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : 'R$ 0,00'}
                </Text>

                {/* SUB-DESTAQUE: DIA SELECIONADO & BOTÃO EDITAR */}
                <View style={styles.selectedDayRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.selectedDayLabel}>{diaSelecionado.diaCompleto}:</Text>
                    <Text style={styles.selectedDayValue}>
                      {diaSelecionado.valor > 0
                        ? `R$ ${diaSelecionado.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : 'Sem ganho registrado'}
                    </Text>
                    <Text style={styles.selectedDayMetaInfo}>
                      Meta deste dia: R$ {diaSelecionado.metaDoDia.toFixed(2)} ({diaSelecionado.percentual}%)
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={styles.btnEditarGanho}
                    onPress={() => abrirInsercaoManualParaDia(diaSelecionadoIdx)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.btnEditarGanhoTexto}>
                      {diaSelecionado.valor > 0 ? '✏️ Editar' : '+ Inserir'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>

          {/* GRÁFICO DE BARRAS (7 DIAS COM METAS DINÂMICAS) */}
          <View style={styles.chartContainer}>
            <View style={styles.barsRow}>
              {diasSemana.map((item, index) => {
                const alturaBarra = (item.valor / maxValorSemana) * 110;
                const isSelected = index === diaSelecionadoIdx;
                const isFuturo = item.data > hoje && !item.isHoje;

                return (
                  <TouchableOpacity
                    key={index}
                    style={styles.barColumn}
                    onPress={() => setDiaSelecionadoIdx(index)}
                    activeOpacity={0.7}
                  >
                    {item.valor > 0 && (
                      <Text style={[styles.barTopValue, isSelected && { color: '#00D26A' }]}>
                        R$ {Math.round(item.valor)}
                      </Text>
                    )}

                    <View style={styles.barTrack}>
                      {item.valor > 0 ? (
                        <View
                          style={[
                            styles.barFill,
                            { height: Math.max(alturaBarra, 12) },
                            isSelected ? styles.barFillActive : styles.barFillInactive,
                          ]}
                        />
                      ) : (
                        <View
                          style={[
                            styles.barFillEmpty,
                            isFuturo ? styles.barFillFuturo : styles.barFillSemDados,
                            { height: 8 },
                          ]}
                        />
                      )}
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

                    {item.isHoje && <View style={styles.hojeIndicator} />}
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.chartLegend}>
              Toque em qualquer dia para ver a meta recalculada daquele dia
            </Text>
          </View>

          {/* DIVISOR */}
          <View style={styles.horizontalDivider} />

          {/* CARD DE AMORTIZAÇÃO (REGRA DE NEGÓCIO EXCLUSIVA) */}
          <View style={styles.amortizacaoCard}>
            <View style={styles.amortizacaoHeader}>
              <Text style={styles.amortizacaoTitle}>⚡ Regra Amortiza</Text>
              <TouchableOpacity
                onPress={() => {
                  setNovaMetaBaseInput(metaDiariaBase.toString());
                  setModalMetaBaseAberto(true);
                }}
              >
                <Text style={styles.amortizacaoBadge}>Base: R$ {metaDiariaBase.toFixed(0)} ⚙️</Text>
              </TouchableOpacity>
            </View>

            {/* Meta do Dia Selecionado */}
            <View style={{ marginVertical: 8 }}>
              <Text style={styles.amortizacaoSubHeader}>
                Meta para {diaSelecionado.diaCompleto}:
              </Text>
              <Text style={styles.amortizacaoAmount}>
                R$ {diaSelecionado.metaDoDia.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
            </View>

            {/* Barra de Progresso do Dia Selecionado */}
            <View style={styles.progressContainer}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${Math.min(100, diaSelecionado.percentual)}%` }]} />
              </View>
              <Text style={styles.progressText}>
                {diaSelecionado.percentual}% da meta do dia atingida (R$ {diaSelecionado.valor.toFixed(2)} de R$ {diaSelecionado.metaDoDia.toFixed(2)})
              </Text>
            </View>

            {/* Impacto no Próximo Dia (Amortização / Acúmulo) */}
            <View style={styles.impactoContainer}>
              {proximoDia ? (
                <>
                  <Text style={styles.impactoTitulo}>
                    👉 Efeito em {proximoDia.sigla} ({proximoDia.dataExibicao}):
                  </Text>
                  <Text style={styles.impactoValor}>
                    Meta recalculada: <Text style={{ color: '#00D26A', fontWeight: 'bold' }}>R$ {proximoDia.metaDoDia.toFixed(2)}</Text>
                  </Text>
                  <Text style={styles.impactoExplicacao}>
                    {diaSelecionado.valor >= diaSelecionado.metaDoDia
                      ? `🎉 Superávit de +R$ ${(diaSelecionado.valor - diaSelecionado.metaDoDia).toFixed(2)} amortizado para o dia seguinte!`
                      : `⚠️ Déficit de R$ ${(diaSelecionado.metaDoDia - diaSelecionado.valor).toFixed(2)} acumulou para a meta de ${proximoDia.sigla}.`}
                  </Text>
                </>
              ) : (
                <Text style={styles.impactoExplicacao}>
                  Último dia da semana! Todo superávit fecha o ciclo semanal.
                </Text>
              )}
            </View>
          </View>

          {/* HISTÓRICO SUPABASE */}
          <View style={styles.bancoSection}>
            <Text style={styles.sectionHeaderTitle}>Histórico de Amortizações</Text>

            {metasBanco.length === 0 ? (
              <Text style={styles.emptyText}>Nenhuma meta registrada ainda no banco.</Text>
            ) : (
              metasBanco.map((item) => (
                <View key={item.id} style={styles.metaRowCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.metaRowDesc}>{item.descricao}</Text>
                    <Text style={styles.metaRowSub}>
                      Ganho: R$ {Number(item.valor_atingido).toFixed(2)} | Meta: R$ {Number(item.valor_meta).toFixed(2)}
                    </Text>
                    {item.data_referencia && (
                      <Text style={styles.metaRowData}>
                        📅 {new Date(item.data_referencia + 'T12:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </Text>
                    )}
                  </View>
                  <View style={styles.percentBadge}>
                    <Text style={styles.metaRowPercent}>{item.percentual}%</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        </ScrollView>

        {/* BOTÃO FLUTUANTE (FAB) COM ESCOLHA */}
        <TouchableOpacity
          style={styles.fabButton}
          onPress={() => setModalEscolhaFABAberto(true)}
          activeOpacity={0.85}
        >
          <Text style={styles.fabIcon}>+</Text>
        </TouchableOpacity>

        {/* MODAL 1: MENU SANDUÍCHE (DRAWER LATERAL) */}
        <Modal
          visible={menuDrawerAberto}
          animationType="fade"
          transparent
          onRequestClose={() => setMenuDrawerAberto(false)}
        >
          <View style={styles.drawerOverlay}>
            <View style={styles.drawerContainer}>
              <View style={styles.drawerHeader}>
                <Text style={styles.drawerTitle}>Amortiza</Text>
                <TouchableOpacity onPress={() => setMenuDrawerAberto(false)}>
                  <Text style={styles.drawerCloseText}>✕</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.drawerSubtitle}>Gestão de Ganhos & Amortização</Text>

              <TouchableOpacity
                style={styles.drawerItem}
                onPress={() => {
                  setMenuDrawerAberto(false);
                  setNovaMetaBaseInput(metaDiariaBase.toString());
                  setModalMetaBaseAberto(true);
                }}
              >
                <Text style={styles.drawerItemText}>🎯 Configurar Meta Base</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.drawerItem}
                onPress={() => {
                  setMenuDrawerAberto(false);
                  onRefresh();
                }}
              >
                <Text style={styles.drawerItemText}>🔄 Sincronizar Supabase</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.drawerItem}
                onPress={() => {
                  setMenuDrawerAberto(false);
                  Alert.alert(
                    'Regra Amortiza',
                    'Se você não bater a meta hoje, a diferença é adicionada na meta de amanhã.\nSe você fizer a mais, o excedente é amortizado e a meta de amanhã diminui!'
                  );
                }}
              >
                <Text style={styles.drawerItemText}>ℹ️ Como Funciona a Amortização</Text>
              </TouchableOpacity>

              <View style={styles.drawerFooter}>
                <Text style={styles.drawerFooterText}>Amortiza v1.0.0 • On-Device</Text>
              </View>
            </View>
          </View>
        </Modal>

        {/* MODAL 2: CONFIGURAR META BASE (LAYOUT CORRIGIDO - PROBLEMA 1) */}
        <Modal
          visible={modalMetaBaseAberto}
          animationType="fade"
          transparent
          onRequestClose={() => setModalMetaBaseAberto(false)}
        >
          <View style={styles.modalOverlayCentral}>
            <View style={styles.cardModalCentral}>
              <Text style={styles.modalTitleText}>Meta Base Diária</Text>
              <Text style={styles.modalSubText}>Qual é o seu objetivo padrão de ganho por dia?</Text>

              <Text style={styles.inputLabel}>Valor Base (R$)</Text>
              <TextInput
                style={styles.modalInput}
                keyboardType="numeric"
                value={novaMetaBaseInput}
                onChangeText={setNovaMetaBaseInput}
                placeholder="Ex: 200.00"
                placeholderTextColor="#64748B"
                autoFocus
              />

              {/* Botões com flex: 1 garantindo que ambos apareçam lado a lado */}
              <View style={styles.modalButtonsRow}>
                <TouchableOpacity
                  style={styles.btnModalCancelar}
                  onPress={() => setModalMetaBaseAberto(false)}
                >
                  <Text style={styles.secondaryActionText}>Cancelar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.btnModalConfirmar}
                  onPress={handleSalvarNovaMetaBase}
                >
                  <Text style={styles.primaryActionText}>Salvar Meta</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* MODAL 3: ESCOLHA AO CLICAR NO FAB (+) */}
        <Modal
          visible={modalEscolhaFABAberto}
          animationType="fade"
          transparent
          onRequestClose={() => setModalEscolhaFABAberto(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.bottomSheetContainer}>
              <View style={styles.bottomSheetHandle} />
              <Text style={styles.modalTitleText}>Adicionar Ganho</Text>
              <Text style={styles.modalSubText}>Escolha como deseja registrar seu ganho</Text>

              <TouchableOpacity
                style={styles.primaryActionButton}
                onPress={handleAbrirCapturaOCR}
              >
                <Text style={styles.primaryActionText}>📷 Escanear Print com OCR</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryActionButton}
                onPress={() => {
                  setModalEscolhaFABAberto(false);
                  abrirInsercaoManualParaDia(diaSelecionadoIdx);
                }}
              >
                <Text style={styles.secondaryActionText}>✍️ Digitar Ganho Manualmente</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.secondaryActionButton, { marginTop: 8, borderColor: 'transparent' }]}
                onPress={() => setModalEscolhaFABAberto(false)}
              >
                <Text style={[styles.secondaryActionText, { color: '#64748B' }]}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* MODAL 4: INSERÇÃO MANUAL / CONFIRMAÇÃO OCR */}
        <Modal
          animationType="slide"
          transparent={true}
          visible={modalVisible}
          onRequestClose={() => setModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.bottomSheetContainer}>
              <View style={styles.bottomSheetHandle} />

              {/* ESTADO 1: ANALISANDO OCR */}
              {analisandoOCR && (
                <View style={styles.modalContentState}>
                  <ActivityIndicator size="large" color="#00D26A" style={{ marginBottom: 16 }} />
                  <Text style={styles.modalTitleText}>Analisando captura de tela...</Text>
                  <Text style={styles.modalSubText}>Extraindo valores via Google ML Kit On-Device</Text>
                </View>
              )}

              {/* ESTADO 2: CONFIRMAÇÃO OCR */}
              {!analisandoOCR && ocrConfirmacaoPronta && !modoEdicaoManual && (
                <View style={styles.modalContentState}>
                  <View style={styles.badgeSuccess}>
                    <Text style={styles.badgeSuccessText}>✓ OCR Concluído</Text>
                  </View>

                  <Text style={styles.modalConfirmTitle}>
                    Encontramos o valor de{' '}
                    <Text style={styles.highlightText}>
                      R$ {valorExtraidoOCR.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                    {' '}para {diaSelecionado.diaCompleto}. Confirmar?
                  </Text>

                  <TouchableOpacity
                    style={styles.primaryActionButton}
                    onPress={handleConfirmarERecalcular}
                    disabled={salvandoNoBanco}
                  >
                    {salvandoNoBanco ? (
                      <ActivityIndicator color="#0A0F1D" />
                    ) : (
                      <Text style={styles.primaryActionText}>Confirmar e Recalcular Meta</Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.secondaryActionButton}
                    onPress={() => setModoEdicaoManual(true)}
                  >
                    <Text style={styles.secondaryActionText}>Corrigir Manualmente</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* ESTADO 3: INSERÇÃO MANUAL */}
              {!analisandoOCR && (modoEdicaoManual || (!ocrConfirmacaoPronta && !analisandoOCR)) && (
                <View style={styles.modalContentState}>
                  <Text style={styles.modalTitleText}>Registrar Ganho</Text>
                  <Text style={styles.modalSubText}>
                    Data: <Text style={{ color: '#00D26A', fontWeight: 'bold' }}>{diaSelecionado.diaCompleto}</Text>
                  </Text>

                  <Text style={styles.inputLabel}>Valor do Ganho (R$)</Text>
                  <TextInput
                    style={styles.modalInput}
                    keyboardType="numeric"
                    value={valorManual}
                    onChangeText={setValorManual}
                    placeholder="Ex: 250.00"
                    placeholderTextColor="#64748B"
                    autoFocus
                  />

                  <Text style={styles.inputLabel}>Descrição (opcional)</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={descricaoManual}
                    onChangeText={setDescricaoManual}
                    placeholder={`Ganho de ${diaSelecionado.dataExibicao}`}
                    placeholderTextColor="#64748B"
                  />

                  <TouchableOpacity
                    style={styles.primaryActionButton}
                    onPress={handleConfirmarERecalcular}
                    disabled={salvandoNoBanco}
                  >
                    {salvandoNoBanco ? (
                      <ActivityIndicator color="#0A0F1D" />
                    ) : (
                      <Text style={styles.primaryActionText}>Salvar e Recalcular Amortização</Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.secondaryActionButton}
                    onPress={() => setModalVisible(false)}
                  >
                    <Text style={styles.secondaryActionText}>Cancelar</Text>
                  </TouchableOpacity>
                </View>
              )}

            </View>
          </View>
        </Modal>

      </SafeAreaView>
    </SafeAreaProvider>
  );
}

// ─── DESIGN SYSTEM MINIMALISTA FINTECH/UBER ───────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0F1D',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 110,
  },

  // HEADER
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconText: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: 'bold',
  },
  periodDropdown: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    maxWidth: '65%',
  },
  periodDropdownText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },

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
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  gearButton: {
    padding: 6,
    backgroundColor: '#1E293B',
    borderRadius: 14,
  },
  gearButtonText: {
    fontSize: 14,
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
    borderColor: '#1E293B',
  },
  selectedDayLabel: {
    color: '#64748B',
    fontSize: 12,
    marginBottom: 2,
  },
  selectedDayValue: {
    color: '#00D26A',
    fontSize: 16,
    fontWeight: '700',
  },
  selectedDayMetaInfo: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  btnEditarGanho: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#00D26A',
  },
  btnEditarGanhoTexto: {
    color: '#00D26A',
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
    borderColor: '#1E293B',
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
    color: '#94A3B8',
    fontSize: 9,
    fontWeight: '700',
    marginBottom: 4,
  },
  barTrack: {
    width: 22,
    height: 110,
    backgroundColor: '#1E293B',
    borderRadius: 11,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    borderRadius: 11,
  },
  barFillActive: {
    backgroundColor: '#00D26A',
  },
  barFillInactive: {
    backgroundColor: '#2D4A6B',
  },
  barFillEmpty: {
    width: '100%',
    borderRadius: 11,
    alignSelf: 'center',
  },
  barFillSemDados: {
    backgroundColor: '#1E293B',
  },
  barFillFuturo: {
    backgroundColor: 'transparent',
  },
  dayLabel: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 8,
    fontWeight: '600',
  },
  dayLabelActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  dayLabelHoje: {
    color: '#00D26A',
  },
  hojeIndicator: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#00D26A',
    marginTop: 3,
  },
  chartLegend: {
    color: '#64748B',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 12,
    fontStyle: 'italic',
  },

  // DIVISOR
  horizontalDivider: {
    height: 1,
    backgroundColor: '#1E293B',
    marginVertical: 18,
  },

  // CARD DE AMORTIZAÇÃO
  amortizacaoCard: {
    backgroundColor: '#131C2E',
    borderRadius: 16,
    padding: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#00D26A',
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  amortizacaoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  amortizacaoTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
  },
  amortizacaoBadge: {
    backgroundColor: 'rgba(0, 210, 106, 0.15)',
    color: '#00D26A',
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  amortizacaoSubHeader: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 8,
  },
  amortizacaoAmount: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '800',
    marginVertical: 4,
  },
  progressContainer: {
    marginTop: 4,
  },
  progressTrack: {
    height: 8,
    backgroundColor: '#1E293B',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#00D26A',
    borderRadius: 4,
  },
  progressText: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 6,
    fontWeight: '500',
  },
  impactoContainer: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  impactoTitulo: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  impactoValor: {
    color: '#94A3B8',
    fontSize: 13,
    marginBottom: 4,
  },
  impactoExplicacao: {
    color: '#64748B',
    fontSize: 12,
    lineHeight: 18,
  },

  // HISTÓRICO
  bancoSection: {
    marginTop: 24,
  },
  sectionHeaderTitle: {
    color: '#F1F5F9',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  emptyText: {
    color: '#64748B',
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'center',
    marginVertical: 12,
  },
  metaRowCard: {
    backgroundColor: '#131C2E',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  metaRowDesc: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '600',
  },
  metaRowSub: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2,
  },
  metaRowData: {
    color: '#475569',
    fontSize: 11,
    marginTop: 3,
  },
  percentBadge: {
    backgroundColor: 'rgba(0, 210, 106, 0.1)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginLeft: 10,
  },
  metaRowPercent: {
    color: '#00D26A',
    fontSize: 15,
    fontWeight: '800',
  },

  // FAB
  fabButton: {
    position: 'absolute',
    bottom: 28,
    right: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#00D26A',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#00D26A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  fabIcon: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#0A0F1D',
    marginTop: -2,
  },

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
    borderRightColor: '#1E293B',
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
    color: '#64748B',
    fontSize: 13,
    marginBottom: 28,
  },
  drawerCloseText: {
    color: '#94A3B8',
    fontSize: 22,
    padding: 6,
  },
  drawerItem: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  drawerItemText: {
    color: '#F8FAFC',
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

  // BOTTOM SHEET & MODAIS
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  modalOverlayCentral: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  cardModalCentral: {
    width: '100%',
    backgroundColor: '#131C2E',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  bottomSheetContainer: {
    backgroundColor: '#131C2E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  bottomSheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#334155',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalContentState: {
    alignItems: 'center',
    width: '100%',
  },
  modalTitleText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
  modalSubText: {
    color: '#94A3B8',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 16,
  },
  badgeSuccess: {
    backgroundColor: 'rgba(0, 210, 106, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    marginBottom: 14,
  },
  badgeSuccessText: {
    color: '#00D26A',
    fontSize: 13,
    fontWeight: '700',
  },
  modalConfirmTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  highlightText: {
    color: '#00D26A',
    fontWeight: '800',
  },
  primaryActionButton: {
    backgroundColor: '#00D26A',
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  primaryActionText: {
    color: '#0A0F1D',
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryActionButton: {
    backgroundColor: 'transparent',
    width: '100%',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  secondaryActionText: {
    color: '#94A3B8',
    fontSize: 15,
    fontWeight: '600',
  },
  inputLabel: {
    color: '#94A3B8',
    fontSize: 13,
    alignSelf: 'flex-start',
    marginTop: 10,
    marginBottom: 6,
    fontWeight: '500',
  },
  modalInput: {
    backgroundColor: '#0A0F1D',
    width: '100%',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#FFFFFF',
    fontSize: 18,
    marginBottom: 16,
  },
  modalButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    width: '100%',
  },
  btnModalCancelar: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  btnModalConfirmar: {
    flex: 1,
    backgroundColor: '#00D26A',
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
  },
});
