import { trpc } from "@/lib/trpc";
import { CheckCircle2, Flag, Plus } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { NAV_PATHS } from "@/nav-paths";

export function FrentesView({
  projectId,
  projectName,
}: {
  projectId: number;
  projectName: string;
}) {
  const utils = trpc.useUtils();
  const [, navigate] = useLocation();
  const frontsQuery = trpc.production.fronts.useQuery({ projectId });
  const entriesQuery = trpc.production.entries.useQuery({ projectId });
  const wbsQuery = trpc.projects.wbs.useQuery({ projectId });
  const activitiesQuery = trpc.projects.activities.useQuery({ projectId });
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");

  const createFront = trpc.production.createFront.useMutation({
    onSuccess: async () => {
      setCode("");
      setName("");
      setLocation("");
      await utils.production.fronts.invalidate({ projectId });
    },
  });

  const fronts = frontsQuery.data ?? [];
  const entries = entriesQuery.data ?? [];
  const planningReady =
    (wbsQuery.data?.length ?? 0) > 0 && (activitiesQuery.data?.length ?? 0) > 0;

  const productionByFront = new Map<number, number>();
  for (const entry of entries) {
    const frontId = entry.frontId;
    productionByFront.set(
      frontId,
      (productionByFront.get(frontId) ?? 0) + Number(entry.quantity || 0)
    );
  }

  return (
    <div className="module-page">
      <div className="module-hero">
        <div className="module-icon">
          <Flag size={22} />
        </div>
        <div>
          <p className="eyebrow accent">FRENTES DE TRABALHO</p>
          <h2>Frentes</h2>
          <p>
            {projectName} · onde a execução acontece (código, nome e local/trecho).
          </p>
        </div>
        <span className="module-hero-status">
          <span />{" "}
          {fronts.length === 0
            ? "Sem frentes"
            : planningReady
              ? `${fronts.length} frente(s)`
              : "Aguardando EAP"}
        </span>
      </div>

      <div className="catalog-summary-grid">
        <div className="module-card budget-summary-card">
          <span className="eyebrow">CADASTRADAS</span>
          <strong>{fronts.length}</strong>
          <p>Frentes ativas na obra.</p>
        </div>
        <div className="module-card budget-summary-card">
          <span className="eyebrow">LANÇAMENTOS</span>
          <strong>{entries.length}</strong>
          <p>Registros de produção vinculados.</p>
        </div>
        <div className="module-card budget-summary-card budget-total-card">
          <span className="eyebrow">COM PRODUÇÃO</span>
          <strong>{productionByFront.size}</strong>
          <p>Frentes com quantidade lançada.</p>
        </div>
      </div>

      {!planningReady ? (
        <div className="module-card production-blocked-card">
          <Flag size={22} />
          <div>
            <strong>Frentes liberadas após EAP + cronograma</strong>
            <p>
              Monte a estrutura de escopo e o planejamento para operar frentes no
              fluxo completo de produção.
            </p>
          </div>
          <button
            type="button"
            className="outline-button"
            onClick={() => navigate(NAV_PATHS["EAP"])}
          >
            Abrir EAP
          </button>
          <button
            type="button"
            className="outline-button"
            onClick={() => navigate(NAV_PATHS["Cronogramas"])}
          >
            Cronogramas
          </button>
        </div>
      ) : null}

      <div className="module-card">
        <div className="panel-heading">
          <div>
            <h3>Nova frente</h3>
            <p>Referência operacional (padrão FRENT-xxx da planilha-modelo).</p>
          </div>
          <Plus size={17} className="sparkle" />
        </div>
        <form
          className="production-form-grid"
          onSubmit={event => {
            event.preventDefault();
            if (code && name)
              createFront.mutate({
                projectId,
                code,
                name,
                location: location || undefined,
              });
          }}
        >
          <label>
            Código
            <input
              value={code}
              onChange={event => setCode(event.target.value)}
              placeholder="FRENTE-001"
              required
            />
          </label>
          <label className="production-field-wide">
            Nome
            <input
              value={name}
              onChange={event => setName(event.target.value)}
              placeholder="Alvenaria estrutural"
              required
            />
          </label>
          <label className="production-field-wide">
            Local / trecho
            <input
              value={location}
              onChange={event => setLocation(event.target.value)}
              placeholder="Torre A · pavimentos 1–7"
            />
          </label>
          <div className="production-form-footer">
            {createFront.error && (
              <span className="form-error">{createFront.error.message}</span>
            )}
            {createFront.isSuccess && (
              <span className="form-success">Frente cadastrada.</span>
            )}
            <button
              className="primary-button"
              disabled={createFront.isPending}
            >
              <Plus size={14} />{" "}
              {createFront.isPending ? "Salvando..." : "Cadastrar frente"}
            </button>
          </div>
        </form>
      </div>

      <div className="module-card">
        <div className="panel-heading">
          <div>
            <h3>Frentes da obra</h3>
            <p>Produção acumulada por frente (lançamentos confirmados e rascunhos).</p>
          </div>
          <Flag size={16} className="sparkle" />
        </div>
        {frontsQuery.isPending ? (
          <div className="module-empty">Carregando frentes...</div>
        ) : fronts.length === 0 ? (
          <div className="module-empty">
            <CheckCircle2 size={20} />
            <span>
              <strong>Nenhuma frente ainda.</strong> Use o formulário acima
              (padrão FRENT-001) para criar a primeira frente de trabalho.
            </span>
          </div>
        ) : (
          <div className="planning-list">
            {fronts.map(front => (
              <div className="planning-row" key={front.id}>
                <div>
                  <strong>
                    {front.code} · {front.name}
                  </strong>
                  <span>{front.location || "Local não informado"}</span>
                </div>
                <b>
                  {(productionByFront.get(front.id) ?? 0).toLocaleString(
                    "pt-BR",
                    { maximumFractionDigits: 3 }
                  )}{" "}
                  un. lançadas
                </b>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
