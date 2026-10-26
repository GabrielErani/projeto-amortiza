// Lançamento de ganho: dia, valor, atalhos, somar/substituir, OCR do print e confirmação do OCR.
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { cores, espaco, fonte, layout, opacidade, superficies, textos } from '../theme';
import { GanhoDia } from '../types';
import { formatarMoeda, parseValorDigitado } from '../utils/formatacao';
import { Botao } from './Botao';
import { BottomSheet } from './BottomSheet';
import { CampoTexto } from './CampoTexto';
import { PillSelector } from './PillSelector';
import { rotuloDia } from './rotulos';

export type ModoSalvar = 'somar' | 'substituir';

interface Props {
  visivel: boolean;
  onFechar: () => void;
  dias: GanhoDia[];
  diaIdx: number;
  onTrocarDia: (idx: number) => void;
  valorDigitado: string;
  onChangeValor: (v: string) => void;
  salvando: boolean;
  onSalvar: (modo: ModoSalvar) => void;
  // OCR
  onEscanearOCR: () => void;
  analisandoOCR: boolean;
  ocrPronto: boolean;
  valorOCR: number;
  onDigitarManual: () => void;
}

const ATALHOS = [50, 100, 150, 200];

export function ModalLancarGanho(p: Props) {
  const dia = p.dias[p.diaIdx] ?? p.dias[0];
  const nomeDia = dia ? rotuloDia(dia) : '';
  const jaExistente = dia?.valor || 0;
  const novo = parseValorDigitado(p.valorDigitado);

  if (p.analisandoOCR) {
    return (
      <BottomSheet visivel={p.visivel} onFechar={p.onFechar}>
        <View style={styles.leitura}>
          <ActivityIndicator size="large" color={cores.primaria} />
          <Text style={textos.subtitulo}>Lendo o print…</Text>
          <Text style={textos.legendaSuave}>OCR no aparelho, nada é enviado.</Text>
        </View>
      </BottomSheet>
    );
  }

  if (p.ocrPronto) {
    return (
      <BottomSheet visivel={p.visivel} onFechar={p.onFechar} titulo="Valor encontrado" subtitulo={`para ${nomeDia}`}>
        <Text style={[textos.hero, styles.valorLido]}>{formatarMoeda(p.valorOCR)}</Text>
        {jaExistente > 0 ? (
          <>
            <Botao
              titulo={`Somar aos ${formatarMoeda(jaExistente)} → ${formatarMoeda(jaExistente + p.valorOCR)}`}
              onPress={() => p.onSalvar('somar')}
              carregando={p.salvando}
            />
            <Botao
              titulo={`Substituir por ${formatarMoeda(p.valorOCR)}`}
              variante="secundario"
              onPress={() => p.onSalvar('substituir')}
              desabilitado={p.salvando}
            />
          </>
        ) : (
          <Botao titulo="Confirmar e salvar" onPress={() => p.onSalvar('substituir')} carregando={p.salvando} />
        )}
        <Botao titulo="Digitar manualmente" variante="texto" onPress={p.onDigitarManual} />
      </BottomSheet>
    );
  }

  return (
    <BottomSheet visivel={p.visivel} onFechar={p.onFechar} titulo="Lançar ganho" subtitulo={nomeDia}>
      <PillSelector
        opcoes={p.dias.map((d, i) => ({ valor: i, rotulo: d.sigla, destaque: d.isHoje }))}
        valor={p.diaIdx}
        onChange={(i) => {
          p.onTrocarDia(i);
          p.onChangeValor('');
        }}
      />
      <Text style={textos.legenda}>
        Já registrado: <Text style={textos.destaque}>{formatarMoeda(jaExistente)}</Text>
      </Text>
      <CampoTexto
        grande
        prefixo="R$"
        accessibilityLabel="Valor do ganho"
        keyboardType="numeric"
        value={p.valorDigitado}
        onChangeText={p.onChangeValor}
        placeholder="0,00"
        autoFocus
      />
      <View style={[layout.linha, layout.gapXs]}>
        {ATALHOS.map((v) => (
          <Atalho key={v} rotulo={`+${v}`} onPress={() => p.onChangeValor(String(v))} />
        ))}
        <Atalho rotulo="Limpar" suave onPress={() => p.onChangeValor('')} />
      </View>

      {jaExistente > 0 && novo > 0 ? (
        <>
          <Botao
            titulo={`Somar ${formatarMoeda(novo)} → total ${formatarMoeda(jaExistente + novo)}`}
            onPress={() => p.onSalvar('somar')}
            carregando={p.salvando}
          />
          <Botao
            titulo={`Substituir por ${formatarMoeda(novo)}`}
            variante="secundario"
            onPress={() => p.onSalvar('substituir')}
            desabilitado={p.salvando}
          />
        </>
      ) : (
        // Sem ganho no dia, "somar" a zero equivale a gravar o valor digitado.
        <Botao
          titulo={novo > 0 ? `Salvar ${formatarMoeda(novo)}` : 'Salvar ganho'}
          onPress={() => p.onSalvar('somar')}
          carregando={p.salvando}
          desabilitado={novo <= 0}
        />
      )}
      <Botao titulo="Escanear print (OCR)" variante="secundario" onPress={p.onEscanearOCR} desabilitado={p.salvando} />
      <Botao titulo="Cancelar" variante="texto" onPress={p.onFechar} />
    </BottomSheet>
  );
}

function Atalho({ rotulo, suave, onPress }: { rotulo: string; suave?: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[superficies.pilula, layout.preencher]} onPress={onPress} activeOpacity={opacidade.toque} accessibilityRole="button">
      <Text style={[styles.atalho, suave && styles.atalhoSuave]}>{rotulo}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  leitura: { ...layout.centro, gap: espaco.md, paddingVertical: espaco.xl },
  valorLido: { color: cores.primaria },
  atalho: { ...fonte.detalhe, ...textos.forte },
  atalhoSuave: { color: cores.textoSuave },
});
