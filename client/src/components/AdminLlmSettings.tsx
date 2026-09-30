import { trpc } from "@/lib/trpc";
import { CircleAlert, CircleCheck, KeyRound, Save, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

export function AdminLlmSettings() {
  const settingsQuery = trpc.admin.llmSettings.get.useQuery();
  const saveMutation = trpc.admin.llmSettings.save.useMutation({
    onSuccess: result => {
      setStatus(result.settings.configured ? "Configuração salva com segurança." : "Configuração salva.");
      setApiKey("");
      void settingsQuery.refetch();
    },
    onError: error => setError(error.message),
  });
  const [provider, setProvider] = useState("deepseek");
  const [baseUrl, setBaseUrl] = useState("https://api.deepseek.com");
  const [model, setModel] = useState("deepseek-flash");
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const settings = settingsQuery.data;
    if (!settings) return;
    if (settings.provider) setProvider(settings.provider);
    if (settings.baseUrl) setBaseUrl(settings.baseUrl);
    if (settings.model) setModel(settings.model);
  }, [settingsQuery.data]);

  const save = () => {
    setStatus("");
    setError("");
    if (!apiKey.trim()) {
      setError("Informe a chave atual do provedor para salvar a configuração.");
      return;
    }
    saveMutation.mutate({
      provider: provider.trim(),
      baseUrl: baseUrl.trim(),
      model: model.trim(),
      apiKey: apiKey.trim(),
    });
  };

  return (
    <section className="module-page admin-settings-page">
      <div className="module-hero">
        <div>
          <p className="eyebrow accent">ADMINISTRAÇÃO</p>
          <h2>Configuração do agente</h2>
          <p>
            Configure o provedor LLM sem acessar o painel de infraestrutura. A chave
            é criptografada no backend antes de ser persistida no Aiven.
          </p>
        </div>
        <div className="module-icon"><ShieldCheck size={22} /></div>
      </div>

      <div className="admin-settings-grid">
        <div className="panel admin-settings-card">
          <div className="panel-heading">
            <div>
              <h3>Provedor LLM</h3>
              <p>{settingsQuery.data?.configured ? `Configurado: ${settingsQuery.data.provider} · ${settingsQuery.data.model}` : "Ainda não configurado"}</p>
            </div>
            <KeyRound size={18} />
          </div>
          <div className="admin-settings-form">
            <label>
              <span>Nome do provedor</span>
              <input value={provider} onChange={event => setProvider(event.target.value)} placeholder="openrouter" />
            </label>
            <label>
              <span>URL base</span>
              <input value={baseUrl} onChange={event => setBaseUrl(event.target.value)} placeholder="https://openrouter.ai/api/v1" />
            </label>
            <label>
              <span>Modelo</span>
              <input value={model} onChange={event => setModel(event.target.value)} placeholder="openai/gpt-5-mini" />
            </label>
            <label>
              <span>Chave API <small>não é exibida depois de salva</small></span>
              <input type="password" value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder="Cole a chave do provedor" autoComplete="new-password" />
            </label>
            <div className="admin-settings-actions">
              <button className="primary-button" onClick={save} disabled={saveMutation.isPending}>
                <Save size={15} /> {saveMutation.isPending ? "Salvando..." : "Salvar configuração"}
              </button>
              {status && <span className="form-success"><CircleCheck size={15} /> {status}</span>}
              {error && <span className="form-error"><CircleAlert size={15} /> {error}</span>}
            </div>
          </div>
        </div>

        <div className="module-card admin-settings-note">
          <span className="eyebrow">PROTEÇÃO</span>
          <strong>A chave não vai para o navegador</strong>
          <p>
            O formulário usa HTTPS e envia a chave apenas ao backend autenticado.
            O valor é armazenado cifrado com AES-256-GCM usando o segredo do servidor;
            as consultas de status mostram somente provedor, URL e modelo.
          </p>
          <p>
            Use um modelo que declare suporte a <code>tools</code> e <code>tool_choice</code>.
            A configuração da DeepSeek usa <code>https://api.deepseek.com</code> e pode usar <code>deepseek-flash</code>. O Arquimedes também usa JSON estruturado para revisar a EAP.
          </p>
        </div>
      </div>
    </section>
  );
}
