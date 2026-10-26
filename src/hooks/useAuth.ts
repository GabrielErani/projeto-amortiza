// Sessão do usuário: observa o Supabase Auth e liga/desliga a sincronização.
import { useEffect, useState } from 'react';
import { observarSessao } from '../services/auth';
import { definirUsuarioSync } from '../services/sync';
import { Usuario } from '../types';

export function useAuth() {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [carregandoSessao, setCarregandoSessao] = useState(true);

  useEffect(() => {
    const cancelar = observarSessao((u) => {
      setUsuario(u);
      setCarregandoSessao(false);
      // Ao mudar de usuário, definirUsuarioSync já dispara uma sincronização completa.
      definirUsuarioSync(u?.id ?? null);
    });
    return cancelar;
  }, []);

  return { usuario, carregandoSessao };
}
