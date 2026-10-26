// Estado da sincronização com a nuvem para exibir na UI.
import { useEffect, useState } from 'react';
import { obterEstadoSync, observarEstadoSync } from '../services/sync';
import { EstadoSync } from '../types';

export function useSync(): EstadoSync {
  const [estado, setEstado] = useState<EstadoSync>(() => obterEstadoSync());

  useEffect(() => observarEstadoSync(setEstado), []);

  return estado;
}
