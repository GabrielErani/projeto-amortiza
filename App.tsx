// Aplicativo Amortiza - Dashboard Operacional Semanal e Carteira Macro
// Documentação React Native: https://reactnative.dev/docs/getting-started
// Documentação Safe Area Context: https://github.com/AppAndFlow/react-native-safe-area-context
// Documentação AsyncStorage: https://react-native-async-storage.github.io/async-storage/

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
  salvarDividaLocal,
  removerDividaLocal,
  carregarDividasLocais,
} from './src/services/storage';
import { MetaNumerica, GanhoDia, DividaItem, SemanaMesInfo } from './src/types';

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
  const diaSemana = d.getDay();
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

// ─── GERADOR DE SEMANAS DO MÊS PARA A CARTEIRA ────────────────────────────────
function gerarSemanasDoMes(hoje: Date, ganhosLocais: Record<string, any>): SemanaMesInfo[] {
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth();
  const primeiroDiaMes = new Date(ano, mes, 1);
  const ultimoDiaMes = new Date(ano, mes + 1, 0);

  const semanas: SemanaMesInfo[] = [];
  let cursor = obterSegundaDaSemana(primeiroDiaMes);
  let numSemana = 1;
  const hojeISO = toISOLocal(hoje);

  while (cursor <= ultimoDiaMes) {
    const fimSemana = new Date(cursor);
    fimSemana.setDate(cursor.getDate() + 6);

    const inicioISO = toISOLocal(cursor);
    const fimISO = toISOLocal(fimSemana);

    let totalSem = 0;
    let isAtual = false;

    for (let i = 0; i < 7; i++) {
      const d = new Date(cursor);
      d.setDate(cursor.getDate() + i);
      const iso = toISOLocal(d);
      if (iso === hojeISO) isAtual = true;
      if (ganhosLocais[iso]) {
        totalSem += Number(ganhosLocais[iso].valor || 0);
      }
    }

    semanas.push({
      numeroSemana: numSemana,
      rotulo: `Sem ${numSemana} (${cursor.getDate()}-${fimSemana.getDate()} ${cursor.toLocaleDateString('pt-BR', { month: 'short' })})`,
      dataInicioISO: inicioISO,
      dataFimISO: fimISO,
      totalGanhos: totalSem,
      isAtual: isAtual,
    });

    cursor.setDate(cursor.getDate() + 7);
    numSemana++;
  }

  return semanas;
}

// ─── VERDADEIRA REGRA DE AMORTIZAÇÃO POR FASES / CASCATA ──────────────────────
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

// ─── CÁLCULO AUTOMÁTICO DE DÍVIDAS MACRO (CARTEIRA) ───────────────────────────
function calcularResumoDividas(dividas: DividaItem[]) {
  let totalDiario = 0;
  let totalMensal = 0;
  let totalImprevistosAnualizado = 0;
  let totalAnualCalculado = 0;

  dividas.forEach((item) => {
    if (item.tipo === 'diaria') {
      totalDiario += item.valor;
      totalAnualCalculado += item.valor * 365;
    } else if (item.tipo === 'mensal') {
      totalMensal += item.valor;
      totalAnualCalculado += item.valor * 12;
    } else if (item.tipo === 'imprevista') {
      if (item.frequenciaImprevisto === 'diaria') {
        totalAnualCalculado += item.valor * 365;
        totalImprevistosAnualizado += item.valor * 365;
      } else if (item.frequenciaImprevisto === 'mensal') {
        totalAnualCalculado += item.valor * 12;
        totalImprevistosAnualizado += item.valor * 12;
      } else {
        totalAnualCalculado += item.valor;
        totalImprevistosAnualizado += item.valor;
      }
    }
  });

  return {
    totalDiario,
    totalMensal,
    totalImprevistosAnualizado,
    totalAnualCalculado,
  };
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────

export default function App() {
  const hoje = new Date();

  // Controle de Telas (Tabs Principais)
  const [telaAtiva, setTelaAtiva] = useState<'dashboard' | 'carteira'>('dashboard');

  // Meta Base Diária
  const [metaDiariaBase, setMetaDiariaBase] = useState<number>(META_DIARIA_PADRAO);

  // Dados da Semana Operacional
  const [diasSemana, setDiasSemana] = useState<GanhoDia[]>(() => {
    const estrutura = gerarEstruturaSemana(hoje);
    return calcularAmortizacaoPorFases(estrutura, META_DIARIA_PADRAO);
  });
  const [diaSelecionadoIdx, setDiaSelecionadoIdx] = useState<number>(0);

  // Dados Macro da Carteira
  const [semanasMes, setSemanasMes] = useState<SemanaMesInfo[]>([]);
  const [semanaMesSelecionadaIdx, setSemanaMesSelecionadaIdx] = useState<number>(0);
  const [dividas, setDividas] = useState<DividaItem[]>([]);

  // Modais de Lançamento de Dívida
  const [modalDividaAberto, setModalDividaAberto] = useState<boolean>(false);
  const [tipoDividaNovo, setTipoDividaNovo] = useState<'diaria' | 'mensal' | 'imprevista'>('diaria');
  const [frequenciaImprevistoNovo, setFrequenciaImprevistoNovo] = useState<'diaria' | 'mensal' | 'anual'>('anual');
  const [descricaoDividaInput, setDescricaoDividaInput] = useState<string>('');
  const [valorDividaInput, setValorDividaInput] = useState<string>('');

  // Modais de Navegação e Menu
  const [menuDrawerAberto, setMenuDrawerAberto] = useState<boolean>(false);
  const [modalMetaBaseAberto, setModalMetaBaseAberto] = useState<boolean>(false);
  const [novaMetaBaseInput, setNovaMetaBaseInput] = useState<string>('100');
  const [modalEscolhaFABAberto, setModalEscolhaFABAberto] = useState<boolean>(false);

  // Modal de Lançamento de Ganho
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [diaLancamentoIdx, setDiaLancamentoIdx] = useState<number>(0);
  const [valorDigitado, setValorDigitado] = useState<string>('');
  const [salvando, setSalvando] = useState<boolean>(false);

  // OCR
  const [analisandoOCR, setAnalisandoOCR] = useState<boolean>(false);
  const [ocrConfirmacaoPronta, setOcrConfirmacaoPronta] = useState<boolean>(false);
  const [valorExtraidoOCR, setValorExtraidoOCR] = useState<number>(0);

  // Histórico Supabase
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

  // Cálculos Macro da Carteira
  const resumoDividas = calcularResumoDividas(dividas);
  const totalMes = semanasMes.reduce((acc, s) => acc + s.totalGanhos, 0);
  const semanaSelecionadaInfo = semanasMes[semanaMesSelecionadaIdx] || semanasMes[0];

  const valorJaExistente = diaLancamento.valor || 0;
  const valorNovoNumerico = parseFloat(valorDigitado.replace(',', '.')) || 0;
  const valorSomadoPreview = valorJaExistente + valorNovoNumerico;

  // ─── CARREGAMENTO INICIAL: LOCAL STORAGE + SUPABASE ──────────────────────────
  useEffect(() => {
    inicializarTudo();
  }, []);

  const inicializarTudo = async () => {
    const baseSalva = await carregarMetaBaseLocal(META_DIARIA_PADRAO);
    setMetaDiariaBase(baseSalva);
    setNovaMetaBaseInput(baseSalva.toString());

    const dividasSalvas = await carregarDividasLocais();
    setDividas(dividasSalvas);

    await recarregarGanhosCombinados(baseSalva);
  };

  const recarregarGanhosCombinados = async (baseMeta: number) => {
    const estrutura = gerarEstruturaSemana(hoje);
    const ganhosLocais = await carregarGanhosLocais();

    // Gera lista das semanas do mês
    const sMes = gerarSemanasDoMes(hoje, ganhosLocais);
    setSemanasMes(sMes);
    const idxAtiva = sMes.findIndex(s => s.isAtual);
    if (idxAtiva >= 0) setSemanaMesSelecionadaIdx(idxAtiva);

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
      // Offline fallback
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
      // Silencioso
    }
  };

  const onRefresh = useCallback(async () => {
    setAtualizando(true);
    await recarregarGanhosCombinados(metaDiariaBase);
    const dividasAtualizadas = await carregarDividasLocais();
    setDividas(dividasAtualizadas);
    setAtualizando(false);
  }, [metaDiariaBase]);

  // ─── ABERTURA MODAL LANÇAMENTO GANHO ─────────────────────────────────────────
  const abrirModalParaDia = (idx: number) => {
    setDiaLancamentoIdx(idx);
    setValorDigitado('');
    setAnalisandoOCR(false);
    setOcrConfirmacaoPronta(false);
    setModalVisible(true);
  };

  // ─── SALVAR GANHO (SOMAR OU SUBSTITUIR) ─────────────────────────────────────
  const handleExecutarSalvarGanho = async (modo: 'somar' | 'substituir') => {
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
      const semanaModificada = diasSemana.map((d, i) =>
        i === diaLancamentoIdx ? { ...d, valor: valorFinal, temRegistro: true } : d
      );

      const semanaRecalculada = calcularAmortizacaoPorFases(semanaModificada, metaDiariaBase);
      setDiasSemana(semanaRecalculada);
      setDiaSelecionadoIdx(diaLancamentoIdx);

      const diaAtualizado = semanaRecalculada[diaLancamentoIdx];

      await salvarGanhoLocalmente({
        dataISO: diaAtualizado.dataISO,
        valor: valorFinal,
        metaDoDia: diaAtualizado.metaBase,
        percentual: diaAtualizado.percentual,
        descricao: `Ganho ${diaAtualizado.sigla}`,
        atualizadoEm: new Date().toISOString(),
      });

      // Atualiza também as semanas do mês na carteira
      const ganhosAtualizados = await carregarGanhosLocais();
      setSemanasMes(gerarSemanasDoMes(hoje, ganhosAtualizados));

      setModalVisible(false);

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

  // ─── GESTÃO DE DÍVIDAS (SALVAR / EXCLUIR) ────────────────────────────────────
  const handleAbrirNovaDivida = (tipo: 'diaria' | 'mensal' | 'imprevista') => {
    setTipoDividaNovo(tipo);
    setFrequenciaImprevistoNovo('anual');
    setDescricaoDividaInput('');
    setValorDividaInput('');
    setModalDividaAberto(true);
  };

  const handleSalvarDivida = async () => {
    const valorNum = parseFloat(valorDividaInput.replace(',', '.'));
    if (isNaN(valorNum) || valorNum <= 0) {
      Alert.alert('Valor inválido', 'Informe um valor de dívida maior que zero.');
      return;
    }

    if (!descricaoDividaInput.trim()) {
      Alert.alert('Descrição necessária', 'Informe o nome ou categoria da dívida (ex: Combustível, Parcela).');
      return;
    }

    const novoItem: DividaItem = {
      id: Date.now().toString(),
      descricao: descricaoDividaInput.trim(),
      valor: valorNum,
      tipo: tipoDividaNovo,
      frequenciaImprevisto: tipoDividaNovo === 'imprevista' ? frequenciaImprevistoNovo : undefined,
      dataLancamento: toISOLocal(new Date()),
    };

    const listaAtualizada = await salvarDividaLocal(novoItem);
    setDividas(listaAtualizada);
    setModalDividaAberto(false);

    Alert.alert('Dívida Registrada!', `A dívida anual projetada foi recalculada automaticamente.`);
  };

  const handleExcluirDivida = async (id: string, desc: string) => {
    Alert.alert(
      'Remover Dívida',
      `Deseja excluir "${desc}" da sua carteira?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            const lista = await removerDividaLocal(id);
            setDividas(lista);
          },
        },
      ]
    );
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

  // OCR
  const handleAbrirCapturaOCR = async () => {
    setModalEscolhaFABAberto(false);
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permissão necessária', 'É preciso permitir acesso às fotos.');
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

        const res = await processarOCRLocal(uri);
        const val = res.valorMetaExtrado ?? 0;
        setValorExtraidoOCR(val);
        setValorDigitado(val > 0 ? val.toFixed(2) : '');

        setTimeout(() => {
          setAnalisandoOCR(false);
          setOcrConfirmacaoPronta(true);
        }, 1000);
      }
    } catch {
      setAnalisandoOCR(false);
    }
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

          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerMainTitle}>
              {telaAtiva === 'dashboard' ? 'Amortiza • Semana' : 'Amortiza • Carteira'}
            </Text>
          </View>

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
              colors={['#00E676']}
            />
          }
        >
          {/* ══════════════════════════════════════════════════════════════════════
              TELA 1: DASHBOARD OPERACIONAL SEMANAL
              ══════════════════════════════════════════════════════════════════════ */}
          {telaAtiva === 'dashboard' && (
            <>
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

              {/* GRÁFICO DE BARRAS DE AMORTIZAÇÃO POR FASES */}
              <View style={styles.chartContainer}>
                <View style={styles.barsRow}>
                  {diasSemana.map((item, index) => {
                    const isSelected = index === diaSelecionadoIdx;
                    const alturaBarra = Math.max(10, item.percentual);

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
                        <Text
                          style={[
                            styles.barTopValue,
                            isSelected && { color: '#FFFFFF', fontWeight: 'bold' },
                            item.percentual === 100 && { color: '#00E676' },
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
                    Fez: <Text style={{ color: '#00E676', fontWeight: 'bold' }}>R$ {diaSelecionado.valor.toFixed(2)}</Text> • Meta Base: R$ {metaDiariaBase.toFixed(2)}
                  </Text>
                  <Text style={styles.impactoExplicacao}>
                    Status: <Text style={{ color: '#F8FAFC', fontWeight: 'bold' }}>{diaSelecionado.detalheAmortizacao}</Text>
                  </Text>
                </View>
              </View>
            </>
          )}

          {/* ══════════════════════════════════════════════════════════════════════
              TELA 2: CARTEIRA (VISÃO MACRO DE CONTROLE: GANHOS & DÍVIDAS)
              ══════════════════════════════════════════════════════════════════════ */}
          {telaAtiva === 'carteira' && (
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
                  <Text style={[styles.macroCardValorDestaque, { color: '#38BDF8' }]}>
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
                      onPress={() => setSemanaMesSelecionadaIdx(idx)}
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
                  Total arrecadado: <Text style={{ color: '#00E676', fontWeight: 'bold' }}>R$ {semanaSelecionadaInfo?.totalGanhos.toFixed(2)}</Text>
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
                    onPress={() => handleAbrirNovaDivida('diaria')}
                  >
                    <Text style={styles.btnAddDividaTexto}>+ Adicionar</Text>
                  </TouchableOpacity>
                </View>

                {dividas.filter(d => d.tipo === 'diaria').length === 0 ? (
                  <Text style={styles.dividaVaziaTexto}>Nenhum gasto diário registrado (ex: combustível, almoço).</Text>
                ) : (
                  dividas.filter(d => d.tipo === 'diaria').map(item => (
                    <View key={item.id} style={styles.itemDividaRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemDividaDesc}>{item.descricao}</Text>
                        <Text style={styles.itemDividaSub}>Impacto: R$ {(item.valor * 365).toFixed(2)}/ano</Text>
                      </View>
                      <Text style={styles.itemDividaValor}>R$ {item.valor.toFixed(2)}/dia</Text>
                      <TouchableOpacity
                        style={styles.btnExcluirDivida}
                        onPress={() => handleExcluirDivida(item.id, item.descricao)}
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
                    onPress={() => handleAbrirNovaDivida('mensal')}
                  >
                    <Text style={styles.btnAddDividaTexto}>+ Adicionar</Text>
                  </TouchableOpacity>
                </View>

                {dividas.filter(d => d.tipo === 'mensal').length === 0 ? (
                  <Text style={styles.dividaVaziaTexto}>Nenhuma dívida mensal registrada (ex: aluguel carro, seguro, parcela).</Text>
                ) : (
                  dividas.filter(d => d.tipo === 'mensal').map(item => (
                    <View key={item.id} style={styles.itemDividaRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemDividaDesc}>{item.descricao}</Text>
                        <Text style={styles.itemDividaSub}>Impacto: R$ {(item.valor * 12).toFixed(2)}/ano</Text>
                      </View>
                      <Text style={styles.itemDividaValor}>R$ {item.valor.toFixed(2)}/mês</Text>
                      <TouchableOpacity
                        style={styles.btnExcluirDivida}
                        onPress={() => handleExcluirDivida(item.id, item.descricao)}
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
                    onPress={() => handleAbrirNovaDivida('imprevista')}
                  >
                    <Text style={styles.btnAddDividaTexto}>+ Lançar</Text>
                  </TouchableOpacity>
                </View>

                {dividas.filter(d => d.tipo === 'imprevista').length === 0 ? (
                  <Text style={styles.dividaVaziaTexto}>Nenhum imprevisto registrado (ex: manutenção inesperada, multa).</Text>
                ) : (
                  dividas.filter(d => d.tipo === 'imprevista').map(item => (
                    <View key={item.id} style={styles.itemDividaRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemDividaDesc}>{item.descricao}</Text>
                        <Text style={styles.itemDividaSub}>
                          Frequência: {item.frequenciaImprevisto === 'diaria' ? 'Diária' : item.frequenciaImprevisto === 'mensal' ? 'Mensal' : 'Anual / Pontual'}
                        </Text>
                      </View>
                      <Text style={[styles.itemDividaValor, { color: '#F87171' }]}>R$ {item.valor.toFixed(2)}</Text>
                      <TouchableOpacity
                        style={styles.btnExcluirDivida}
                        onPress={() => handleExcluirDivida(item.id, item.descricao)}
                      >
                        <Text style={styles.btnExcluirDividaTexto}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))
                )}
              </View>
            </View>
          )}

          {/* HISTÓRICO SUPABASE */}
          <View style={styles.bancoSection}>
            <Text style={styles.sectionHeaderTitle}>Histórico de Registros</Text>

            {metasBanco.length === 0 ? (
              <Text style={styles.emptyText}>Ganhos e metas salvos no seu aparelho.</Text>
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

        {/* ══════════════════════════════════════════════════════════════════════
            BARRA DE NAVEGAÇÃO INFERIOR (BOTTOM TABS)
            ══════════════════════════════════════════════════════════════════════ */}
        <View style={styles.bottomTabBar}>
          <TouchableOpacity
            style={[styles.tabBarItem, telaAtiva === 'dashboard' && styles.tabBarItemAtivo]}
            onPress={() => setTelaAtiva('dashboard')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabBarItemIcon, telaAtiva === 'dashboard' && styles.tabBarItemIconAtivo]}>
              📊
            </Text>
            <Text style={[styles.tabBarItemTexto, telaAtiva === 'dashboard' && styles.tabBarItemTextoAtivo]}>
              Semana
            </Text>
          </TouchableOpacity>

          {/* FAB FLUTUANTE CENTRAL DA CÂMERA / GANHO */}
          <TouchableOpacity
            style={styles.tabBarFab}
            onPress={() => setModalEscolhaFABAberto(true)}
            activeOpacity={0.85}
          >
            <Text style={styles.tabBarFabIcon}>+</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBarItem, telaAtiva === 'carteira' && styles.tabBarItemAtivo]}
            onPress={() => setTelaAtiva('carteira')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabBarItemIcon, telaAtiva === 'carteira' && styles.tabBarItemIconAtivo]}>
              💼
            </Text>
            <Text style={[styles.tabBarItemTexto, telaAtiva === 'carteira' && styles.tabBarItemTextoAtivo]}>
              Carteira
            </Text>
          </TouchableOpacity>
        </View>

        {/* MODAL: LANÇAMENTO DE DÍVIDAS (CARTEIRA) */}
        <Modal
          visible={modalDividaAberto}
          animationType="slide"
          transparent
          onRequestClose={() => setModalDividaAberto(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.bottomSheetContainer}>
              <View style={styles.bottomSheetHandle} />

              <Text style={styles.modalTitleText}>
                {tipoDividaNovo === 'diaria' ? 'Cadastrar Gasto Diário' : tipoDividaNovo === 'mensal' ? 'Cadastrar Dívida Mensal' : 'Lançar Dívida Imprevista'}
              </Text>
              <Text style={styles.modalSubText}>
                A dívida anual projetada atualizará automaticamente.
              </Text>

              {/* SELETOR SE FOR IMPREVISTA */}
              {tipoDividaNovo === 'imprevista' && (
                <View style={{ marginBottom: 14 }}>
                  <Text style={styles.inputLabel}>Frequência do Imprevisto:</Text>
                  <View style={styles.diaSelectorRow}>
                    {(['diaria', 'mensal', 'anual'] as const).map(freq => (
                      <TouchableOpacity
                        key={freq}
                        style={[styles.diaPill, frequenciaImprevistoNovo === freq && styles.diaPillAtivo]}
                        onPress={() => setFrequenciaImprevistoNovo(freq)}
                      >
                        <Text style={[styles.diaPillTexto, frequenciaImprevistoNovo === freq && styles.diaPillTextoAtivo]}>
                          {freq === 'diaria' ? 'Diária' : freq === 'mensal' ? 'Mensal' : 'Anual / Única'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              <Text style={styles.inputLabel}>Descrição da Dívida / Gasto:</Text>
              <TextInput
                style={styles.modalInput}
                placeholder={tipoDividaNovo === 'diaria' ? 'Ex: Combustível, Almoço' : tipoDividaNovo === 'mensal' ? 'Ex: Parcela do Carro, Seguro' : 'Ex: Manutenção inesperada do pneu'}
                placeholderTextColor="#64748B"
                value={descricaoDividaInput}
                onChangeText={setDescricaoDividaInput}
                autoFocus
              />

              <Text style={styles.inputLabel}>Valor (R$):</Text>
              <TextInput
                style={styles.modalInputGrande}
                keyboardType="numeric"
                placeholder="0.00"
                placeholderTextColor="#64748B"
                value={valorDividaInput}
                onChangeText={setValorDividaInput}
              />

              <TouchableOpacity
                style={styles.primaryActionButton}
                onPress={handleSalvarDivida}
              >
                <Text style={styles.primaryActionText}>Salvar Dívida</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.secondaryActionButton, { marginTop: 6, borderColor: 'transparent' }]}
                onPress={() => setModalDividaAberto(false)}
              >
                <Text style={[styles.secondaryActionText, { color: '#64748B' }]}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* MODAL: MENU SANDUÍCHE (DRAWER LATERAL) */}
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

              <Text style={styles.drawerSubtitle}>Gestão Operacional & Carteira Macro</Text>

              <TouchableOpacity
                style={styles.drawerItem}
                onPress={() => {
                  setMenuDrawerAberto(false);
                  setTelaAtiva('dashboard');
                }}
              >
                <Text style={styles.drawerItemText}>📊 Dashboard da Semana</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.drawerItem}
                onPress={() => {
                  setMenuDrawerAberto(false);
                  setTelaAtiva('carteira');
                }}
              >
                <Text style={styles.drawerItemText}>💼 Carteira & Controle Macro</Text>
              </TouchableOpacity>

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

              <View style={styles.drawerFooter}>
                <Text style={styles.drawerFooterText}>Amortiza v1.2.0 • Offline-First</Text>
              </View>
            </View>
          </View>
        </Modal>

        {/* MODAL: CONFIGURAR META BASE */}
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

        {/* MODAL: ESCOLHA AO CLICAR NO FAB (+) */}
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

        {/* MODAL: LANÇAMENTO DIRETO DE GANHO */}
        <Modal
          animationType="slide"
          transparent={true}
          visible={modalVisible}
          onRequestClose={() => setModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.bottomSheetContainer}>
              <View style={styles.bottomSheetHandle} />

              {analisandoOCR && (
                <View style={styles.modalContentState}>
                  <ActivityIndicator size="large" color="#00E676" style={{ marginBottom: 16 }} />
                  <Text style={styles.modalTitleText}>Analisando captura de tela...</Text>
                  <Text style={styles.modalSubText}>Extraindo valores via OCR On-Device</Text>
                </View>
              )}

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
                      onPress={() => handleExecutarSalvarGanho('somar')}
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
                    onPress={() => handleExecutarSalvarGanho('substituir')}
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

                  {valorJaExistente > 0 && (
                    <View style={styles.avisoAcumuloContainer}>
                      <Text style={styles.avisoAcumuloTexto}>
                        💡 Já registrado hoje: <Text style={{ color: '#00E676', fontWeight: 'bold' }}>R$ {valorJaExistente.toFixed(2)}</Text>
                      </Text>
                    </View>
                  )}

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

                  {valorJaExistente > 0 && valorNovoNumerico > 0 ? (
                    <>
                      <TouchableOpacity
                        style={styles.primaryActionButton}
                        onPress={() => handleExecutarSalvarGanho('somar')}
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
                        onPress={() => handleExecutarSalvarGanho('substituir')}
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
                      onPress={() => handleExecutarSalvarGanho(valorJaExistente > 0 ? 'substituir' : 'somar')}
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
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  headerMainTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
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
    color: '#00E676',
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
    borderColor: '#00E676',
  },
  btnEditarGanhoTexto: {
    color: '#00E676',
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
    color: '#00E676',
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
    backgroundColor: '#00E676',
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
    borderLeftColor: '#00E676',
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
    color: '#00E676',
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
    backgroundColor: '#00E676',
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

  // ════════════════════════════════════════════════════════════════════════════
  // ESTILOS DA CARTEIRA & VISÃO MACRO
  // ════════════════════════════════════════════════════════════════════════════
  carteiraContainer: {
    marginTop: 10,
  },
  secaoMacroTitulo: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 14,
    letterSpacing: -0.3,
  },
  subSecaoTitulo: {
    color: '#94A3B8',
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
    borderColor: '#1E293B',
  },
  macroCardLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  macroCardValorDestaque: {
    color: '#00E676',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 4,
  },
  macroCardSub: {
    color: '#64748B',
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
    borderColor: '#1E293B',
    minWidth: 120,
  },
  semanaCardPillAtiva: {
    borderColor: '#00E676',
    backgroundColor: '#1E293B',
  },
  semanaPillNome: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2,
  },
  semanaPillNomeAtiva: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  semanaPillValor: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
  },
  semanaPillValorAtiva: {
    color: '#00E676',
  },
  detalheSemanaCard: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  detalheSemanaTitulo: {
    color: '#94A3B8',
    fontSize: 12,
    marginBottom: 2,
  },
  detalheSemanaGanhos: {
    color: '#F8FAFC',
    fontSize: 13,
  },

  // CARD DESTAQUE DÍVIDA ANUAL
  cardDividaAnual: {
    backgroundColor: '#1E1B2E',
    borderRadius: 18,
    padding: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#F87171',
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
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '800',
  },
  dividaAnualBadge: {
    backgroundColor: 'rgba(248, 113, 113, 0.15)',
    color: '#F87171',
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
    color: '#94A3B8',
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
    color: '#94A3B8',
    fontSize: 10,
    marginBottom: 2,
  },
  breakdownItemVal: {
    color: '#F87171',
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
    borderColor: '#1E293B',
  },
  categoriaDividaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  categoriaDividaTitulo: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
  },
  categoriaDividaTotal: {
    color: '#00E676',
    fontSize: 15,
    fontWeight: '800',
    marginTop: 2,
  },
  btnAddDivida: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  btnAddDividaTexto: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '700',
  },
  dividaVaziaTexto: {
    color: '#64748B',
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
    borderTopColor: '#1E293B',
  },
  itemDividaDesc: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '600',
  },
  itemDividaSub: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 2,
  },
  itemDividaValor: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
    marginRight: 12,
  },
  btnExcluirDivida: {
    padding: 6,
    backgroundColor: '#1E293B',
    borderRadius: 6,
  },
  btnExcluirDividaTexto: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: 'bold',
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

  // ════════════════════════════════════════════════════════════════════════════
  // BARRA DE NAVEGAÇÃO INFERIOR (BOTTOM TABS)
  // ════════════════════════════════════════════════════════════════════════════
  bottomTabBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 72,
    backgroundColor: '#0F172A',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    paddingBottom: 8,
    paddingHorizontal: 20,
  },
  tabBarItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  tabBarItemAtivo: {},
  tabBarItemIcon: {
    fontSize: 22,
    opacity: 0.5,
  },
  tabBarItemIconAtivo: {
    opacity: 1,
  },
  tabBarItemTexto: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  tabBarItemTextoAtivo: {
    color: '#00E676',
    fontWeight: '800',
  },
  tabBarFab: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#00E676',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -28,
    elevation: 8,
    shadowColor: '#00E676',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  tabBarFabIcon: {
    fontSize: 30,
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
    fontSize: 16,
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
