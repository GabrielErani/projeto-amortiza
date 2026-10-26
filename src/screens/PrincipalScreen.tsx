// Shell principal: cabeçalho, abas (Semana | + | Carteira), dados locais e modais globais.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';

import { useSync } from '../hooks/useSync';
import { sair } from '../services/auth';
import { sincronizarTudo } from '../services/sync';
import { processarOCRLocal } from '../services/ocr';
import {
  carregarDividasLocais, carregarGanhosLocais, carregarMetaBaseLocal, limparDadosLocais,
  removerDividaLocal, salvarDividaLocal, salvarGanhoLocalmente, salvarMetaBaseLocal,
} from '../services/storage';
import { DividaItem, GanhoDia, SemanaMesInfo, Usuario } from '../types';
import { META_DIARIA_PADRAO, calcularAmortizacaoPorFases } from '../utils/amortizacao';
import { gerarEstruturaSemana, gerarSemanasDoMes, somarGanhosDoMes, toISOLocal } from '../utils/datas';
import { formatarMoeda, parseValorDigitado } from '../utils/formatacao';
import { cores, espaco } from '../theme';

import { DashboardScreen } from './DashboardScreen';
import { CarteiraScreen } from './CarteiraScreen';
import { Cabecalho } from '../components/Cabecalho';
import { periodoCurto } from '../components/rotulos';
import { ModalLancarGanho, ModoSalvar } from '../components/ModalLancarGanho';
import { ModalDivida } from '../components/ModalDivida';
import { ModalMetaBase } from '../components/ModalMetaBase';
import { SheetConta, inicialDe } from '../components/SheetConta';
import { Aba, TabBar } from '../components/TabBar';

interface Props {
  usuario: Usuario | null;
  onAbrirLogin: () => void;
  onSaiuDaConta: () => Promise<void>; // o App esquece o modo offline
}

export function PrincipalScreen({ usuario, onAbrirLogin, onSaiuDaConta }: Props) {
  const estadoSync = useSync();
  const hoje = useRef(new Date()).current;

  const [aba, setAba] = useState<Aba>('semana');
  const [metaBase, setMetaBase] = useState(META_DIARIA_PADRAO);
  const [dias, setDias] = useState<GanhoDia[]>(() => calcularAmortizacaoPorFases(gerarEstruturaSemana(hoje), META_DIARIA_PADRAO));
  const [diaSelIdx, setDiaSelIdx] = useState(() => Math.max(0, gerarEstruturaSemana(hoje).findIndex((d) => d.isHoje)));
  const [semanasMes, setSemanasMes] = useState<SemanaMesInfo[]>([]);
  const [totalMes, setTotalMes] = useState(0);
  const [semanaMesIdx, setSemanaMesIdx] = useState(0);
  const [dividas, setDividas] = useState<DividaItem[]>([]);
  const [atualizando, setAtualizando] = useState(false);

  // Modais
  const [sheetConta, setSheetConta] = useState(false);
  const [modalMeta, setModalMeta] = useState(false);
  const [modalDivida, setModalDivida] = useState<DividaItem['tipo'] | null>(null);
  const [modalGanho, setModalGanho] = useState(false);
  const [diaLancIdx, setDiaLancIdx] = useState(0);
  const [valorDigitado, setValorDigitado] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [analisandoOCR, setAnalisandoOCR] = useState(false);
  const [ocrPronto, setOcrPronto] = useState(false);
  const [valorOCR, setValorOCR] = useState(0);

  const totalSemana = useMemo(() => dias.reduce((a, d) => a + d.valor, 0), [dias]);
  const diasCobertos = useMemo(() => dias.filter((d) => d.percentual === 100).length, [dias]);
  const periodo = useMemo(() => periodoCurto(dias), [dias]);

  // ─── Carga local (fonte da verdade offline-first) ───────────────────────────
  const recarregarLocal = useCallback(async (base?: number) => {
    const metaAtual = base ?? (await carregarMetaBaseLocal(META_DIARIA_PADRAO));
    const ganhos = await carregarGanhosLocais();
    const sMes = gerarSemanasDoMes(hoje, ganhos);
    setMetaBase(metaAtual);
    setSemanasMes(sMes);
    setTotalMes(somarGanhosDoMes(hoje, ganhos));
    const idxAtual = sMes.findIndex((s) => s.isAtual);
    if (idxAtual >= 0) setSemanaMesIdx(idxAtual);
    const estrutura = gerarEstruturaSemana(hoje).map((d) =>
      ganhos[d.dataISO] ? { ...d, valor: ganhos[d.dataISO].valor, temRegistro: true } : d
    );
    setDias(calcularAmortizacaoPorFases(estrutura, metaAtual));
    setDividas(await carregarDividasLocais());
  }, [hoje]);

  useEffect(() => { recarregarLocal(); }, [recarregarLocal]);

  // Quando a sincronização termina com sucesso, os dados locais podem ter mudado.
  const ultimaSyncVista = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (estadoSync.status === 'ok' && estadoSync.ultimaSync !== ultimaSyncVista.current) {
      ultimaSyncVista.current = estadoSync.ultimaSync;
      recarregarLocal();
    }
  }, [estadoSync, recarregarLocal]);

  const onRefresh = useCallback(async () => {
    setAtualizando(true);
    if (usuario) await sincronizarTudo(usuario.id);
    await recarregarLocal();
    setAtualizando(false);
  }, [usuario, recarregarLocal]);

  // ─── Ganhos ─────────────────────────────────────────────────────────────────
  const abrirLancamento = (idx: number) => {
    setDiaLancIdx(idx);
    setValorDigitado('');
    setAnalisandoOCR(false);
    setOcrPronto(false);
    setModalGanho(true);
  };

  const salvarGanho = async (modo: ModoSalvar) => {
    const digitado = ocrPronto ? valorOCR : parseValorDigitado(valorDigitado);
    const existente = dias[diaLancIdx]?.valor || 0;
    if (digitado <= 0 && modo === 'somar') return;
    const valorFinal = modo === 'somar' ? existente + digitado : digitado;

    setSalvando(true);
    try {
      const recalculada = calcularAmortizacaoPorFases(
        dias.map((d, i) => (i === diaLancIdx ? { ...d, valor: valorFinal, temRegistro: true } : d)),
        metaBase
      );
      setDias(recalculada);
      setDiaSelIdx(diaLancIdx);
      const diaAtual = recalculada[diaLancIdx];
      await salvarGanhoLocalmente({
        dataISO: diaAtual.dataISO,
        valor: valorFinal,
        metaDoDia: diaAtual.metaBase,
        percentual: diaAtual.percentual,
        descricao: `Ganho ${diaAtual.sigla}`,
        atualizadoEm: new Date().toISOString(),
      });
      const ganhosAtualizados = await carregarGanhosLocais();
      setSemanasMes(gerarSemanasDoMes(hoje, ganhosAtualizados));
      setTotalMes(somarGanhosDoMes(hoje, ganhosAtualizados));
      setModalGanho(false);

      // Só os dias cobertos pelo excedente deste lançamento (não os que já tinham ganho próprio).
      const adiantados = recalculada
        .filter((d, i) => i > diaLancIdx && d.detalheAmortizacao.includes(`Amortizado por ${diaAtual.sigla}`))
        .map((d) => `${d.sigla} ${d.percentual}%`);
      Alert.alert(
        `${diaAtual.sigla}: ${formatarMoeda(valorFinal)}`,
        adiantados.length ? `Excedente adiantou: ${adiantados.join(', ')}.` : 'Ganho registrado.'
      );
    } catch (err: any) {
      Alert.alert('Erro ao salvar', err?.message || 'Não foi possível registrar o ganho.');
    } finally {
      setSalvando(false);
    }
  };

  // Chamado de dentro do lançamento: o modal já está aberto, no dia escolhido pelo usuário.
  const abrirOCR = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return Alert.alert('Permissão necessária', 'Permita o acesso às fotos para ler o print.');
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (res.canceled || !res.assets?.length) return;

      setAnalisandoOCR(true);
      setOcrPronto(false);
      const ocr = await processarOCRLocal(res.assets[0].uri);
      const val = ocr.valorMetaExtrado ?? 0;
      setValorOCR(val);
      setValorDigitado(val > 0 ? val.toFixed(2).replace('.', ',') : '');
      setAnalisandoOCR(false);
      setOcrPronto(val > 0);
    } catch {
      setAnalisandoOCR(false);
    }
  };

  // ─── Meta base e dívidas ────────────────────────────────────────────────────
  const salvarMeta = async (nova: number) => {
    setMetaBase(nova);
    await salvarMetaBaseLocal(nova);
    setDias((atual) => calcularAmortizacaoPorFases(atual, nova));
    setModalMeta(false);
  };

  const salvarDivida = async (d: { descricao: string; valor: number; frequencia?: DividaItem['frequenciaImprevisto'] }) => {
    if (!modalDivida) return;
    const lista = await salvarDividaLocal({
      id: Date.now().toString(),
      descricao: d.descricao,
      valor: d.valor,
      tipo: modalDivida,
      frequenciaImprevisto: modalDivida === 'imprevista' ? d.frequencia : undefined,
      dataLancamento: toISOLocal(new Date()),
      atualizadoEm: new Date().toISOString(),
    });
    setDividas(lista);
    setModalDivida(null);
  };

  const excluirDivida = (item: DividaItem) =>
    Alert.alert('Remover', `Excluir "${item.descricao}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: async () => setDividas(await removerDividaLocal(item.id)) },
    ]);

  // ─── Conta ──────────────────────────────────────────────────────────────────
  // Antes de sair, sincroniza para não apagar do aparelho o que ainda não foi para a nuvem.
  const executarSaida = async (ignorarFalhaSync = false) => {
    if (usuario && !ignorarFalhaSync) {
      const resultado = await sincronizarTudo(usuario.id);
      if (!resultado.success) {
        Alert.alert(
          'Não foi possível sincronizar',
          `${resultado.error}\n\nSe sair agora, as alterações que ainda não foram enviadas serão apagadas deste aparelho.`,
          [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Sair mesmo assim', style: 'destructive', onPress: () => void executarSaida(true) },
          ]
        );
        return;
      }
    }
    setSheetConta(false);
    await sair();
    await limparDadosLocais();
    await onSaiuDaConta();
  };

  const confirmarSaida = () =>
    Alert.alert('Sair da conta', 'Seus dados ficam salvos na nuvem e serão removidos deste aparelho.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: () => void executarSaida() },
    ]);

  return (
    <SafeAreaView style={styles.tela}>
      <Cabecalho
        titulo={aba === 'semana' ? 'Semana' : 'Carteira'}
        subtitulo={aba === 'semana' ? periodo : hoje.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
        estadoSync={estadoSync}
        inicial={inicialDe(usuario)}
        onSync={() => (usuario ? setSheetConta(true) : onAbrirLogin())}
        onConta={() => setSheetConta(true)}
      />

      <ScrollView
        contentContainerStyle={styles.conteudo}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={onRefresh} tintColor={cores.primaria} colors={[cores.primaria]} />}
      >
        {aba === 'semana' ? (
          <DashboardScreen
            dias={dias}
            diaSelecionadoIdx={diaSelIdx}
            onSelecionarDia={setDiaSelIdx}
            metaBase={metaBase}
            onEditarMeta={() => setModalMeta(true)}
            onLancarGanho={abrirLancamento}
          />
        ) : (
          <CarteiraScreen
            totalSemana={totalSemana}
            diasCobertos={diasCobertos}
            semanasMes={semanasMes}
            totalMes={totalMes}
            semanaSelecionadaIdx={semanaMesIdx}
            onSelecionarSemana={setSemanaMesIdx}
            dividas={dividas}
            onNovaDivida={setModalDivida}
            onExcluirDivida={excluirDivida}
          />
        )}
      </ScrollView>

      <TabBar aba={aba} onTrocar={setAba} onAdicionar={() => abrirLancamento(diaSelIdx)} />

      <ModalLancarGanho
        visivel={modalGanho}
        onFechar={() => setModalGanho(false)}
        dias={dias}
        diaIdx={diaLancIdx}
        onTrocarDia={setDiaLancIdx}
        valorDigitado={valorDigitado}
        onChangeValor={setValorDigitado}
        salvando={salvando}
        onSalvar={salvarGanho}
        onEscanearOCR={abrirOCR}
        analisandoOCR={analisandoOCR}
        ocrPronto={ocrPronto}
        valorOCR={valorOCR}
        onDigitarManual={() => setOcrPronto(false)}
      />
      <ModalMetaBase visivel={modalMeta} metaAtual={metaBase} onFechar={() => setModalMeta(false)} onSalvar={salvarMeta} />
      <ModalDivida visivel={modalDivida !== null} tipo={modalDivida ?? 'diaria'} onFechar={() => setModalDivida(null)} onSalvar={salvarDivida} />
      <SheetConta
        visivel={sheetConta}
        onFechar={() => setSheetConta(false)}
        usuario={usuario}
        estadoSync={estadoSync}
        metaBase={metaBase}
        onSincronizar={() => usuario && sincronizarTudo(usuario.id)}
        onEditarMeta={() => { setSheetConta(false); setModalMeta(true); }}
        onEntrar={() => { setSheetConta(false); onAbrirLogin(); }}
        onSair={confirmarSaida}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  // Folga inferior para o FAB, que sobe um pouco acima da barra de abas.
  conteudo: { paddingHorizontal: espaco.xl, paddingTop: espaco.sm, paddingBottom: espaco.xxl },
});
