// Estado e regras de negócio do Amortiza: dados do aparelho (offline-first), recarga após
// cada sincronização, lançamento de ganhos (manual e OCR), dívidas e meta diária base.
// Documentação React Hooks: https://react.dev/reference/react/hooks
// Documentação AsyncStorage: https://react-native-async-storage.github.io/async-storage/
// Documentação Expo ImagePicker: https://docs.expo.dev/versions/latest/sdk/imagepicker/

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import type { ModalDividaProps } from '../components/ModalDivida';
import type { ModalEscolhaFABProps } from '../components/ModalEscolhaFAB';
import type { ModalLancarGanhoProps, ModoSalvarGanho } from '../components/ModalLancarGanho';
import type { ModalMetaBaseProps } from '../components/ModalMetaBase';
import { processarOCRLocal } from '../services/ocr';
import {
  carregarDividasLocais,
  carregarGanhosLocais,
  carregarMetaBaseLocal,
  removerDividaLocal,
  salvarDividaLocal,
  salvarGanhoLocalmente,
  salvarMetaBaseLocal,
} from '../services/storage';
import { sincronizarTudo } from '../services/sync';
import { DividaItem, RegistroGanhoLocal } from '../types';
import { calcularAmortizacaoPorFases, META_DIARIA_PADRAO } from '../utils/amortizacao';
import { gerarEstruturaSemana, gerarSemanasDoMes, somarGanhosDoMes, toISOLocal } from '../utils/datas';
import { parseValorDigitado } from '../utils/formatacao';
import { montarHistoricoGanhos } from '../utils/historico';
import { useSync } from './useSync';

type TipoDivida = DividaItem['tipo'];
type FrequenciaImprevisto = NonNullable<DividaItem['frequenciaImprevisto']>;

// Posição da semana atual no seletor da Carteira (depende só de "hoje")
function indiceSemanaAtual(hoje: Date): number {
  return Math.max(0, gerarSemanasDoMes(hoje, {}).findIndex((s) => s.isAtual));
}

// Posição de hoje na semana Seg–Dom (o app abre com o dia de hoje selecionado)
function indiceDeHoje(hoje: Date): number {
  return Math.max(0, gerarEstruturaSemana(hoje).findIndex((d) => d.isHoje));
}

export function useDadosApp(usuarioId: string | null) {
  // "Hoje" fica estável entre renders e só avança quando o dia vira (checado ao recarregar)
  const [hoje, setHoje] = useState<Date>(() => new Date());

  // Dados persistidos no aparelho (fonte da verdade)
  const [metaDiariaBase, setMetaDiariaBase] = useState<number>(META_DIARIA_PADRAO);
  const [ganhosLocais, setGanhosLocais] = useState<Record<string, RegistroGanhoLocal>>({});
  const [dividas, setDividas] = useState<DividaItem[]>([]);

  // Seleções e refresh
  const [diaSelecionadoIdx, setDiaSelecionadoIdx] = useState<number>(() => indiceDeHoje(hoje));
  const [semanaMesSelecionadaIdx, setSemanaMesSelecionadaIdx] = useState<number>(() => indiceSemanaAtual(hoje));
  const [atualizando, setAtualizando] = useState<boolean>(false);

  // Modal de lançamento de dívida
  const [modalDividaAberto, setModalDividaAberto] = useState<boolean>(false);
  const [tipoDividaNovo, setTipoDividaNovo] = useState<TipoDivida>('diaria');
  const [frequenciaImprevistoNovo, setFrequenciaImprevistoNovo] = useState<FrequenciaImprevisto>('anual');
  const [descricaoDividaInput, setDescricaoDividaInput] = useState<string>('');
  const [valorDividaInput, setValorDividaInput] = useState<string>('');

  // Modais de meta base e de escolha do FAB
  const [modalMetaBaseAberto, setModalMetaBaseAberto] = useState<boolean>(false);
  const [novaMetaBaseInput, setNovaMetaBaseInput] = useState<string>('100');
  const [modalEscolhaFABAberto, setModalEscolhaFABAberto] = useState<boolean>(false);

  // Modal de lançamento de ganho (manual e OCR)
  const [modalGanhoAberto, setModalGanhoAberto] = useState<boolean>(false);
  const [diaLancamentoIdx, setDiaLancamentoIdx] = useState<number>(() => indiceDeHoje(hoje));
  const [valorDigitado, setValorDigitado] = useState<string>('');
  const [salvando, setSalvando] = useState<boolean>(false);
  const [analisandoOCR, setAnalisandoOCR] = useState<boolean>(false);
  const [ocrConfirmacaoPronta, setOcrConfirmacaoPronta] = useState<boolean>(false);
  const [valorExtraidoOCR, setValorExtraidoOCR] = useState<number>(0);
  // Pausa de 1 s entre o fim da leitura e a confirmação do OCR; cancelada se o modal fechar antes
  const timerOCR = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelarTimerOCR = useCallback(() => {
    if (timerOCR.current) {
      clearTimeout(timerOCR.current);
      timerOCR.current = null;
    }
  }, []);
  useEffect(() => cancelarTimerOCR, [cancelarTimerOCR]);

  const fecharModalGanho = useCallback(() => {
    cancelarTimerOCR();
    setAnalisandoOCR(false);
    setModalGanhoAberto(false);
  }, [cancelarTimerOCR]);

  // ─── DADOS DERIVADOS ────────────────────────────────────────────────────────
  // Semana Seg–Dom com os ganhos salvos e a Regra Amortiza (cascata) aplicada
  const diasSemana = useMemo(() => {
    const estrutura = gerarEstruturaSemana(hoje).map((dia) => {
      const reg = ganhosLocais[dia.dataISO];
      return reg ? { ...dia, valor: reg.valor, temRegistro: true } : dia;
    });
    return calcularAmortizacaoPorFases(estrutura, metaDiariaBase);
  }, [hoje, ganhosLocais, metaDiariaBase]);

  const semanasMes = useMemo(() => gerarSemanasDoMes(hoje, ganhosLocais), [hoje, ganhosLocais]);
  // Só dias do mês: as semanas de borda incluem dias do mês vizinho e inflariam o total
  const totalMes = useMemo(() => somarGanhosDoMes(hoje, ganhosLocais), [hoje, ganhosLocais]);
  const historico = useMemo(() => montarHistoricoGanhos(ganhosLocais), [ganhosLocais]);

  const { totalSemana, totalCobertoSemana, diasAmortizadosCompletos } = useMemo(
    () => ({
      totalSemana: diasSemana.reduce((acc, d) => acc + d.valor, 0),
      totalCobertoSemana: diasSemana.reduce((acc, d) => acc + d.valorCoberto, 0),
      diasAmortizadosCompletos: diasSemana.filter((d) => d.percentual === 100).length,
    }),
    [diasSemana]
  );

  // ─── CARREGAMENTO: AsyncStorage → ESTADO ────────────────────────────────────
  // Relê meta base, dívidas e ganhos (abertura do app, refresh e após cada sync)
  const recarregarDadosLocais = useCallback(async () => {
    const agora = new Date();
    setHoje((atual) => (toISOLocal(atual) === toISOLocal(agora) ? atual : agora));

    const [baseSalva, dividasSalvas, ganhosSalvos] = await Promise.all([
      carregarMetaBaseLocal(META_DIARIA_PADRAO),
      carregarDividasLocais(),
      carregarGanhosLocais(),
    ]);
    setMetaDiariaBase(baseSalva);
    setDividas(dividasSalvas);
    // Cópia: o storage devolve o próprio objeto de cache, que ele muta a cada gravação
    setGanhosLocais({ ...ganhosSalvos });
    return { baseSalva, agora };
  }, []);

  useEffect(() => {
    let ativo = true;
    recarregarDadosLocais().then(({ baseSalva, agora }) => {
      if (!ativo) return;
      setNovaMetaBaseInput(baseSalva.toString());
      setSemanaMesSelecionadaIdx(indiceSemanaAtual(agora));
    });
    return () => {
      ativo = false;
    };
  }, [recarregarDadosLocais]);

  // ─── SINCRONIZAÇÃO ──────────────────────────────────────────────────────────
  const estadoSync = useSync();
  const ultimaSyncAplicada = useRef<string | undefined>(estadoSync.ultimaSync);

  // Uma sync concluída pode ter trazido dados da nuvem: relê o aparelho
  useEffect(() => {
    if (estadoSync.status !== 'ok' || !estadoSync.ultimaSync) return;
    if (estadoSync.ultimaSync === ultimaSyncAplicada.current) return;
    ultimaSyncAplicada.current = estadoSync.ultimaSync;
    void recarregarDadosLocais();
  }, [estadoSync.status, estadoSync.ultimaSync, recarregarDadosLocais]);

  // Botão ↻, pull-to-refresh e "Sincronizar Dados": sincroniza (se logado) e relê o aparelho
  const onRefresh = useCallback(async () => {
    setAtualizando(true);
    try {
      if (usuarioId) await sincronizarTudo(usuarioId);
      const { agora } = await recarregarDadosLocais();
      setSemanaMesSelecionadaIdx(indiceSemanaAtual(agora));
    } finally {
      setAtualizando(false);
    }
  }, [usuarioId, recarregarDadosLocais]);

  // ─── LANÇAMENTO DE GANHO ────────────────────────────────────────────────────
  const abrirModalParaDia = (idx: number) => {
    cancelarTimerOCR();
    setDiaLancamentoIdx(idx);
    setValorDigitado('');
    setAnalisandoOCR(false);
    setOcrConfirmacaoPronta(false);
    setModalGanhoAberto(true);
  };

  // Salva o ganho do dia somando ao valor existente ou substituindo-o
  const handleExecutarSalvarGanho = async (modo: ModoSalvarGanho) => {
    const valorDigitadoNum = parseValorDigitado(valorDigitado);

    if (valorDigitadoNum <= 0 && modo === 'somar') {
      Alert.alert('Valor inválido', 'Digite o valor do ganho a adicionar.');
      return;
    }

    const diaLancamento = diasSemana[diaLancamentoIdx] || diasSemana[0];
    const valorJaExistente = diaLancamento.valor || 0;
    const valorFinal = modo === 'somar' ? valorJaExistente + valorDigitadoNum : valorDigitadoNum;

    setSalvando(true);

    try {
      const semanaModificada = diasSemana.map((d, i) =>
        i === diaLancamentoIdx ? { ...d, valor: valorFinal, temRegistro: true } : d
      );
      const semanaRecalculada = calcularAmortizacaoPorFases(semanaModificada, metaDiariaBase);
      const diaAtualizado = semanaRecalculada[diaLancamentoIdx];

      const registro: RegistroGanhoLocal = {
        dataISO: diaAtualizado.dataISO,
        valor: valorFinal,
        metaDoDia: diaAtualizado.metaBase,
        percentual: diaAtualizado.percentual,
        descricao: `Ganho ${diaAtualizado.sigla}`,
        atualizadoEm: new Date().toISOString(),
      };

      // Atualização otimista: gráfico, carteira e histórico mudam na hora
      setGanhosLocais((atual) => ({ ...atual, [registro.dataISO]: registro }));
      setDiaSelecionadoIdx(diaLancamentoIdx);

      await salvarGanhoLocalmente(registro); // também agenda o envio para a nuvem
      const ganhosAtualizados = await carregarGanhosLocais();
      setGanhosLocais({ ...ganhosAtualizados });

      setModalGanhoAberto(false);

      // Só os dias cobertos pelo excedente deste lançamento (não os que já tinham ganho próprio)
      const diasAmortizados = semanaRecalculada
        .filter((d, i) => i > diaLancamentoIdx && d.detalheAmortizacao.includes(`Amortizado por ${diaAtualizado.sigla}`))
        .map((d) => `${d.sigla} (${d.percentual}%)`);

      let msg = `Ganho de ${diaAtualizado.sigla} atualizado para R$ ${valorFinal.toFixed(2)}.`;
      if (diasAmortizados.length > 0) {
        msg += `\n\n⚡ Dias adiantados pelo excedente:\n${diasAmortizados.join(', ')}!`;
      }

      Alert.alert('✅ Ganho Registrado!', msg);
    } catch (err) {
      Alert.alert('Erro ao Salvar', (err as { message?: string } | null)?.message || 'Falha ao registrar ganho.');
    } finally {
      setSalvando(false);
    }
  };

  // OCR: escolhe um print da galeria e lê o valor no próprio aparelho
  const handleAbrirCapturaOCR = async () => {
    setModalEscolhaFABAberto(false);
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permissão necessária', 'É preciso permitir acesso às fotos.');
        return;
      }

      const pickerResult = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
      });

      if (!pickerResult.canceled && pickerResult.assets && pickerResult.assets.length > 0) {
        const uri = pickerResult.assets[0].uri;
        cancelarTimerOCR();
        setDiaLancamentoIdx(diaSelecionadoIdx); // o print vale para o dia selecionado no gráfico
        setModalGanhoAberto(true);
        setAnalisandoOCR(true);
        setOcrConfirmacaoPronta(false);

        const res = await processarOCRLocal(uri);
        const val = res.valorMetaExtrado ?? 0;
        setValorExtraidoOCR(val);
        setValorDigitado(val > 0 ? val.toFixed(2) : '');

        timerOCR.current = setTimeout(() => {
          timerOCR.current = null;
          setAnalisandoOCR(false);
          setOcrConfirmacaoPronta(true);
        }, 1000);
      }
    } catch {
      setAnalisandoOCR(false);
    }
  };

  const handleDigitarGanhoManual = () => {
    setModalEscolhaFABAberto(false);
    abrirModalParaDia(diaSelecionadoIdx);
  };

  // ─── GESTÃO DE DÍVIDAS (SALVAR / EXCLUIR) ───────────────────────────────────
  const handleAbrirNovaDivida = (tipo: TipoDivida) => {
    setTipoDividaNovo(tipo);
    setFrequenciaImprevistoNovo('anual');
    setDescricaoDividaInput('');
    setValorDividaInput('');
    setModalDividaAberto(true);
  };

  const handleSalvarDivida = async () => {
    const valorNum = parseValorDigitado(valorDividaInput);
    if (valorNum <= 0) {
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

    Alert.alert('Dívida Registrada!', 'A dívida anual projetada foi recalculada automaticamente.');
  };

  const handleExcluirDivida = (id: string, desc: string) => {
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

  // ─── META BASE ──────────────────────────────────────────────────────────────
  const handleAbrirMetaBase = () => {
    setNovaMetaBaseInput(metaDiariaBase.toString());
    setModalMetaBaseAberto(true);
  };

  const handleSalvarNovaMetaBase = async () => {
    const novaBase = parseValorDigitado(novaMetaBaseInput);
    if (novaBase <= 0) {
      Alert.alert('Valor Inválido', 'A meta diária precisa ser maior que zero.');
      return;
    }

    setMetaDiariaBase(novaBase); // a semana é recalculada com a nova base (useMemo)
    await salvarMetaBaseLocal(novaBase);
    setModalMetaBaseAberto(false);

    Alert.alert('Meta Base Atualizada!', `Sua meta diária base agora é de R$ ${novaBase.toFixed(2)}.`);
  };

  // ─── PROPS PRONTAS DOS MODAIS ───────────────────────────────────────────────
  const modalDivida: ModalDividaProps = {
    visivel: modalDividaAberto,
    tipo: tipoDividaNovo,
    frequencia: frequenciaImprevistoNovo,
    descricao: descricaoDividaInput,
    valor: valorDividaInput,
    onAlterarFrequencia: setFrequenciaImprevistoNovo,
    onAlterarDescricao: setDescricaoDividaInput,
    onAlterarValor: setValorDividaInput,
    onSalvar: handleSalvarDivida,
    onFechar: () => setModalDividaAberto(false),
  };

  const modalMetaBase: ModalMetaBaseProps = {
    visivel: modalMetaBaseAberto,
    valor: novaMetaBaseInput,
    onAlterarValor: setNovaMetaBaseInput,
    onSalvar: handleSalvarNovaMetaBase,
    onFechar: () => setModalMetaBaseAberto(false),
  };

  const modalEscolhaFAB: ModalEscolhaFABProps = {
    visivel: modalEscolhaFABAberto,
    onEscanearOCR: handleAbrirCapturaOCR,
    onDigitarManual: handleDigitarGanhoManual,
    onFechar: () => setModalEscolhaFABAberto(false),
  };

  const modalLancarGanho: ModalLancarGanhoProps = {
    visivel: modalGanhoAberto,
    diasSemana,
    diaLancamentoIdx,
    valorDigitado,
    salvando,
    analisandoOCR,
    ocrConfirmacaoPronta,
    valorExtraidoOCR,
    onSelecionarDia: (idx) => {
      setDiaLancamentoIdx(idx);
      setValorDigitado('');
    },
    onAlterarValor: setValorDigitado,
    onSalvar: handleExecutarSalvarGanho,
    onDigitarManualmente: () => setOcrConfirmacaoPronta(false),
    onFechar: fecharModalGanho,
  };

  return {
    // Dados
    metaDiariaBase,
    diasSemana,
    semanasMes,
    totalMes,
    dividas,
    historico,
    totalSemana,
    totalCobertoSemana,
    diasAmortizadosCompletos,
    estadoSync,
    // Seleções e atualização
    diaSelecionadoIdx,
    setDiaSelecionadoIdx,
    semanaMesSelecionadaIdx,
    setSemanaMesSelecionadaIdx,
    atualizando,
    onRefresh,
    // Ações disparadas pelas telas
    abrirModalParaDia,
    abrirMetaBase: handleAbrirMetaBase,
    abrirNovaDivida: handleAbrirNovaDivida,
    excluirDivida: handleExcluirDivida,
    abrirEscolhaFAB: () => setModalEscolhaFABAberto(true),
    // Modais
    modalDivida,
    modalMetaBase,
    modalEscolhaFAB,
    modalLancarGanho,
  };
}
