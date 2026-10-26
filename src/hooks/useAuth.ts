// Sessão do usuário: observa o Supabase Auth e liga/desliga a sincronização.
import { useEffect, useRef, useState } from 'react';
import { observarSessao } from '../services/auth';
import { definirUsuarioSync, sincronizarTudo } from '../services/sync';
import { Usuario } from '../types';

export function useAuth() {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [carregandoSessao, setCarregandoSessao] = useState(true);
  const ultimoIdSincronizado = useRef<string | null>(null);

  useEffect(() => {
    const cancelar = observarSessao((u) => {
      setUsuario(u);
      setCarregandoSessao(false);
      definirUsuarioSync(u?.id ?? null);

      if (u && ultimoIdSincronizado.current !== u.id) {
        ultimoIdSincronizado.current = u.id;
        sincronizarTudo(u.id);
      }
      if (!u) ultimoIdSincronizado.current = null;
    });
    return cancelar;
  }, []);

  return { usuario, carregandoSessao };
}
