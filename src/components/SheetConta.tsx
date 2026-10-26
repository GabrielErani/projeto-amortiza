// Conta do usuário: e-mail, estado da nuvem, meta diária, sincronizar e sair.
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { circulo, cores, layout, opacidade, superficies, tamanho, textos } from '../theme';
import { EstadoSync, Usuario } from '../types';
import { formatarMoeda } from '../utils/formatacao';
import { Botao } from './Botao';
import { BottomSheet } from './BottomSheet';
import { corDoSync, rotuloSync } from './IndicadorSync';

interface Props {
  visivel: boolean;
  onFechar: () => void;
  usuario: Usuario | null;
  estadoSync: EstadoSync;
  metaBase: number;
  onSincronizar: () => void;
  onEditarMeta: () => void;
  onEntrar: () => void;
  onSair: () => void;
}

export function inicialDe(usuario: Usuario | null): string {
  const base = usuario?.nome?.trim() || usuario?.email?.trim() || '';
  return base ? base.charAt(0).toUpperCase() : '•';
}

export function SheetConta(p: Props) {
  const logado = !!p.usuario;
  return (
    <BottomSheet visivel={p.visivel} onFechar={p.onFechar}>
      <View style={[layout.linha, layout.gapMd]}>
        <View style={styles.avatar}>
          <Text style={textos.tituloSheet}>{inicialDe(p.usuario)}</Text>
        </View>
        {logado ? (
          <View style={layout.preencher}>
            <Text style={textos.subtitulo}>{p.usuario?.nome || 'Sua conta'}</Text>
            <Text style={textos.detalhe} numberOfLines={1}>{p.usuario?.email}</Text>
          </View>
        ) : (
          <Text style={[textos.detalhe, layout.preencher]}>
            <Text style={textos.forte}>Sem conta</Text>, o app funciona só neste aparelho.
          </Text>
        )}
      </View>

      <View>
        {logado ? <Linha rotulo="Nuvem" valor={rotuloSync(p.estadoSync)} cor={corDoSync(p.estadoSync.status)} /> : null}
        <Linha rotulo="Meta diária" valor={formatarMoeda(p.metaBase)} onPress={p.onEditarMeta} />
      </View>

      {logado ? (
        <>
          <Botao
            titulo="Sincronizar agora"
            variante="secundario"
            onPress={p.onSincronizar}
            carregando={p.estadoSync.status === 'sincronizando'}
          />
          <Botao titulo="Sair da conta" variante="perigo" onPress={p.onSair} />
        </>
      ) : (
        <Botao titulo="Entrar ou criar conta" onPress={p.onEntrar} />
      )}
    </BottomSheet>
  );
}

function Linha({ rotulo, valor, cor = cores.texto, onPress }: { rotulo: string; valor: string; cor?: string; onPress?: () => void }) {
  const conteudo = (
    <>
      <Text style={[textos.corpoSuave, layout.preencher]}>{rotulo}</Text>
      <Text style={[textos.corpo, styles.valor, { color: cor }]} numberOfLines={1}>{valor}</Text>
      {onPress ? <Text style={textos.corpoSuave}>›</Text> : null}
    </>
  );
  if (!onPress) return <View style={superficies.linhaDivisoria}>{conteudo}</View>;
  return (
    <TouchableOpacity
      style={superficies.linhaDivisoria}
      onPress={onPress}
      activeOpacity={opacidade.toque}
      accessibilityRole="button"
      accessibilityLabel={`${rotulo}, ${valor}`}
      accessibilityHint="Alterar"
    >
      {conteudo}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  avatar: { ...circulo(tamanho.avatarGrande), borderWidth: 1, borderColor: cores.borda },
  valor: { flexShrink: 1, fontWeight: '600' },
});
