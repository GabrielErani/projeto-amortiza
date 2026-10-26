// Aplicativo Amortiza - Regra de Amortização por Fases da Semana e OCR On-Device
// Documentação React Native: https://reactnative.dev/docs/getting-started
// Documentação Safe Area Context: https://github.com/AppAndFlow/react-native-safe-area-context

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
import { buscarMetasPorSemana, buscarMetasSupabase } from './src/services/supabase';
import {
  salvarGanhoLocalmente,
  carregarGanhosLocais,
  salvarMetaBaseLocal,
  carregarMetaBaseLocal,
} from './src/services/storage';
import { MetaNumerica, GanhoDia } from './src/types';

const { width } = Dimensions.get('window');

const META_DIARIA_PADRAO = 100.00;

// ─── UTILITÁRIOS DE DATA AUTOMÁTICA DO CELULAR ────────────────────────────────
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
      valorCoberto: 0,
      metaBase: META_DIARIA_PADRAO,
      percentual: 0,
      statusAmortizacao: 'pendente',
      detalheAmortizacao: '0%',
      isHoje: dataISO === hojeISO,
      temRegistro: false,
    };
  });
}

function formatarPeriodo(dias: GanhoDia[]): string {
  if (dias.length === 0) return '';
  return `${dias[0].dataExibicao} – ${dias[6].dataExibicao}`;
}

// ─── VERDADEIRA REGRA DE AMORTIZAÇÃO POR FASES / CASCATA ──────────────────────
/**
 * Exemplo real:
 * Meta diária = 100.
 * Lançamento de 250 na Segunda:
 * - Segunda = 100% coberta (100) -> sobram 150
 * - Terça   = 100% coberta (100 amortizados por Segunda) -> sobram 50
 * - Quarta  = 50% coberta (50 amortizados por Segunda) -> sobram 0
 * - Quinta em diante = 0%
 */
function calcularAmortizacaoPorFases(dias: GanhoDia[], metaBase: number): GanhoDia[] {
  let saldoCascata = 0;
  let diaOrigemExcedente = '';

  return dias.map((dia) => {
    const ganhoProprio = dia.valor || 0;
    const totalDisponivel = ganhoProprio + saldoCascata;

    let valorCoberto = 0;
    let status: 'atingida' | 'parcial' | 'pendente' | 'adiantada' = 'pendente';
    let detalhe = '';

    if (totalDisponivel >= metaBase) {
      valorCoberto = metaBase;
      const novoExcedente = totalDisponivel - metaBase;

      if (ganhoProprio >= metaBase) {
        status = 'atingida';
        detalhe = '100% ✓';
        if (novoExcedente > 0) {
          diaOrigemExcedente = dia.sigla;
        }
      } else {
        status = 'adiantada';
        detalhe = `100% ✓ (Amortizado por ${diaOrigemExcedente})`;
      }

      saldoCascata = novoExcedente;
    } else if (totalDisponivel > 0) {
      valorCoberto = totalDisponivel;
      const faltam = metaBase - totalDisponivel;
      status = 'parcial';
      if (ganhoProprio > 0 && saldoCascata === 0) {
        detalhe = `${Math.round((valorCoberto / metaBase) * 100)}% (Faltam R$ ${faltam.toFixed(0)})`;
      } else {
        detalhe = `${Math.round((valorCoberto / metaBase) * 100)}% (Amortizado por ${diaOrigemExcedente})`;
      }
      saldoCascata = 0;
    } else {
      valorCoberto = 0;
      status = 'pendente';
      detalhe = '0%';
      saldoCascata = 0;
    }

    const percentual = metaBase > 0 ? Math.min(100, Math.round((valorCoberto / metaBase) * 100)) : 0;

    return {
      ...dia,
      metaBase,
      valorCoberto,
      percentual,
      statusAmortizacao: status,
      detalheAmortizacao: detalhe,
    };
  });
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────

export default function App() {
  const hoje = new Date();

  // Meta Base Diária (salva no celular)
  const [metaDiariaBase, setMetaDiariaBase] = useState<number>(META_DIARIA_PADRAO);

  // Semana completa com cálculos em cascata
  const [diasSemana, setDiasSemana] = useState<GanhoDia[]>(() => {
    const estrutura = gerarEstruturaSemana(hoje);
    return calcularAmortizacaoPorFases(estrutura, META_DIARIA_PADRAO);
  });

  const [diaSelecionadoIdx, setDiaSelecionadoIdx] = useState<number>(() => {
    const estrutura = gerarEstruturaSemana(hoje);
    const idx = estrutura.findIndex(d => d.isHoje);
    return idx >= 0 ? idx : 0;
  });

  // Modais de Navegação e Menu
  const [menuDrawerAberto, setMenuDrawerAberto] = useState<boolean>(false);
  const [modalMetaBaseAberto, setModalMetaBaseAberto] = useState<boolean>(false);
  const [novaMetaBaseInput, setNovaMetaBaseInput] = useState<string>('100');
  const [modalEscolhaFABAberto, setModalEscolhaFABAberto] = useState<boolean>(false);

  // Modal de Lançamento
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [diaLancamentoIdx, setDiaLancamentoIdx] = useState<number>(0);
  const [valorDigitado, setValorDigitado] = useState<string>('');
  const [salvando, setSalvando] = useState<boolean>(false);

  // OCR
  const [analisandoOCR, setAnalisandoOCR] = useState<boolean>(false);
  const [ocrConfirmacaoPronta, setOcrConfirmacaoPronta] = useState<boolean>(false);
  const [valorExtraidoOCR, setValorExtraidoOCR] = useState<number>(0);

  // Histórico
  const [metasBanco, setMetasBanco] = useState<MetaNumerica[]>([]);
  const [atualizando, setAtualizando] = useState<boolean>(false);

  // Computados
  const diaSelecionado = diasSemana[diaSelecionadoIdx] || diasSemana[0];
  const diaLancamento = diasSemana[diaLancamentoIdx] || diasSemana[0];
  const totalSemana = diasSemana.reduce((acc, d) => acc + d.valor, 0);
  const totalCobertoSemana = diasSemana.reduce((acc, d) => acc + d.valorCoberto, 0);
  const periodo = formatarPeriodo(diasSemana);
  const metaTotalSemana = metaDiariaBase * 7;
  const diasAmortizadosCompletos = diasSemana.filter(d => d.percentual === 100).length;

  // Valor atual que o dia já possui registrado
  const valorJaExistente = diaLancamento.valor || 0;
  const valorNovoNumerico = parseFloat(valorDigitado.replace(',', '.')) || 0;
  const valorSomadoPreview = valorJaExistente + valorNovoNumerico;

  // ─── CARREGAMENTO INICIAL: LOCAL STORAGE (OFFLINE-FIRST) + SUPABASE ──────────
  useEffect(() => {
    inicializarDados();
  }, []);

  const inicializarDados = async () => {
    const baseSalva = await carregarMetaBaseLocal(META_DIARIA_PADRAO);
    setMetaDiariaBase(baseSalva);
    setNovaMetaBaseInput(baseSalva.toString());
    await recarregarGanhosCombinados(baseSalva);
  };

  const recarregarGanhosCombinados = async (baseMeta: number) => {
    const estrutura = gerarEstruturaSemana(hoje);
    const ganhosLocais = await carregarGanhosLocais();

    let diasAtualizados = estrutura.map(dia => {
      const reg = ganhosLocais[dia.dataISO];
      if (reg) {
        return {
          ...dia,
          valor: reg.valor,
          temRegistro: true,
        };
      }
      return dia;
    });

    try {
      const res = await buscarMetasPorSemana(estrutura[0].dataISO, estrutura[6].dataISO);
      if (res.success && res.data && res.data.length > 0) {
        const mapaSupabase = new Map<string, number>();
        res.data.forEach(m => {
          if (m.data_referencia) mapaSupabase.set(m.data_referencia, Number(m.valor_atingido));
        });

        diasAtualizados = diasAtualizados.map(dia => {
          if (!dia.temRegistro && mapaSupabase.has(dia.dataISO)) {
            const val = mapaSupabase.get(dia.dataISO)!;
            return { ...dia, valor: val, temRegistro: true };
          }
          return dia;
        });
      }
    } catch {
      // Ignora erro se offline
    }

    const semanaCalculada = calcularAmortizacaoPorFases(diasAtualizados, baseMeta);
    setDiasSemana(semanaCalculada);
    carregarHistorico();
  };

  const carregarHistorico = async () => {
    try {
      const res = await buscarMetasSupabase();
      if (res.success && res.data) {
        setMetasBanco(res.data);
      }
    } catch {
      // Ignora erro de histórico se offline
    }
  };

  const onRefresh = useCallback(async () => {
    setAtualizando(true);
    await recarregarGanhosCombinados(metaDiariaBase);
    setAtualizando(false);
  }, [metaDiariaBase]);

  // ─── ABERTURA DO MODAL DE LANÇAMENTO (SELEÇÃO RÁPIDA DE DIAS) ───────────────
  const abrirModalParaDia = (idx: number) => {
    setDiaLancamentoIdx(idx);
    setValorDigitado('');
    setAnalisandoOCR(false);
    setOcrConfirmacaoPronta(false);
    setModalVisible(true);
  };

  // ─── OCR VIA GALERIA ────────────────────────────────────────────────────────
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

        processarImagemComOCR(uri);
      }
    } catch (error: any) {
      Alert.alert('Erro', 'Falha ao abrir galeria: ' + (error?.message || 'Tente novamente'));
    }
  };

  const processarImagemComOCR = async (uri: string) => {
    try {
      const resultado = await processarOCRLocal(uri);
      const valorEncontrado = resultado.valorMetaExtrado ?? 0;
      setValorExtraidoOCR(valorEncontrado);
      setValorDigitado(valorEncontrado > 0 ? valorEncontrado.toFixed(2) : '');

      setTimeout(() => {
        setAnalisandoOCR(false);
        setOcrConfirmacaoPronta(true);
      }, 1000);
    } catch {
      setAnalisandoOCR(false);
    }
  };

  // ─── SALVAR GANHO: COM OPÇÃO DE SOMAR (ACUMULAR) OU SUBSTITUIR ──────────────
  const handleExecutarSalvar = async (modo: 'somar' | 'substituir') => {
    const valorDigitadoNum = parseFloat(valorDigitado.replace(',', '.')) || 0;

    if (valorDigitadoNum <= 0 && modo === 'somar') {
      Alert.alert('Valor inválido', 'Digite o valor do ganho a adicionar.');
      return;
    }

    const valorFinal = modo === 'somar'
      ? valorJaExistente + valorDigitadoNum
      : valorDigitadoNum;

    setSalvando(true);

    try {
      // 1. Atualiza o dia no array com o valor acumulado
      const semanaModificada = diasSemana.map((d, i) =>
        i === diaLancamentoIdx ? { ...d, valor: valorFinal, temRegistro: true } : d
      );

      // 2. Recalcula a amortização por fases em toda a semana
      const semanaRecalculada = calcularAmortizacaoPorFases(semanaModificada, metaDiariaBase);
      setDiasSemana(semanaRecalculada);
      setDiaSelecionadoIdx(diaLancamentoIdx);

      const diaAtualizado = semanaRecalculada[diaLancamentoIdx];

      // 3. Salva no celular via AsyncStorage (NUNCA SOME)
      await salvarGanhoLocalmente({
        dataISO: diaAtualizado.dataISO,
        valor: valorFinal,
        metaDoDia: diaAtualizado.metaBase,
        percentual: diaAtualizado.percentual,
        descricao: `Ganho ${diaAtualizado.sigla}`,
        atualizadoEm: new Date().toISOString(),
      });

      setModalVisible(false);

      // Feedback explicativo da cascata
      const diasAmortizados = semanaRecalculada
        .filter((d, i) => i > diaLancamentoIdx && d.percentual > 0)
        .map(d => `${d.sigla} (${d.percentual}%)`);

      let msg = `Ganho de ${diaAtualizado.sigla} atualizado para R$ ${valorFinal.toFixed(2)}.`;
      if (diasAmortizados.length > 0) {
        msg += `\n\n⚡ Dias adiantados pelo excedente:\n${diasAmortizados.join(', ')}!`;
      }

      Alert.alert('✅ Ganho Registrado!', msg);
    } catch (err: any) {
      Alert.alert('Erro ao Salvar', err?.message || 'Falha ao registrar ganho.');
    } finally {
      setSalvando(false);
    }
  };

  // ─── SALVAR NOVA META BASE ──────────────────────────────────────────────────
  const handleSalvarNovaMetaBase = async () => {
    const novaBase = parseFloat(novaMetaBaseInput.replace(',', '.'));
    if (isNaN(novaBase) || novaBase <= 0) {
      Alert.alert('Valor Inválido', 'A meta diária precisa ser maior que zero.');
      return;
    }

    setMetaDiariaBase(novaBase);
    await salvarMetaBaseLocal(novaBase);

    const semanaAtualizada = calcularAmortizacaoPorFases(diasSemana, novaBase);
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
            onPress={() => Alert.alert('Período Ativo', `Semana de ${periodo}.\nMeta semanal total: R$ ${metaTotalSemana.toFixed(2)}.`)}
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
              tintColor="#00E676"
              colors={['#00D26A']}
            />
          }
        >
          {/* GANHO TOTAL DA SEMANA */}
          <View style={styles.mainEarningsCard}>
            <View style={styles.earningsHeaderRow}>
              <Text style={styles.earningsLabel}>Ganho Total da Semana</Text>
              <TouchableOpacity
                style={styles.gearButton}
                onPress={() => {
                  setNovaMetaBaseInput(metaDiariaBase.toString());
                  setModalMetaBaseAberto(true);
                }}
              >
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
                onPress={() => abrirModalParaDia(diaSelecionadoIdx)}
                activeOpacity={0.8}
              >
                <Text style={styles.btnEditarGanhoTexto}>
                  {diaSelecionado.valor > 0 ? '+ Adicionar' : '+ Inserir'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* GRÁFICO DE BARRAS DE AMORTIZAÇÃO (7 DIAS COM % COBERTO DE CADA FASE) */}
          <View style={styles.chartContainer}>
            <View style={styles.barsRow}>
              {diasSemana.map((item, index) => {
                const isSelected = index === diaSelecionadoIdx;
                const alturaBarra = Math.max(10, item.percentual);

                // Cor da barra dependendo do status de amortização
                let corBarra = '#334155';
                if (item.statusAmortizacao === 'atingida') corBarra = '#00E676';
                else if (item.statusAmortizacao === 'adiantada') corBarra = '#38BDF8';
                else if (item.statusAmortizacao === 'parcial') corBarra = '#FBBF24';

                return (
                  <TouchableOpacity
                    key={index}
                    style={styles.barColumn}
                    onPress={() => setDiaSelecionadoIdx(index)}
                    activeOpacity={0.7}
                  >
                    {/* Exibe o percentual amortizado no topo de cada dia */}
                    <Text
                      style={[
                        styles.barTopValue,
                        isSelected && { color: '#FFFFFF', fontWeight: 'bold' },
                        item.percentual === 100 && { color: '#00E676' },
                      ]}
                    >
                      {item.percentual > 0 ? `${item.percentual}%` : '0%'}
                    </Text>

                    {/* Trilho da Barra com Preenchimento Dinâmico */}
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

          {/* DIVISOR */}
          <View style={styles.horizontalDivider} />

          {/* CARD DE AMORTIZAÇÃO (PROGRESSO DA SEMANA POR FASES) */}
          <View style={styles.amortizacaoCard}>
            <View style={styles.amortizacaoHeader}>
              <Text style={styles.amortizacaoTitle}>⚡ Regra Amortiza</Text>
              <Text style={styles.amortizacaoBadge}>
                {diasAmortizadosCompletos}/7 Dias Pagos
              </Text>
            </View>

            {/* Destaque da Semana */}
            <View style={{ marginVertical: 8 }}>
              <Text style={styles.amortizacaoSubHeader}>
                Progresso Semanal (Meta: R$ {metaTotalSemana.toFixed(2)}):
              </Text>
              <Text style={styles.amortizacaoAmount}>
                R$ {totalCobertoSemana.toFixed(2)} cobertos
              </Text>
            </View>

            {/* Barra de Progresso Total da Semana */}
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

            {/* Detalhamento do Dia Selecionado */}
            <View style={styles.impactoContainer}>
              <Text style={styles.impactoTitulo}>
                📅 {diaSelecionado.diaCompleto}:
              </Text>
              <Text style={styles.impactoValor}>
                Fez: <Text style={{ color: '#00E676', fontWeight: 'bold' }}>R$ {diaSelecionado.valor.toFixed(2)}</Text> • Meta Base: R$ {metaDiariaBase.toFixed(2)}
              </Text>
              <Text style={styles.impactoExplicacao}>
                Status: <Text style={{ color: '#F8FAFC', fontWeight: 'bold' }}>{diaSelecionado.detalheAmortizacao}</Text>
              </Text>
            </View>
          </View>

          {/* HISTÓRICO SUPABASE */}
          <View style={styles.bancoSection}>
            <Text style={styles.sectionHeaderTitle}>Histórico de Amortizações</Text>

            {metasBanco.length === 0 ? (
              <Text style={styles.emptyText}>Ganhos salvos localmente no seu aparelho.</Text>
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
                <Text style={styles.drawerItemText}>🎯 Configurar Meta Diária</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.drawerItem}
                onPress={() => {
                  setMenuDrawerAberto(false);
                  onRefresh();
                }}
              >
                <Text style={styles.drawerItemText}>🔄 Sincronizar Dados</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.drawerItem}
                onPress={() => {
                  setMenuDrawerAberto(false);
                  Alert.alert(
                    'Regra Amortiza',
                    'Quando você faz mais do que a meta do dia, o excedente paga as metas dos dias seguintes!\nExemplo: meta 100, fez 250 -> Segunda (100%), Terça (100%), Quarta (50%).'
                  );
                }}
              >
                <Text style={styles.drawerItemText}>ℹ️ Como Funciona a Regra</Text>
              </TouchableOpacity>

              <View style={styles.drawerFooter}>
                <Text style={styles.drawerFooterText}>Amortiza v1.0.0 • On-Device</Text>
              </View>
            </View>
          </View>
        </Modal>

        {/* MODAL 2: CONFIGURAR META BASE (LAYOUT 100% VISÍVEL) */}
        <Modal
          visible={modalMetaBaseAberto}
          animationType="fade"
          transparent
          onRequestClose={() => setModalMetaBaseAberto(false)}
        >
          <View style={styles.modalOverlayCentral}>
            <View style={styles.cardModalCentral}>
              <Text style={styles.modalTitleText}>Meta Diária Base</Text>
              <Text style={styles.modalSubText}>Qual é o seu objetivo padrão de ganho por dia?</Text>

              <Text style={styles.inputLabel}>Valor Base (R$)</Text>
              <TextInput
                style={styles.modalInput}
                keyboardType="numeric"
                value={novaMetaBaseInput}
                onChangeText={setNovaMetaBaseInput}
                placeholder="Ex: 100.00"
                placeholderTextColor="#64748B"
                autoFocus
              />

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
                  abrirModalParaDia(diaSelecionadoIdx);
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

        {/* MODAL 4: LANÇAMENTO DIRETO (COM OPÇÃO DE SOMAR OU SUBSTITUIR) */}
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
                  <Text style={styles.modalSubText}>Extraindo valores via OCR On-Device</Text>
                </View>
              )}

              {/* ESTADO 2: CONFIRMAÇÃO OCR */}
              {!analisandoOCR && ocrConfirmacaoPronta && (
                <View style={styles.modalContentState}>
                  <View style={styles.badgeSuccess}>
                    <Text style={styles.badgeSuccessText}>✓ OCR Concluído</Text>
                  </View>

                  <Text style={styles.modalConfirmTitle}>
                    Encontramos o valor de{' '}
                    <Text style={styles.highlightText}>
                      R$ {valorExtraidoOCR.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                    {' '}para {diaLancamento.diaCompleto}. Como deseja salvar?
                  </Text>

                  {valorJaExistente > 0 && (
                    <TouchableOpacity
                      style={styles.primaryActionButton}
                      onPress={() => handleExecutarSalvar('somar')}
                      disabled={salvando}
                    >
                      {salvando ? (
                        <ActivityIndicator color="#0A0F1D" />
                      ) : (
                        <Text style={styles.primaryActionText}>
                          + Somar aos R$ {valorJaExistente.toFixed(2)} (Total: R$ {(valorJaExistente + valorExtraidoOCR).toFixed(2)})
                        </Text>
                      )}
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={valorJaExistente > 0 ? styles.secondaryActionButton : styles.primaryActionButton}
                    onPress={() => handleExecutarSalvar('substituir')}
                    disabled={salvando}
                  >
                    <Text style={valorJaExistente > 0 ? styles.secondaryActionText : styles.primaryActionText}>
                      {valorJaExistente > 0 ? `Substituir por R$ ${valorExtraidoOCR.toFixed(2)}` : 'Confirmar e Salvar'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.secondaryActionButton, { marginTop: 8 }]}
                    onPress={() => setOcrConfirmacaoPronta(false)}
                  >
                    <Text style={styles.secondaryActionText}>Digitar Manualmente</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* ESTADO 3: INSERÇÃO MANUAL COM SELETOR DE DIA E SOMA INTELIGENTE */}
              {!analisandoOCR && !ocrConfirmacaoPronta && (
                <View style={styles.modalContentState}>
                  <Text style={styles.modalTitleText}>Lançar Ganho</Text>
                  <Text style={styles.modalSubText}>
                    Selecione o dia e informe o valor:
                  </Text>

                  {/* SELETOR DE DIAS DA SEMANA */}
                  <View style={styles.diaSelectorRow}>
                    {diasSemana.map((d, idx) => {
                      const ativo = idx === diaLancamentoIdx;
                      return (
                        <TouchableOpacity
                          key={idx}
                          style={[styles.diaPill, ativo && styles.diaPillAtivo]}
                          onPress={() => {
                            setDiaLancamentoIdx(idx);
                            setValorDigitado('');
                          }}
                        >
                          <Text style={[styles.diaPillTexto, ativo && styles.diaPillTextoAtivo]}>
                            {d.sigla}
                          </Text>
                          {d.isHoje && <View style={styles.diaPillDot} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <Text style={styles.diaSelecionadoTextoModal}>
                    📅 {diaLancamento.diaCompleto}
                    {diaLancamento.isHoje ? ' (Hoje)' : ''}
                  </Text>

                  {/* Mostra o ganho que já existe para o usuário saber que vai somar */}
                  {valorJaExistente > 0 && (
                    <View style={styles.avisoAcumuloContainer}>
                      <Text style={styles.avisoAcumuloTexto}>
                        💡 Já registrado hoje: <Text style={{ color: '#00E676', fontWeight: 'bold' }}>R$ {valorJaExistente.toFixed(2)}</Text>
                      </Text>
                    </View>
                  )}

                  {/* CAMPO DE VALOR */}
                  <Text style={styles.inputLabel}>
                    {valorJaExistente > 0 ? 'Quanto quer adicionar a mais? (R$)' : 'Quanto você fez? (R$)'}
                  </Text>
                  <TextInput
                    style={styles.modalInputGrande}
                    keyboardType="numeric"
                    value={valorDigitado}
                    onChangeText={setValorDigitado}
                    placeholder="0.00"
                    placeholderTextColor="#64748B"
                    autoFocus
                  />

                  {/* ATALHOS RÁPIDOS */}
                  <View style={styles.atalhosValorRow}>
                    {[50, 100, 150, 200].map(v => (
                      <TouchableOpacity
                        key={v}
                        style={styles.atalhoBtn}
                        onPress={() => setValorDigitado(v.toString())}
                      >
                        <Text style={styles.atalhoBtnTexto}>+{v}</Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity
                      style={[styles.atalhoBtn, { backgroundColor: '#334155' }]}
                      onPress={() => setValorDigitado('')}
                    >
                      <Text style={[styles.atalhoBtnTexto, { color: '#F8FAFC' }]}>Limpar</Text>
                    </TouchableOpacity>
                  </View>

                  {/* BOTÃO PRINCIPAL: SE JÁ EXISTE VALOR, SOMA! */}
                  {valorJaExistente > 0 && valorNovoNumerico > 0 ? (
                    <>
                      <TouchableOpacity
                        style={styles.primaryActionButton}
                        onPress={() => handleExecutarSalvar('somar')}
                        disabled={salvando}
                      >
                        {salvando ? (
                          <ActivityIndicator color="#0A0F1D" />
                        ) : (
                          <Text style={styles.primaryActionText}>
                            + Somar R$ {valorNovoNumerico.toFixed(2)} (Novo Total: R$ {valorSomadoPreview.toFixed(2)})
                          </Text>
                        )}
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.secondaryActionButton}
                        onPress={() => handleExecutarSalvar('substituir')}
                        disabled={salvando}
                      >
                        <Text style={styles.secondaryActionText}>
                          Substituir por R$ {valorNovoNumerico.toFixed(2)}
                        </Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <TouchableOpacity
                      style={styles.primaryActionButton}
                      onPress={() => handleExecutarSalvar(valorJaExistente > 0 ? 'substituir' : 'somar')}
                      disabled={salvando}
                    >
                      {salvando ? (
                        <ActivityIndicator color="#0A0F1D" />
                      ) : (
                        <Text style={styles.primaryActionText}>Salvar Ganho</Text>
                      )}
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={[styles.secondaryActionButton, { marginTop: 8, borderColor: 'transparent' }]}
                    onPress={() => setModalVisible(false)}
                  >
                    <Text style={[styles.secondaryActionText, { color: '#64748B' }]}>Cancelar</Text>
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
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#1E293B',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  gearButtonText: {
    fontSize: 12,
    color: '#F8FAFC',
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
    color: '#64748B',
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
  barFillSelected: {
    borderWidth: 1,
    borderColor: '#FFFFFF',
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
  dayValorSub: {
    color: '#94A3B8',
    fontSize: 8.5,
    marginTop: 1,
  },
  hojeIndicator: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#00D26A',
    marginTop: 2,
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
    fontSize: 30,
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
    marginBottom: 4,
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

  // SELETOR DE DIAS DA SEMANA
  diaSelectorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 12,
    gap: 6,
  },
  diaPill: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  diaPillAtivo: {
    backgroundColor: '#00E676',
    borderColor: '#00E676',
  },
  diaPillTexto: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
  },
  diaPillTextoAtivo: {
    color: '#0A0F1D',
  },
  diaPillDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#38BDF8',
    marginTop: 2,
  },
  diaSelecionadoTextoModal: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 10,
  },

  // AVISO DE GANHO JÁ EXISTENTE
  avisoAcumuloContainer: {
    backgroundColor: 'rgba(0, 210, 106, 0.1)',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0, 210, 106, 0.25)',
    marginBottom: 12,
  },
  avisoAcumuloTexto: {
    color: '#F8FAFC',
    fontSize: 12,
  },

  // CAMPO GIGANTE DE VALOR
  modalInputGrande: {
    backgroundColor: '#0A0F1D',
    width: '100%',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#00D26A',
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#00D26A',
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 12,
  },

  // ATALHOS RÁPIDOS
  atalhosValorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 20,
    gap: 6,
  },
  atalhoBtn: {
    flex: 1,
    backgroundColor: '#1E293B',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  atalhoBtnTexto: {
    color: '#00D26A',
    fontSize: 12,
    fontWeight: '700',
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
    marginTop: 6,
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
