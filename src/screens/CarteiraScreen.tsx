// Carteira: visão macro de ganhos (semana/mês) e gestão de dívidas com projeção anual.
import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { PillSelector } from '../components/PillSelector';
import { ALVO_TOQUE, cores, espaco, layout, opacidade, raio, superficies, textos } from '../theme';
import { DividaItem, SemanaMesInfo } from '../types';
import { anualizarDivida, calcularResumoDividas, rotuloFrequencia } from '../utils/dividas';
import { formatarMoeda, formatarMoedaCurta } from '../utils/formatacao';

type Tipo = DividaItem['tipo'];

interface Props {
  totalSemana: number;
  diasCobertos: number;
  semanasMes: SemanaMesInfo[];
  totalMes: number; // só dias do mês (somarGanhosDoMes)
  semanaSelecionadaIdx: number;
  onSelecionarSemana: (idx: number) => void;
  dividas: DividaItem[];
  onNovaDivida: (tipo: Tipo) => void;
  onExcluirDivida: (item: DividaItem) => void;
}

const SECOES: { tipo: Tipo; titulo: string; vazio: string; sufixo: string }[] = [
  { tipo: 'diaria', titulo: 'Gastos diários', vazio: 'Ex.: combustível, almoço.', sufixo: '/dia' },
  { tipo: 'mensal', titulo: 'Dívidas mensais', vazio: 'Ex.: parcela, seguro, plano.', sufixo: '/mês' },
  { tipo: 'imprevista', titulo: 'Imprevistos', vazio: 'Ex.: manutenção, multa.', sufixo: '' },
];

export function CarteiraScreen(p: Props) {
  const resumo = useMemo(() => calcularResumoDividas(p.dividas), [p.dividas]);
  const semanaSel = p.semanasMes[p.semanaSelecionadaIdx] ?? p.semanasMes[0];
  const totalDaSecao: Record<Tipo, string> = {
    diaria: `${formatarMoeda(resumo.totalDiario)}/dia`,
    mensal: `${formatarMoeda(resumo.totalMensal)}/mês`,
    imprevista: `${formatarMoeda(resumo.totalImprevistosAnualizado)}/ano`,
  };

  return (
    <View style={layout.gapLg}>
      <Text style={textos.rotuloMaiusculo}>Ganhos</Text>
      <View style={[layout.linha, layout.gapSm]}>
        <Resumo rotulo="Semana atual" valor={p.totalSemana} cor={cores.primaria} sub={`${p.diasCobertos}/7 metas batidas`} />
        <Resumo rotulo="Mês" valor={p.totalMes} cor={cores.info} sub={`${p.semanasMes.length} semanas`} />
      </View>
      <PillSelector
        rolavel
        opcoes={p.semanasMes.map((s, idx) => ({
          valor: idx,
          rotulo: s.rotulo,
          detalhe: formatarMoedaCurta(s.totalGanhos),
          destaque: s.isAtual,
          rotuloAcessivel: `${s.rotulo}, ${formatarMoeda(s.totalGanhos)}${s.isAtual ? ', semana atual' : ''}`,
        }))}
        valor={p.semanaSelecionadaIdx}
        onChange={p.onSelecionarSemana}
      />
      {semanaSel ? (
        <Text style={textos.legenda}>
          {semanaSel.rotulo}: <Text style={textos.destaque}>{formatarMoeda(semanaSel.totalGanhos)}</Text>
        </Text>
      ) : null}

      <Text style={textos.rotuloMaiusculo}>Dívidas</Text>
      <View style={superficies.cardBase}>
        <Text style={textos.legenda}>Projeção anual</Text>
        <Text style={[textos.display, styles.negativo]}>{formatarMoeda(resumo.totalAnualCalculado)}</Text>
        <View style={[layout.linha, layout.gapSm]}>
          <Parcela rotulo="Diárias ×365" valor={resumo.totalDiario * 365} />
          <Parcela rotulo="Mensais ×12" valor={resumo.totalMensal * 12} />
          <Parcela rotulo="Imprevistos" valor={resumo.totalImprevistosAnualizado} />
        </View>
      </View>

      {SECOES.map((sec) => {
        const itens = p.dividas.filter((d) => d.tipo === sec.tipo);
        return (
          <View key={sec.tipo} style={superficies.cardBase}>
            <View style={layout.linhaEntre}>
              <View>
                <Text style={textos.subtitulo}>{sec.titulo}</Text>
                <Text style={textos.legenda}>{totalDaSecao[sec.tipo]}</Text>
              </View>
              <TouchableOpacity
                style={[superficies.pilula, styles.adicionar]}
                onPress={() => p.onNovaDivida(sec.tipo)}
                activeOpacity={opacidade.toque}
                accessibilityRole="button"
              >
                <Text style={[textos.legenda, textos.destaque]}>+ Adicionar</Text>
              </TouchableOpacity>
            </View>

            {itens.length === 0 ? (
              <Text style={textos.legendaSuave}>{sec.vazio}</Text>
            ) : (
              itens.map((item) => (
                <View key={item.id} style={superficies.linhaDivisoria}>
                  <View style={layout.preencher}>
                    <Text style={textos.corpo}>{item.descricao}</Text>
                    <Text style={textos.mini}>
                      {sec.tipo === 'imprevista' ? `${rotuloFrequencia(item.frequenciaImprevisto)} · ` : ''}
                      {formatarMoedaCurta(anualizarDivida(item))}/ano
                    </Text>
                  </View>
                  <Text style={[textos.legenda, textos.forte, sec.tipo === 'imprevista' && styles.negativo]}>
                    {formatarMoeda(item.valor)}{sec.sufixo}
                  </Text>
                  <TouchableOpacity
                    style={styles.excluir}
                    onPress={() => p.onExcluirDivida(item)}
                    activeOpacity={opacidade.toque}
                    accessibilityRole="button"
                    accessibilityLabel={`Excluir ${item.descricao}`}
                  >
                    <Text style={textos.legendaSuave}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        );
      })}
    </View>
  );
}

function Resumo({ rotulo, valor, cor, sub }: { rotulo: string; valor: number; cor: string; sub: string }) {
  return (
    <View style={[superficies.cardBase, layout.preencher]}>
      <Text style={textos.legenda}>{rotulo}</Text>
      <Text style={[textos.titulo, { color: cor }]}>{formatarMoeda(valor)}</Text>
      <Text style={textos.mini}>{sub}</Text>
    </View>
  );
}

function Parcela({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <View style={styles.parcela}>
      <Text style={textos.mini}>{rotulo}</Text>
      <Text style={[textos.legenda, textos.forte]}>{formatarMoedaCurta(valor)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  negativo: { color: cores.erro },
  adicionar: { paddingHorizontal: espaco.md, backgroundColor: cores.primariaSuave },
  excluir: { ...layout.centro, width: ALVO_TOQUE, height: ALVO_TOQUE },
  parcela: { flex: 1, gap: espaco.xxs, padding: espaco.sm, borderRadius: raio.sm, backgroundColor: cores.superficieAlta },
});
