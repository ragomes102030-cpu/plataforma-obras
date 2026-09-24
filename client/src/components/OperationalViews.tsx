import { trpc } from "@/lib/trpc";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { AlertTriangle, BarChart3, CheckCircle2, ClipboardList, Plus, RefreshCw, TrendingUp } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { NAV_PATHS } from "@/nav-paths";
import { Cell, Pie, PieChart as RePieChart } from "recharts";

const stages = ["DESCRITIVO", "EAP_PROPOSTA", "EAP_REVISAO", "ATIVIDADES_PROPOSTA", "DEPENDENCIAS_PROPOSTA", "CPM_VALIDADO", "CRONOGRAMA_PROPOSTO", "BASELINE_PROPOSTA", "GANTT_LOB_PROPOSTO", "CONTROLE"] as const;
type Stage = (typeof stages)[number];

export function RestrictionsView({ projectId, projectName }: { projectId: number; projectName: string }) {
  const snapshot = trpc.agent.snapshot.useQuery({ projectId });
  const utils = trpc.useUtils();
  const [, navigate] = useLocation();
  const [description, setDescription] = useState("");
  const [impact, setImpact] = useState("");
  const [stage, setStage] = useState<Stage>("CONTROLE");
  const mutation = trpc.agent.recordFinding.useMutation({ onSuccess: async () => { setDescription(""); setImpact(""); await utils.agent.snapshot.invalidate({ projectId }); } });
  const transition = trpc.agent.transitionFinding.useMutation({ onSuccess: async () => { await utils.agent.snapshot.invalidate({ projectId }); } });
  const findings = snapshot.data?.openFindings ?? [];
  return (
    <div className="module-page">
      <div className="module-hero"><div className="module-icon"><AlertTriangle size={22} /></div><div><p className="eyebrow accent">CONTROLE OPERACIONAL</p><h2>Restrições</h2><p>{projectName} · registre impedimentos, alertas e recomendações com rastreabilidade.</p></div><span className="module-hero-status"><span /> {snapshot.isPending ? "Carregando" : findings.length ? `${findings.length} aberta(s)` : "Sem restrições"}</span></div>
      <div className="module-grid"><div className="module-card"><span className="eyebrow">ABERTAS</span><strong>{findings.length} achado(s)</strong><p>Itens que ainda precisam de decisão ou tratamento.</p></div><div className="module-card"><span className="eyebrow">MARCO DO COORDENADOR</span><strong>{snapshot.data?.stage ?? "Carregando..."}</strong><p>{snapshot.data?.blockerCount ?? 0} bloqueador(es) acumulado(s).</p></div></div>
      <div className="module-card"><div className="panel-heading"><div><h3>Registrar restrição</h3><p>O registro fica disponível para o agente coordenador da obra.</p></div><Plus size={17} className="sparkle" /></div>
        <form className="production-form-grid" onSubmit={event => { event.preventDefault(); if (!description.trim()) return; mutation.mutate({ projectId, stage, classification: "blocker", entityType: "restricao_manual", source: { channel: "restricoes", actor: "cliente" }, description: description.trim(), impact: impact.trim() || undefined, confidence: "medium" }); }}>
          <label className="production-field-wide">Descrição<textarea value={description} onChange={event => setDescription(event.target.value)} placeholder="Ex.: projeto estrutural ainda não liberado" rows={3} required /></label>
          <label>Marco<select value={stage} onChange={event => setStage(event.target.value as Stage)}>{stages.map(item => <option key={item}>{item}</option>)}</select></label>
          <label className="production-field-wide">Impacto esperado<input value={impact} onChange={event => setImpact(event.target.value)} placeholder="Ex.: bloqueia a frente por 3 dias" /></label>
          <div className="production-form-footer">{mutation.error && <span className="form-error">{mutation.error.message}</span>}{mutation.isSuccess && <span className="form-success">Restrição registrada para o coordenador.</span>}<button className="primary-button" disabled={mutation.isPending}><ClipboardList size={14} /> {mutation.isPending ? "Registrando..." : "Registrar restrição"}</button></div>
        </form>
      </div>
      <div className="module-card"><div className="panel-heading"><div><h3>Pendências abertas</h3><p>O agente deve observar estes itens nas próximas análises.</p></div><RefreshCw size={16} className="sparkle" /></div>
        {snapshot.isPending ? <div className="module-empty">Carregando restrições...</div> : findings.length === 0 ? <div className="module-empty"><CheckCircle2 size={20} /> Nenhuma restrição aberta.</div> : <div className="focus-list">{findings.map((finding, index) => <div className="focus-item" key={`${finding.entityType}-${finding.entityRef ?? index}`}><div className="focus-icon rose"><AlertTriangle size={16} /></div><div><strong>{finding.description}</strong><span>{finding.entityType} · {finding.confidence} · {finding.impact || "Impacto não informado"}</span></div><span className="focus-tag rose">Bloqueio</span><button className="focus-tag" onClick={() => transition.mutate({ projectId, findingId: finding.id, to: finding.status === "open" ? "resolved" : "open" })} disabled={transition.isPending}>{finding.status === "open" ? "Resolver" : "Reabrir"}</button></div>)}</div>}
      </div>
    </div>
  );
}

export function ReportsView({ projectId, projectName, activities }: { projectId: number; projectName: string; activities: any[] }) {
  const entriesQuery = trpc.production.entries.useQuery({ projectId });
  const controlQuery = trpc.planning.control.useQuery({ projectId });
  const [, navigate] = useLocation();
  const entries = entriesQuery.data ?? [];
  const control = controlQuery.data;
  const planned = control?.totals.plannedProgress ?? 0;
  const actual = control?.totals.actualProgress ?? 0;
  const donutData = [
    { name: "Realizado", value: Math.min(100, Math.max(0, actual)), fill: "#4f7c8f" },
    { name: "A realizar", value: Math.max(0, 100 - Math.min(100, Math.max(0, actual))), fill: "#e7eded" },
  ];
  const completed = activities.filter(item => item.progress >= 100).length;
  const atRisk = activities.filter(item => item.status === "Em risco").length;
  const totalQuantity = entries.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const priorityActivities = [...activities]
    .filter(item => item.status === "Em risco" || item.critical === 1 || item.progress < 100)
    .sort((left, right) => (Number(right.critical) - Number(left.critical)) || (Number(left.progress) - Number(right.progress)) || (Number(left.startOffset) - Number(right.startOffset)))
    .slice(0, 5);
  const avgProgress = activities.length
    ? Math.round(activities.reduce((sum, item) => sum + Number(item.progress || 0), 0) / activities.length)
    : 0;
  return (
    <div className="module-page">
      <div className="module-hero"><div className="module-icon"><BarChart3 size={22} /></div><div><p className="eyebrow accent">VISÃO EXECUTIVA</p><h2>Relatórios</h2><p>{projectName} · indicadores calculados a partir do planejamento e da produção persistidos.</p></div><span className="module-hero-status"><span /> {activities.length === 0 ? "Sem cronograma" : entries.length === 0 ? "Sem produção" : `${entries.length} lançamento(s)`}</span></div>
      <div className="metrics-grid"><div className="metric-card clickable-card" role="button" tabIndex={0} onClick={() => navigate(NAV_PATHS["Cronogramas"])} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") navigate(NAV_PATHS["Cronogramas"]); }}><div className="metric-icon bg-[#e8f0f4] text-[#426579]"><ClipboardList size={17} /></div><div><p className="metric-label">Atividades</p><p className="metric-value">{completed}/{activities.length}</p><p className="metric-detail">concluídas</p></div></div><div className="metric-card clickable-card" role="button" tabIndex={0} onClick={() => navigate(NAV_PATHS["Cronogramas"])} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") navigate(NAV_PATHS["Cronogramas"]); }}><div className="metric-icon bg-[#f3e6e6] text-[#8b5b60]"><AlertTriangle size={17} /></div><div><p className="metric-label">Risco</p><p className="metric-value">{atRisk}</p><p className="metric-detail">atividade(s) em risco</p></div></div><div className="metric-card clickable-card" role="button" tabIndex={0} onClick={() => navigate(NAV_PATHS["Produção"])} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") navigate(NAV_PATHS["Produção"]); }}><div className="metric-icon bg-[#e5f0e8] text-[#427052]"><CheckCircle2 size={17} /></div><div><p className="metric-label">Produção</p><p className="metric-value">{totalQuantity.toFixed(3)}</p><p className="metric-detail">quantidade lançada</p></div></div><div className="metric-card clickable-card" role="button" tabIndex={0} onClick={() => navigate(NAV_PATHS["Gráficos"])} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") navigate(NAV_PATHS["Gráficos"]); }}><div className="metric-icon bg-[#ede9f3] text-[#5f5480]"><TrendingUp size={17} /></div><div><p className="metric-label">Avanço físico</p><p className="metric-value">{avgProgress}%</p><p className="metric-detail">média do cronograma</p></div></div></div>
      <div className="module-card"><div className="panel-heading"><div><h3>Avanço físico (donut)</h3><p>Percentual realizado sobre a curva física planejada.</p></div><BarChart3 size={17} className="sparkle" /></div><ChartContainer config={{ Realizado: { label: "Realizado", color: "#4f7c8f" }, "A realizar": { label: "A realizar", color: "#e7eded" } }} className="h-[220px] w-full aspect-auto"><RePieChart><ChartTooltip content={<ChartTooltipContent />} /><Pie data={donutData} dataKey="value" nameKey="name" innerRadius={64} outerRadius={92} paddingAngle={3}>{donutData.map((entry) => <Cell key={entry.name} fill={entry.fill} />)}</Pie></RePieChart></ChartContainer><div className="control-summary" style={{ marginTop: 12 }}><div><span className="eyebrow">PLANEJADO</span><strong>{planned}%</strong></div><div><span className="eyebrow">REALIZADO</span><strong>{actual}%</strong></div><div><span className="eyebrow">DESVIO</span><strong className={control && control.totals.variance < 0 ? "negative-variance" : "positive-variance"}>{control && control.totals.variance > 0 ? "+" : ""}{control?.totals.variance ?? 0} pp</strong></div></div>{!control && controlQuery.isPending ? <div className="module-empty">Carregando indicadores...</div> : null}</div>
      <div className="module-card"><div className="panel-heading"><div><h3>Leitura do coordenador</h3><p>Este painel resume sinais persistidos e não substitui a validação do cliente.</p></div></div>{entries.length ? <div className="module-empty"><CheckCircle2 size={20} /> {entries.length} lançamento(s) de produção registrados.</div> : <div className="module-empty"><AlertTriangle size={20} /><span><strong>Ainda não há produção.</strong> O relatório executivo se alimenta dos apontamentos diários.</span><button type="button" className="outline-button" onClick={() => navigate(NAV_PATHS["Produção"])}>Ir para Produção</button></div>}</div>
      <div className="module-card"><div className="panel-heading"><div><h3>Atividades que merecem atenção primeiro</h3><p>Prioridade calculada por risco, caminho crítico, avanço e início planejado.</p></div><AlertTriangle size={18} className="sparkle" /></div>{priorityActivities.length ? <div className="focus-list">{priorityActivities.map((activity, index) => <div className="focus-item" key={activity.id}><div className={`focus-icon ${activity.status === "Em risco" ? "rose" : "amber"}`}><span>{index + 1}</span></div><div><strong>{activity.wbsCode} · {activity.name}</strong><span>{activity.status === "Em risco" ? "Em risco" : activity.critical === 1 ? "Caminho crítico" : "Ainda não concluída"} · avanço {activity.progress}%</span></div><span className={`focus-tag ${activity.status === "Em risco" ? "rose" : "amber"}`}>{activity.status === "Em risco" ? "Bloqueio" : "Prioridade"}</span></div>)}</div> : <div className="module-empty"><CheckCircle2 size={20} /> Nenhuma atividade pendente foi encontrada.</div>}</div>
    </div>
  );
}
