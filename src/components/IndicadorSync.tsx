import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ALVO_TOQUE, cores, expandirToque, opacidade, ponto, superficies, tamanho, textos } from '../theme';
import { EstadoSync, StatusSync } from '../types';

interface Props {
  estado: EstadoSync;
  onPress: () => void;
  compacto?: boolean;
}

const ROTULOS: Record<StatusSync, string> = {
  sem_conta: 'Sem conta',
  offline: 'Offline',
  sincronizando: 'Sincronizando',
  ok: 'Sincronizado',
  erro: 'Erro de sync',
};

const CORES: Record<StatusSync, string> = {
  sem_conta: cores.textoApagado,
  offline: cores.alerta,
  sincronizando: cores.info,
  ok: cores.primaria,
  erro: cores.erro,
};

/** Cor que representa o estado da nuvem (ponto do chip e valor na folha da conta). */
export function corDoSync(status: StatusSync): string {
  return CORES[status];
}

export function rotuloSync(estado: EstadoSync): string {
  if (estado.status === 'sem_conta') return 'Sem conta — toque para entrar';
  if (estado.status === 'ok' && estado.ultimaSync) {
    const d = new Date(estado.ultimaSync);
    return `Sincronizado às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  }
  return estado.mensagem || ROTULOS[estado.status];
}

export function IndicadorSync({ estado, onPress, compacto = true }: Props) {
  const cor = CORES[estado.status];
  return (
    <TouchableOpacity
      style={superficies.chip}
      onPress={onPress}
      activeOpacity={opacidade.toque}
      hitSlop={expandirToque(tamanho.chip, ALVO_TOQUE)}
      accessibilityRole="button"
    >
      {estado.status === 'sincronizando' ? (
        <ActivityIndicator size="small" color={cor} style={styles.spinner} />
      ) : (
        <View style={ponto(cor)} />
      )}
      <Text style={styles.texto} numberOfLines={1}>
        {compacto ? ROTULOS[estado.status] : rotuloSync(estado)}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  spinner: { width: tamanho.ponto, height: tamanho.ponto, transform: [{ scale: 0.7 }] },
  texto: { ...textos.mini, color: cores.textoSuave },
});
