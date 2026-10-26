// Preferência "Continuar sem conta" (uso só local), persistida no aparelho.
// Documentação AsyncStorage: https://react-native-async-storage.github.io/async-storage/

import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const CHAVE_MODO_OFFLINE = '@amortiza_modo_offline_v1';

/**
 * `modoOffline` é null enquanto a flag é lida; depois true/false.
 * Falhas do AsyncStorage não bloqueiam o app (o estado em memória vale até reabrir).
 */
export function useModoOffline() {
  const [modoOffline, setModoOffline] = useState<boolean | null>(null);

  useEffect(() => {
    let ativo = true;
    AsyncStorage.getItem(CHAVE_MODO_OFFLINE)
      .then((valor) => {
        if (ativo) setModoOffline(valor === '1');
      })
      .catch(() => {
        if (ativo) setModoOffline(false);
      });
    return () => {
      ativo = false;
    };
  }, []);

  const ativarModoOffline = useCallback(async () => {
    setModoOffline(true);
    try {
      await AsyncStorage.setItem(CHAVE_MODO_OFFLINE, '1');
    } catch {
      // Mantém só em memória
    }
  }, []);

  const desativarModoOffline = useCallback(async () => {
    setModoOffline(false);
    try {
      await AsyncStorage.removeItem(CHAVE_MODO_OFFLINE);
    } catch {
      // Mantém só em memória
    }
  }, []);

  return { modoOffline, ativarModoOffline, desativarModoOffline };
}
