<div align="center">

# ⚡ Amortiza — App de Recálculo de Metas & Carteira Macro

  <p align="center">
    <strong>Aplicativo financeiro minimalista para acompanhamento de ganhos operacionais, amortização em cascata e controle macro de dívidas.</strong>
  </p>

  <p align="center">
    <a href="https://reactnative.dev/docs/getting-started"><img src="https://img.shields.io/badge/React_Native-0.88-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React Native"></a>
    <a href="https://docs.expo.dev/"><img src="https://img.shields.io/badge/Expo_SDK-58-000000?style=for-the-badge&logo=expo&logoColor=white" alt="Expo SDK 58"></a>
    <a href="https://react-native-async-storage.github.io/async-storage/"><img src="https://img.shields.io/badge/AsyncStorage-Offline_First-8A2BE2?style=for-the-badge&logo=react" alt="AsyncStorage"></a>
    <a href="https://supabase.com/docs"><img src="https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase"></a>
    <a href="https://developers.google.com/ml-kit/vision/text-recognition/v2"><img src="https://img.shields.io/badge/Google_ML_Kit-OCR_OnDevice-4285F4?style=for-the-badge&logo=google&logoColor=white" alt="Google ML Kit"></a>
    <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-Strict-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript"></a>
  </p>

</div>

---

## 📌 Sobre o Projeto

O **Amortiza** é uma solução mobile desenvolvida para motoristas, autônomos e prestadores de serviço que buscam praticidade no acompanhamento diário de resultados, na **amortização inteligente de metas semanais** e no **controle macro de dívidas**.

O aplicativo combina um dashboard operacional ágil estilo Uber com uma carteira estratégica completa, permitindo lançar valores de forma 100% manual e automática, ou via **OCR On-Device** com conformidade com a LGPD.

---

## ✨ Funcionalidades Implementadas (100% Configuradas)

### 1. Dashboard Operacional Semanal
* 📊 **Gráfico de Barras com Amortização por Fases:** As 7 colunas (Segunda a Domingo) mostram o percentual amortizado de cada fase da semana em tempo real.
* ⚡ **Regra Amortiza em Cascata:** Se a meta diária é R$ 100 e você faz R$ 250 na Segunda-feira:
  * **Segunda:** 100% batida ✓
  * **Terça:** 100% amortizada adiantada ✓
  * **Quarta:** 50% amortizada adiantada!
  * **Quinta em diante:** 0% a realizar.
* ✍️ **Lançamento Manual Configurado 100%:**
  * **Data 100% Automática:** Captura a data atual do celular sem necessidade de digitar textos.
  * **Seletor de Dias em 1 Toque:** Pílulas de seleção rápida de Segunda a Domingo.
  * **Acumulação Inteligente:** Lançamentos adicionais somam ao dia existente (ex: R$ 100 + R$ 50 = R$ 150) ou substituem com feedback visual.
  * **Atalhos Rápidos de Valor:** Botões `[+50]`, `[+100]`, `[+150]`, `[+200]` e `[Limpar]`.

### 2. Tela Carteira (Visão Macro de Controle)
* 💼 **Visão Macro de Ganhos:**
  * Card com o total acumulado da **Semana Atual**.
  * Card com o **Total do Mês** consolidado de todas as semanas.
  * Carrossel horizontal para navegar entre todas as semanas do mês.
* 📉 **Gestão Completa de Dívidas & Custos:**
  * **⚡ Dívida Anual Projetada (Automática):** Atualização instantânea com a fórmula:
    $$\text{Dívida Anual} = (\text{Diárias} \times 365) + (\text{Mensais} \times 12) + \text{Imprevistos Anualizados}$$
  * **Dívidas Diárias:** Custos diários (ex: combustível, alimentação) com cálculo de impacto anual.
  * **Dívidas Mensais:** Custos fixos recorrentes (ex: parcela do veículo, seguro, planos).
  * **Dívidas Imprevistas:** Gastos extraordinários com configuração de frequência (diária, mensal ou anual/única).

### 3. Login, Cadastro e Sincronização na Nuvem 🔐
* 👤 **Conta por e-mail e senha (Supabase Auth):** cadastro com nome, login, recuperação de senha e sessão persistida no aparelho.
* ☁️ **Sincronização bidirecional (last-write-wins):** ganhos, dívidas e meta diária são mesclados entre aparelho e nuvem usando o horário da última alteração. Exclusões também sincronizam (soft delete).
* 🔒 **Dados isolados por usuário:** todas as tabelas usam Row Level Security, então cada pessoa só enxerga e altera o que é dela.
* 📱 **Offline-First:** tudo é salvo primeiro no AsyncStorage. Sem internet, o app segue funcionando e sincroniza sozinho quando a conexão volta. Também é possível usar sem conta (somente local).

---

## ⚙️ Configurar o Supabase (obrigatório para o modo online)

Sem esta etapa o app funciona apenas no modo local: a sincronização mostrará **"Banco não configurado"**.

1. **Crie um projeto** em [supabase.com/dashboard](https://supabase.com/dashboard) (plano gratuito basta).
2. **Crie as tabelas:** abra **SQL Editor → New query**, cole o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e clique em **Run**. O script é idempotente e cria as tabelas `perfis`, `ganhos`, `dividas` e `configuracoes`, as policies de RLS e o trigger que cria o perfil no cadastro.
3. **Habilite o login por e-mail:** em **Authentication → Providers → Email**, deixe o provedor ativado.
   * Para testar sem precisar abrir o e-mail, desligue **"Confirm email"**. Em produção, mantenha ligado.
4. **Copie as credenciais:** em **Project Settings → API**, copie a **Project URL** e a **Publishable key** (`sb_publishable_...`).
5. **Crie o arquivo `.env`** na raiz do projeto a partir do `.env.example`:

```env
EXPO_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_XXXXXXXX
```

6. Reinicie o Expo com cache limpo (`npx expo start -c`) para as variáveis serem lidas.

> **Como o sync funciona:** `src/services/storage.ts` grava localmente e chama `agendarSync()`; `src/services/sync.ts` compara `atualizadoEm` de cada registro com a nuvem (`src/services/supabase.ts`) e envia/recebe apenas o que estiver mais novo. A autenticação fica em `src/services/auth.ts`.

---

## 🛠️ Tecnologias Utilizadas

* **Front-end Mobile:** [React Native](https://reactnative.dev/docs/getting-started) com [Expo SDK 58](https://docs.expo.dev/)
* **Linguagem:** [TypeScript](https://www.typescriptlang.org/)
* **Armazenamento Local:** [AsyncStorage](https://react-native-async-storage.github.io/async-storage/)
* **Autenticação:** [Supabase Auth](https://supabase.com/docs/guides/auth) (e-mail e senha)
* **Backend & Banco de Dados:** [Supabase Client](https://supabase.com/docs/reference/javascript/initializing) (PostgreSQL com Row Level Security)
* **Motor de OCR Local:** [Google ML Kit Text Recognition v2](https://developers.google.com/ml-kit/vision/text-recognition/v2)

---

## 🚀 Como Executar o Projeto

```powershell
# 1. Clonar o repositório
git clone https://github.com/GabrielErani/projeto-amortiza.git
cd projeto-amortiza

# 2. Instalar dependências
npm install --legacy-peer-deps

# 3. (Opcional) Configurar a nuvem: copie .env.example para .env e preencha
#    Veja a seção "Configurar o Supabase" acima

# 4. Iniciar o servidor Expo com cache limpo
npx expo start -c
```

Abra o aplicativo **Expo Go** no celular e escaneie o QR Code exibido no terminal.
