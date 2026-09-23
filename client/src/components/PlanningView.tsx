import { trpc } from "@/lib/trpc";
import { BarChart3, CalendarRange, GitBranch, Gauge, Plus, Users, Layers } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { NAV_PATHS } from "@/nav-paths";

const resourceLabels = { mao_de_obra: "Mão de obra", equipamento: "Equipamento", material: "Material" };

export function PlanningView({ projectId, projectName }: { projectId: number; projectName: string }) {
  const utils = trpc.useUtils();
  const [, navigate] = useLocation();
  const query = trpc.planning.list.useQuery({ projectId });
  const controlQuery = trpc.planning.control.useQuery({ projectId });
  const levelingQuery = trpc.planning.leveling.useQuery({ projectId });
  const [resourceName, setResourceName] = useState("");
  const [resourceType, setResourceType] = useState<"mao_de_obra" | "equipamento" | "material">("mao_de_obra");
  const [resourceUnit, setResourceUnit] = useState("equipe");
  const [capacity, setCapacity] = useState("");
  const [activityName, setActivityName] = useState("");
  const [activityCode, setActivityCode] = useState("");
  const [activityPhase, setActivityPhase] = useState("Execução");
  const [activityQuantity, setActivityQuantity] = useState("");
  const [activityProductivity, setActivityProductivity] = useState("");
  const [activityDuration, setActivityDuration] = useState("");
  const [predecessorId, setPredecessorId] = useState("");
  const [successorId, setSuccessorId] = useState("");
  const [baselineName, setBaselineName] = useState("");
  const refresh = () => utils.planning.list.invalidate({ projectId });
  const createResource = trpc.planning.createResource.useMutation({ onSuccess: async () => { setResourceName(""); setCapacity(""); await refresh(); } });
  const createActivity = trpc.planning.createActivity.useMutation({ onSuccess: async () => { setActivityName(""); setActivityCode(""); setActivityQuantity(""); setActivityProductivity(""); setActivityDuration(""); await refresh(); } });
  const generateFromEap = trpc.planning.generateFromEap.useMutation({ onSuccess: async () => { await refresh(); } });
  const createDependency = trpc.planning.createDependency.useMutation({ onSuccess: async () => { setPredecessorId(""); setSuccessorId(""); await refresh(); } });
  const calculateCpm = trpc.planning.calculateCpm.useMutation({ onSuccess: async () => { await refresh(); } });
  const captureBaseline = trpc.planning.captureBaseline.useMutation({ onSuccess: async () => { setBaselineName(""); await refresh(); } });
  const applyLevelShift = trpc.planning.applyLevelShift.useMutation({ onSuccess: async () => { await refresh(); await levelingQuery.refetch(); } });
  const resources = query.data?.resources ?? [];
  const activities = query.data?.activities ?? [];
  const dependencies = query.data?.dependencies ?? [];
  const baselines = query.data?.baselines ?? [];
  const control = controlQuery.data;
  const leveling = levelingQuery.data;
  const maxDemand = Math.max(1, ...(leveling?.histogram ?? []).map(point => point.demand), leveling?.capacity ?? 0);
  const heroStatus = query.isPending
    ? "Carregando"
    : activities.length === 0
      ? "Sem atividades"
      : activities.some(item => item.cpmCalculatedAt)
        ? "CPM calculado"
        : "Pronto para CPM";

  return <div className="module-page planning-page">
    <div className="module-hero"><div className="module-icon"><CalendarRange size={22} /></div><div><p className="eyebrow accent">PLANEJAMENTO FÍSICO</p><h2>Planejamento e rede</h2><p>{projectName} · atividades, recursos, produtividade e precedências.</p></div><span className="module-hero-status"><span /> {heroStatus}</span><div className="module-hero-actions"><button type="button" className="outline-button" onClick={() => navigate(NAV_PATHS["Linha de Balanço"])}>LOB</button><button type="button" className="outline-button" onClick={() => navigate(NAV_PATHS["Orçamento"])}>Orçamento</button></div></div>
    <div className="catalog-summary-grid"><div className="module-card budget-summary-card"><span className="eyebrow">ATIVIDADES</span><strong>{activities.length}</strong><p>Serviços planejados na obra.</p></div><div className="module-card budget-summary-card"><span className="eyebrow">RECURSOS</span><strong>{resources.length}</strong><p>Equipes, equipamentos e materiais.</p></div><div className="module-card budget-summary-card budget-total-card"><span className="eyebrow">CRÍTICAS</span><strong>{activities.filter(item => item.critical === 1).length}</strong><p>Atividades no caminho crítico persistido.</p></div></div>
    <section className="module-card cpm-panel"><div className="panel-heading"><div><h3>Cronograma calculado</h3><p>O CPM usa as durações e precedências cadastradas para calcular datas relativas e folgas.</p></div><Gauge size={18} className="sparkle" /></div><div className="cpm-actions"><button className="primary-button" disabled={calculateCpm.isPending || activities.length === 0} onClick={() => calculateCpm.mutate({ projectId })}><Gauge size={14} /> {calculateCpm.isPending ? "Calculando..." : "Calcular CPM"}</button><span>{activities.some(item => item.cpmCalculatedAt) ? `Último cálculo: ${new Date(activities.find(item => item.cpmCalculatedAt)?.cpmCalculatedAt ?? "").toLocaleString("pt-BR")}` : "Ainda não calculado"}</span></div>{calculateCpm.data && !calculateCpm.data.valid && <p className="form-error">Não foi possível calcular: {calculateCpm.data.issues.map(issue => issue.message).join("; ")}</p>}{calculateCpm.data?.valid && <div className="cpm-result"><div><span className="eyebrow">DURAÇÃO DO PROJETO</span><strong>{calculateCpm.data.projectDuration} dias</strong></div><div><span className="eyebrow">CAMINHO CRÍTICO</span><strong>{calculateCpm.data.criticalPath.length} atividades</strong></div><div className="cpm-path"><span className="eyebrow">SEQUÊNCIA</span><p>{calculateCpm.data.criticalPath.join(" → ") || "Nenhuma atividade crítica"}</p></div></div>}</section>
    <section className="module-card baseline-panel"><div className="panel-heading"><div><h3>Baseline do cronograma</h3><p>Congele o planejamento atual antes de iniciar o acompanhamento do realizado.</p></div><CalendarRange size={18} className="sparkle" /></div><form className="baseline-form" onSubmit={event => { event.preventDefault(); if (baselineName.trim()) captureBaseline.mutate({ projectId, name: baselineName.trim() }); }}><input value={baselineName} onChange={event => setBaselineName(event.target.value)} placeholder="Ex.: Baseline aprovado — outubro/2026" required /><button className="outline-button" disabled={captureBaseline.isPending || !activities.length}><Plus size={13} /> Capturar baseline</button></form>{captureBaseline.error && <p className="form-error">{captureBaseline.error.message}</p>}<div className="baseline-list">{baselines.map(baseline => <div className="planning-row" key={baseline.id}><div><strong>{baseline.name}</strong><span>{baseline.status} · criado em {new Date(baseline.createdAt).toLocaleDateString("pt-BR")}</span></div><b>{activities.length} atividades</b></div>)}{!baselines.length && <div className="module-empty"><span><strong>Nenhum baseline.</strong> Congele o planejamento antes de acompanhar o realizado.</span>{activities.length === 0 ? <button type="button" className="outline-button" onClick={() => navigate(NAV_PATHS["EAP"])}>Importar da EAP</button> : null}</div>}</div></section>
    <section className="module-card control-panel"><div className="panel-heading"><div><h3>Planejado versus realizado</h3><p>O realizado considera somente medições confirmadas. O planejado usa o CPM e a data de início da obra.</p></div><BarChart3 size={18} className="sparkle" /></div>{control && <><div className="control-summary"><div><span className="eyebrow">PLANEJADO</span><strong>{control.totals.plannedProgress}%</strong></div><div><span className="eyebrow">REALIZADO</span><strong>{control.totals.actualProgress}%</strong></div><div><span className="eyebrow">DESVIO</span><strong className={control.totals.variance < 0 ? "negative-variance" : "positive-variance"}>{control.totals.variance > 0 ? "+" : ""}{control.totals.variance} pp</strong></div></div><div className="control-list">{control.activities.map(activity => <div className="control-row" key={activity.id}><div><strong>{activity.wbsCode} · {activity.name}</strong><span>{activity.actualQuantity.toFixed(3)} realizado de {activity.plannedQuantity.toFixed(3)} · {activity.critical ? "atividade crítica" : activity.phase}</span></div><div className="control-bars"><div><i style={{ width: `${activity.plannedProgress}%` }} /><em style={{ width: `${activity.actualProgress}%` }} /></div><b className={activity.variance < 0 ? "negative-variance" : ""}>{activity.variance > 0 ? "+" : ""}{activity.variance} pp</b></div></div>)}{!control.activities.length && <div className="module-empty"><span>{activities.length ? "Informe quantidades planejadas nas atividades para ver o comparativo." : "Crie atividades e quantidades no formulário abaixo."}</span><a className="outline-button" href="#planning-activities">Ir para atividades</a></div>}</div></>}</section>
    <section className="module-card leveling-panel" id="planning-leveling">
      <div className="panel-heading">
        <div>
          <h3>Nivelamento de recursos (cap. 13)</h3>
          <p>Histograma diário de mão de obra, picos acima da capacidade e sugestões de deslocamento na folga total.</p>
        </div>
        <Layers size={18} className="sparkle" />
      </div>
      {levelingQuery.isPending ? (
        <div className="module-empty">Carregando nivelamento...</div>
      ) : !leveling || !leveling.available ? (
        <div className="module-empty">
          <span><strong>Sem dados.</strong> {leveling?.note ?? "Banco indisponível."}</span>
        </div>
      ) : (
        <>
          <div className="control-summary" style={{ marginBottom: 12 }}>
            <div>
              <span className="eyebrow">CAPACIDADE/DIA</span>
              <strong>{leveling.capacity || "—"}</strong>
            </div>
            <div>
              <span className="eyebrow">DIAS</span>
              <strong>{leveling.histogram.length}</strong>
            </div>
            <div>
              <span className="eyebrow">PICOS</span>
              <strong className={leveling.peaks.length ? "negative-variance" : "positive-variance"}>
                {leveling.peaks.length}
              </strong>
            </div>
          </div>
          {leveling.note ? <p style={{ fontSize: 12, opacity: 0.8, marginTop: 0 }}>{leveling.note}</p> : null}
          {leveling.histogram.length ? (
            <div className="lob-chart-frame" style={{ marginBottom: 12 }}>
              <div className="lob-chart-title">
                <span>Demanda × capacidade · dia 0 a {leveling.histogram.length - 1}</span>
                <span>Cap: {leveling.capacity}</span>
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 140, padding: "8px 0", position: "relative" }}>
                {leveling.histogram.map(point => {
                  const over = leveling.capacity > 0 && point.demand > leveling.capacity;
                  return (
                    <div
                      key={point.offset}
                      title={`Dia ${point.offset}: ${point.demand}${leveling.capacity ? ` / cap ${leveling.capacity}` : ""}`}
                      style={{
                        flex: 1,
                        minWidth: 4,
                        height: `${(point.demand / maxDemand) * 100}%`,
                        background: over ? "#a56b75" : "#4f7c8f",
                        borderRadius: "2px 2px 0 0",
                        opacity: point.demand > 0 ? 1 : 0.15,
                      }}
                    />
                  );
                })}
                {leveling.capacity > 0 ? (
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      bottom: `${(leveling.capacity / maxDemand) * 100}%`,
                      borderTop: "1px dashed #b78b58",
                      pointerEvents: "none",
                    }}
                  />
                ) : null}
              </div>
            </div>
          ) : null}
          {leveling.suggestions.length ? (
            <div className="planning-list">
              {leveling.suggestions.map(suggestion => (
                <div className="planning-row" key={suggestion.activityId}>
                  <div>
                    <strong>{suggestion.wbsCode} · {suggestion.name}</strong>
                    <span>
                      Deslocar do dia {suggestion.fromOffset} ao dia {suggestion.toOffset} · folga total {suggestion.float} dia(s)
                    </span>
                  </div>
                  <button
                    type="button"
                    className="outline-button"
                    disabled={applyLevelShift.isPending}
                    onClick={() =>
                      applyLevelShift.mutate({
                        projectId,
                        activityId: suggestion.activityId,
                        newStartOffset: suggestion.toOffset,
                      })
                    }
                  >
                    {applyLevelShift.isPending ? "..." : "Aplicar"}
                  </button>
                </div>
              ))}
            </div>
          ) : leveling.peaks.length ? (
            <div className="module-empty">
              <span><strong>Sem sugestões automáticas.</strong> Ajuste alocações ou calcule o CPM para obter folgas.</span>
            </div>
          ) : null}
          {applyLevelShift.error ? <p className="form-error">{applyLevelShift.error.message}</p> : null}
        </>
      )}
    </section>
    <div className="planning-grid">
      <section className="module-card"><div className="panel-heading"><div><h3>Novo recurso</h3><p>Cadastre a capacidade diária para calcular prazos realistas.</p></div><Users size={18} className="sparkle" /></div><form className="planning-form-grid" onSubmit={event => { event.preventDefault(); if (resourceName && resourceUnit) createResource.mutate({ projectId, name: resourceName, resourceType, unit: resourceUnit, capacityPerDay: capacity ? Number(capacity) : undefined }); }}><label>Nome<input value={resourceName} onChange={event => setResourceName(event.target.value)} placeholder="Equipe de alvenaria" required /></label><label>Tipo<select value={resourceType} onChange={event => setResourceType(event.target.value as typeof resourceType)}>{Object.entries(resourceLabels).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label><label>Unidade<input value={resourceUnit} onChange={event => setResourceUnit(event.target.value)} placeholder="equipe" required /></label><label>Capacidade/dia<input type="number" min="0.001" step="0.001" value={capacity} onChange={event => setCapacity(event.target.value)} placeholder="12,000" /></label><button className="primary-button" disabled={createResource.isPending}><Plus size={14} /> Cadastrar recurso</button></form><div className="planning-list">{resources.map(resource => <div className="planning-row" key={resource.id}><div><strong>{resource.name}</strong><span>{resourceLabels[resource.resourceType]} · {resource.unit}</span></div><b>{resource.capacityPerDay ? `${resource.capacityPerDay}/dia` : "capacidade pendente"}</b></div>)}{!resources.length && <div className="module-empty"><span><strong>Nenhum recurso.</strong> Cadastre a capacidade diária para calcular prazos realistas.</span></div>}</div></section>
      <section id="planning-activities" className="module-card"><div className="panel-heading"><div><h3>Nova atividade</h3><p>Quantidade e produtividade derivam a duração quando informadas. Ou gere de uma vez a partir das entregas da EAP.</p></div><CalendarRange size={18} className="sparkle" /></div><div className="cpm-actions" style={{ marginBottom: 12 }}><button type="button" className="outline-button" disabled={generateFromEap.isPending} onClick={() => generateFromEap.mutate({ projectId })}><Layers size={14} /> {generateFromEap.isPending ? "Gerando..." : "Gerar atividades da EAP"}</button>{generateFromEap.data && <span>{generateFromEap.data.message}</span>}{generateFromEap.error && <span className="form-error">{generateFromEap.error.message}</span>}</div><form className="planning-form-grid" onSubmit={event => { event.preventDefault(); if (activityName && activityCode && activityPhase) createActivity.mutate({ projectId, wbsCode: activityCode, name: activityName, phase: activityPhase, startOffset: 0, plannedQuantity: activityQuantity ? Number(activityQuantity) : undefined, productivity: activityProductivity ? Number(activityProductivity) : undefined, durationDays: activityDuration ? Number(activityDuration) : undefined }); }}><label>Código EAP<input value={activityCode} onChange={event => setActivityCode(event.target.value)} placeholder="1.2.3" required /></label><label className="planning-field-wide">Atividade<input value={activityName} onChange={event => setActivityName(event.target.value)} placeholder="Executar alvenaria" required /></label><label>Fase<input value={activityPhase} onChange={event => setActivityPhase(event.target.value)} placeholder="Execução" required /></label><label>Quantidade<input type="number" min="0.001" step="0.001" value={activityQuantity} onChange={event => setActivityQuantity(event.target.value)} placeholder="120,000" /></label><label>Produtividade<input type="number" min="0.001" step="0.001" value={activityProductivity} onChange={event => setActivityProductivity(event.target.value)} placeholder="12,000/dia" /></label><label>Duração<input type="number" min="1" step="1" value={activityDuration} onChange={event => setActivityDuration(event.target.value)} placeholder="Calculada" /></label><button className="primary-button" disabled={createActivity.isPending}><Plus size={14} /> Criar atividade</button></form><div className="planning-list">{activities.map(activity => <div className="planning-row" key={activity.id}><div><strong>{activity.wbsCode} · {activity.name}</strong><span>{activity.phase} · {activity.plannedQuantity ? `${activity.plannedQuantity} planejados` : "quantidade pendente"}{activity.earlyStart !== null && activity.earlyStart !== undefined ? ` · início ${activity.earlyStart} · folga ${activity.totalFloat ?? 0}d` : ""}</span></div><b className={activity.critical === 1 ? "critical-mark" : ""}>{activity.critical === 1 ? "CRÍTICA · " : ""}{activity.durationDays} dias</b></div>)}{!activities.length && <div className="module-empty"><span><strong>Nenhuma atividade ainda.</strong> Use “Gerar atividades da EAP” ou o formulário acima (código EAP + nome) para criar a primeira atividade da rede.</span></div>}</div></section>
    </div>
    <section className="module-card"><div className="panel-heading"><div><h3>Rede de precedências</h3><p>A primeira relação estruturada da rede do cronograma. O padrão inicial é término-início.</p></div><GitBranch size={18} className="sparkle" /></div><form className="dependency-form" onSubmit={event => { event.preventDefault(); if (predecessorId && successorId) createDependency.mutate({ projectId, predecessorId: Number(predecessorId), successorId: Number(successorId), type: "FS", lag: 0 }); }}><select value={predecessorId} onChange={event => setPredecessorId(event.target.value)}><option value="">Predecessora</option>{activities.map(activity => <option key={activity.id} value={activity.id}>{activity.wbsCode} · {activity.name}</option>)}</select><span>→</span><select value={successorId} onChange={event => setSuccessorId(event.target.value)}><option value="">Sucessora</option>{activities.map(activity => <option key={activity.id} value={activity.id}>{activity.wbsCode} · {activity.name}</option>)}</select><button className="outline-button" disabled={!predecessorId || !successorId || createDependency.isPending}><Plus size={13} /> Adicionar FS</button></form><div className="planning-list">{dependencies.map(dependency => <div className="planning-row" key={dependency.id}><div><strong>{activities.find(item => item.id === dependency.predecessorId)?.name ?? `Atividade ${dependency.predecessorId}`} → {activities.find(item => item.id === dependency.successorId)?.name ?? `Atividade ${dependency.successorId}`}</strong><span>Tipo {dependency.type} · defasagem {dependency.lag} dias</span></div><b>Rede</b></div>)}{!dependencies.length && <div className="module-empty"><span><strong>Sem precedências.</strong> {activities.length < 2 ? "Crie ao menos duas atividades" : "Relacione as atividades"} para ligar a rede e calcular o CPM.</span></div>}</div></section>
  </div>;
}
