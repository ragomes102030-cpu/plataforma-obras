import { trpc } from "@/lib/trpc";
import { Activity, ClipboardCheck, Plus, RefreshCw, Users } from "lucide-react";
import { useMemo, useState } from "react";

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function ProductionView({
  projectId,
  projectName,
}: {
  projectId: number;
  projectName: string;
}) {
  const utils = trpc.useUtils();
  const activitiesQuery = trpc.projects.activities.useQuery({ projectId });
  const frontsQuery = trpc.production.fronts.useQuery({ projectId });
  const teamsQuery = trpc.production.teams.useQuery({ projectId });
  const unitsQuery = trpc.production.units.useQuery({ projectId });
  const entriesQuery = trpc.production.entries.useQuery({ projectId });
  const initializeMutation = trpc.projects.initializePlan.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.production.fronts.invalidate({ projectId }),
        utils.production.teams.invalidate({ projectId }),
        utils.production.units.invalidate({ projectId }),
      ]);
    },
  });
  const createMutation = trpc.production.createEntry.useMutation({
    onSuccess: async () => {
      setQuantity("");
      setNotes("");
      await utils.production.entries.invalidate({ projectId });
    },
  });
  const fronts = frontsQuery.data ?? [];
  const teams = teamsQuery.data ?? [];
  const units = unitsQuery.data ?? [];
  const activities = activitiesQuery.data ?? [];
  const entries = entriesQuery.data ?? [];
  const [productionDate, setProductionDate] = useState(today);
  const [frontId, setFrontId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [activityId, setActivityId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [measurementUnit, setMeasurementUnit] = useState("m²");
  const [notes, setNotes] = useState("");
  const canSubmit = Boolean(
    frontId && teamId && unitId && activityId && quantity
  );
  const names = useMemo(
    () => ({
      fronts: new Map(fronts.map(item => [item.id, item.name])),
      teams: new Map(teams.map(item => [item.id, item.name])),
      units: new Map(units.map(item => [item.id, item.name])),
      activities: new Map(activities.map(item => [item.id, item.name])),
    }),
    [fronts, teams, units, activities]
  );

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    createMutation.mutate({
      projectId,
      frontId: Number(frontId),
      teamId: Number(teamId),
      unitId: Number(unitId),
      activityId: Number(activityId),
      productionDate,
      quantity: Number(quantity),
      measurementUnit,
      notes: notes || undefined,
      status: "rascunho",
    });
  };

  const catalogEmpty = !fronts.length || !teams.length || !units.length;

  return (
    <div className="module-page">
      <div className="module-hero">
        <div className="module-icon">
          <Activity size={22} />
        </div>
        <div>
          <p className="eyebrow accent">CONTROLE DIÁRIO</p>
          <h2>Produção diária</h2>
          <p>
            {projectName} · registre o realizado por frente, equipe e unidade.
          </p>
        </div>
        <div className="module-card production-readonly-note">
          <ClipboardCheck size={15} /> Lançamentos começam como rascunho
        </div>
      </div>

      {catalogEmpty && !frontsQuery.isPending ? (
        <div className="module-card production-empty-card">
          <Users size={20} />
          <div>
            <strong>Catálogo operacional ainda não montado</strong>
            <p>
              Crie as frentes, equipes e unidades iniciais para começar a
              registrar produção.
            </p>
          </div>
          <button
            className="primary-button"
            disabled={initializeMutation.isPending}
            onClick={() => initializeMutation.mutate({ projectId })}
          >
            <RefreshCw size={14} />{" "}
            {initializeMutation.isPending
              ? "Montando..."
              : "Montar catálogo inicial"}
          </button>
        </div>
      ) : (
        <div className="production-layout">
          <form className="module-card production-form" onSubmit={submit}>
            <div className="panel-heading production-heading">
              <div>
                <h3>Novo lançamento</h3>
                <p>Informe o que foi produzido no período.</p>
              </div>
              <Plus size={17} className="sparkle" />
            </div>
            <div className="production-form-grid">
              <label>
                Data
                <input
                  type="date"
                  value={productionDate}
                  onChange={event => setProductionDate(event.target.value)}
                />
              </label>
              <label>
                Quantidade
                <input
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={quantity}
                  onChange={event => setQuantity(event.target.value)}
                  placeholder="0,000"
                />
              </label>
              <label>
                Unidade
                <select
                  value={measurementUnit}
                  onChange={event => setMeasurementUnit(event.target.value)}
                >
                  <option>m²</option>
                  <option>m³</option>
                  <option>un</option>
                  <option>kg</option>
                  <option>m</option>
                </select>
              </label>
              <label>
                Frente
                <select
                  value={frontId}
                  onChange={event => setFrontId(event.target.value)}
                >
                  <option value="">Selecione</option>
                  {fronts.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.code} · {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Equipe
                <select
                  value={teamId}
                  onChange={event => setTeamId(event.target.value)}
                >
                  <option value="">Selecione</option>
                  {teams.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {item.trade}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Unidade de produção
                <select
                  value={unitId}
                  onChange={event => setUnitId(event.target.value)}
                >
                  <option value="">Selecione</option>
                  {units.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.code} · {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="production-field-wide">
                Atividade do cronograma
                <select
                  value={activityId}
                  onChange={event => setActivityId(event.target.value)}
                >
                  <option value="">Selecione a atividade</option>
                  {activities.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.wbsCode} · {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="production-field-wide">
                Observação
                <textarea
                  value={notes}
                  onChange={event => setNotes(event.target.value)}
                  placeholder="Ocorrência, impedimento ou evidência de campo..."
                  rows={3}
                />
              </label>
            </div>
            <div className="production-form-footer">
              {createMutation.error && (
                <span className="form-error">
                  {createMutation.error.message}
                </span>
              )}
              {createMutation.isSuccess && (
                <span className="form-success">
                  Lançamento salvo como rascunho.
                </span>
              )}
              <button
                className="primary-button"
                disabled={!canSubmit || createMutation.isPending}
              >
                {createMutation.isPending ? "Salvando..." : "Salvar rascunho"}
              </button>
            </div>
          </form>

          <section className="module-card production-history">
            <div className="panel-heading production-heading">
              <div>
                <h3>Últimos lançamentos</h3>
                <p>{entries.length} registros nesta obra</p>
              </div>
            </div>
            {entries.length === 0 ? (
              <div className="module-empty">Ainda não há produção lançada.</div>
            ) : (
              <div className="production-entry-list">
                {entries.map(entry => (
                  <div className="production-entry" key={entry.id}>
                    <div>
                      <strong>
                        {names.activities.get(entry.activityId) ?? "Atividade"}
                      </strong>
                      <span>
                        {new Date(entry.productionDate).toLocaleDateString(
                          "pt-BR"
                        )}{" "}
                        · {names.fronts.get(entry.frontId) ?? "Frente"} ·{" "}
                        {names.units.get(entry.unitId) ?? "Unidade"}
                      </span>
                    </div>
                    <div className="production-entry-quantity">
                      <strong>{entry.quantity}</strong>
                      <span>
                        {entry.measurementUnit} · {entry.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
