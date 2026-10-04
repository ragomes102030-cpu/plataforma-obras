import { trpc } from "@/lib/trpc";
import { CircleAlert, CircleCheck, KeyRound, Save, ShieldCheck, GripVertical } from "lucide-react";
import { useEffect, useState } from "react";

type ProviderRow = {
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  enabled: boolean;
  label: string;
  badge?: string;
};

const PRESETS: ProviderRow[] = [
  {
    provider: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-flash",
    apiKey: "",
    enabled: true,
  },
  {
    provider: "openrouter-free",
    label: "OpenRouter",
    badge: "FREE ROUTER",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "openrouter/free",
    apiKey: "",
    enabled: true,
  },
  {
    provider: "opencode-free",
    label: "OpenCode",
    badge: "FREE",
    baseUrl: "https://opencode.ai/zen/v1",
    model: "nemotron-3.5-lightning-free",
    apiKey: "",
    enabled: true,
  },
  {
    provider: "google",
    label: "Google Gemini",
    badge: "FREE TIER",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
    model: "gemini-3.8-flash",
    apiKey: "",
    enabled: true,
  },
];

export function AdminLlmSettings() {
  const settingsQuery = trpc.admin.llmSettings.get.useQuery();
  const [providers, setProviders] = useState<ProviderRow[]>(PRESETS);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const saveMutation = trpc.admin.llmSettings.save.useMutation({
    onSuccess: result => {
      setStatus(result.settings.providers?.length
        ? `Rotação salva: ${result.settings.providers.length} provedores.`
        : "Configuração salva.");
      setProviders(current => current.map(provider => ({ ...provider, apiKey: "" })));
      void settingsQuery.refetch();
    },
    onError: error => setError(error.message),
  });

  useEffect(() => {
    const saved = settingsQuery.data?.providers;
    if (!saved?.length) return;
    setProviders(current => {
      const byName = new Map(current.map(item => [item.provider, item]));
      const merged = saved.map(item => ({
        ...(byName.get(item.provider) ?? {
          provider: item.provider,
          label: item.provider,
          badge: undefined,
          apiKey: "",
          enabled: true,
        }),
        ...item,
        apiKey: "",
        enabled: item.enabled !== false,
      }));
      const savedNames = new Set(saved.map(item => item.provider));
      return [
        ...merged,
        ...current.filter(item => !savedNames.has(item.provider)),
      ];
    });
  }, [settingsQuery.data]);

  const update = (index: number, patch: Partial<ProviderRow>) => {
    setProviders(current => current.map((item, i) => i === index ? { ...item, ...patch } : item));
  };

  const move = (index: number, direction: -1 | 1) => {
    setProviders(current => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const save = () => {
    setStatus("");
    setError("");
    const enabled = providers.filter(item => item.enabled);
    if (!enabled.length) {
      setError("Ative pelo menos um provedor.");
      return;
    }
    void (async () => {
      try {
        for (const provider of enabled) {
          const { label: _label, badge: _badge, ...payload } = provider;
          await saveMutation.mutateAsync(payload);
        }
        setStatus(`Rotação salva: ${enabled.length} provedor(es).`);
        await settingsQuery.refetch();
      } catch {
        // O onError da mutation já apresenta a mensagem ao usuário.
      }
    })();
  };

  return (
    <section className="module-page admin-settings-page">
      <div className="module-hero">
        <div>
          <p className="eyebrow accent">ARQUIMEDES · INTELIGÊNCIA</p>
          <h2>Provedores LLM e rotação</h2>
          <p>
            Defina a ordem em que o Arquimedes usa os modelos. Se um provedor
            atingir limite, quota, erro de autenticação ou indisponibilidade,
            o gateway tenta automaticamente o próximo.
          </p>
        </div>
        <div className="module-icon"><ShieldCheck size={22} /></div>
      </div>

      <div className="admin-settings-grid">
        <div className="panel admin-settings-card">
          <div className="panel-heading">
            <div>
              <h3>Fila de provedores</h3>
              <p>
                1º é o principal. Arraste no futuro ou use as setas para definir a prioridade.
              </p>
            </div>
            <KeyRound size={18} />
          </div>

          <div className="admin-llm-rotation">
            {providers.map((item, index) => (
              <div className={`admin-llm-provider ${item.enabled ? "" : "is-disabled"}`} key={item.provider}>
                <div className="admin-llm-order">
                  <GripVertical size={16} />
                  <strong>{index + 1}</strong>
                </div>

                <div className="admin-llm-main">
                  <div className="admin-llm-title">
                    <strong>{item.label}</strong>
                    {item.badge && <span className="admin-llm-badge">{item.badge}</span>}
                    <label className="admin-llm-toggle">
                      <input
                        type="checkbox"
                        checked={item.enabled}
                        onChange={event => update(index, { enabled: event.target.checked })}
                      />
                      ativo
                    </label>
                  </div>

                  <div className="admin-settings-form admin-llm-fields">
                    <label>
                      <span>URL base</span>
                      <input value={item.baseUrl} onChange={event => update(index, { baseUrl: event.target.value })} />
                    </label>
                    <label>
                      <span>Modelo</span>
                      <input value={item.model} onChange={event => update(index, { model: event.target.value })} />
                    </label>
                    <label className="admin-llm-key">
                      <span>Chave API <small>{item.provider === "opencode-free" ? "opcional para modelos Free" : "armazenada criptografada"}</small></span>
                      <input
                        type="password"
                        value={item.apiKey}
                        onChange={event => update(index, { apiKey: event.target.value })}
                        placeholder={item.provider === "opencode-free" ? "vazio para Free" : "Cole uma nova chave ou deixe vazio para preservar a atual"}
                        autoComplete="new-password"
                      />
                    </label>
                  </div>

                  <div className="admin-llm-reorder">
                    <button type="button" onClick={() => move(index, -1)} disabled={index === 0}>↑ subir</button>
                    <button type="button" onClick={() => move(index, 1)} disabled={index === providers.length - 1}>↓ descer</button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="admin-settings-actions">
            <button className="primary-button" onClick={save} disabled={saveMutation.isPending}>
              <Save size={15} /> {saveMutation.isPending ? "Salvando..." : "Salvar rotação"}
            </button>
            {status && <span className="form-success"><CircleCheck size={15} /> {status}</span>}
            {error && <span className="form-error"><CircleAlert size={15} /> {error}</span>}
          </div>
        </div>

        <div className="module-card admin-settings-note">
          <span className="eyebrow">COMO FUNCIONA</span>
          <strong>Rotação automática de quota</strong>
          <p>
            O Arquimedes começa no provedor 1. Em respostas 429, 402, 403,
            erros de servidor, timeout e falhas de conexão, ele tenta o próximo
            provedor ativo na ordem configurada.
          </p>
          <p>
            <strong>OpenRouter:</strong> o modelo <code>openrouter/free</code> roteia
            para modelos gratuitos disponíveis e compatíveis com os recursos da requisição.
          </p>
          <p>
            <strong>OpenCode:</strong> o preset usa um modelo Free do Zen. A lista
            de modelos gratuitos pode mudar no provedor, então o modelo pode ser trocado aqui.
          </p>
          <p>
            <strong>Google:</strong> o Gemini pode ser acessado pelo endpoint
            compatível com OpenAI; o uso gratuito depende dos limites da sua conta.
          </p>
          <p>
            As chaves nunca são devolvidas ao navegador. Ao deixar uma chave
            vazia durante uma edição, a configuração atual daquele provedor será preservada.
          </p>
        </div>
      </div>
    </section>
  );
}
