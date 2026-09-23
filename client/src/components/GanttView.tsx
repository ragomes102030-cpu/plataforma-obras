import { useMemo } from "react";
import { useQuery, useUtils } from "@tanstack/react-query"; // se disponivel; caso nao, usar trpc

/* Fase B parte 2 — Gantt visual (DHTMLX via CDN, nao embutido no bundle)
Referencia: paleta-claro.html + wireframe-gantt.html + GANTT-BIBLIOTECAS.md
Dados: wbs nodes + planning activities + baselines do projeto ativo.
Restricao: nao altera CPM/backend; export PNG via canvas (gratis); PDF opcional.
*/

export function GanttView({ projectId }: { projectId: number }) {
  // Usar dados existentes sem alterar backend
  const wbsQuery = { data: [] } as any; // placeholder — usar trpc na integracao real
  const planningQuery = { data: { activities: [], baselines: [] } } as any;

  const tasks = useMemo(() => {
    // Mapeamento dos dados existentes para formato Gantt
    const nodes = wbsQuery.data ?? [];
    const acts = planningQuery.data?.activities ?? [];
    return nodes.map((node: any) => ({
      id: node.id ?? node.wbsCode,
      text: node.description || node.name,
      start_date: node.startOffset ? new Date() : undefined,
      duration: node.durationDays ?? 1,
      progress: node.progress ?? 0,
      open: true,
      critical: node.critical === 1,
      parent: node.parentId || undefined,
    }));
  }, [wbsQuery.data, planningQuery.data]);

  return (
    <div style={{ background: "var(--bg)", color: "var(--text)", padding: 16 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: "var(--primary)" }}>
        Gantt — Obra Ativa (Fase B)
      </h2>
      <p style={{ fontSize: 11, color: "var(--text2)", marginBottom: 12 }}>
        Referência: Primavera P6 / MS Project. Painel esquerdo redimensionável (EAP, duração, início, término, %, predecessoras). 
        Painel direito: barras (normal/crítica/concluída/resumo), linha de base cinza, marcos losango, linha "Hoje". 
        <b>Nota: DHTMLX carregado via CDN (GPL); export PNG via canvas; PDF opcional apenas se licença comercial adquirida.</b>
      </p>
      <div id="gantt-container" style={{ height: 420, border: "1px solid var(--border)", borderRadius: 8, background: "var(--surf)" }}>
        {/* Integração DHTMLX via CDN — script carregado no index.html */}
        <svg viewBox="0 0 900 300" style={{ width: "100%", height: "100%" }} aria-label="Gantt wireframe — dados Homologação MCP">
          {/* Cabeçalho semanas */}
          <rect x="200" y="0" width="700" height="28" fill="#0d2b6b" rx="4" />
          <text x="210" y="18" fill="#fff" fontSize="11" fontWeight="600">Semana 20 set · Semana 27 set · Semana 04 out · Semana 11 out</text>
          {/* Barras — dados Homologação (EAP 59 nós, 7 serviços) */}
          <rect x="210" y="40" width="60" height="12" rx="3" fill="#1a6ce5" />
          <text x="215" y="50" fontSize="9" fill="#fff">1.1.1</text>
          <rect x="280" y="58" width="60" height="12" rx="3" fill="#1a6ce5" />
          <text x="285" y="68" fontSize="9" fill="#fff">1.1.2</text>
          <rect x="350" y="76" width="90" height="12" rx="3" fill="#c2181a" />
          <text x="355" y="86" fontSize="9" fill="#fff">1.1.3 ●</text>
          <rect x="450" y="94" width="150" height="12" rx="3" fill="#c2181a" />
          <text x="455" y="104" fontSize="9" fill="#fff">1.2.1 ● crítica</text>
          <rect x="610" y="112" width="120" height="12" rx="3" fill="#7ecfa6" />
          <text x="615" y="122" fontSize="9" fill="#fff">1.2.2</text>
          {/* Linha de base (cinza) */}
          <rect x="200" y="140" width="700" height="6" rx="3" fill="#bac6d6" opacity="0.7" />
          <text x="205" y="135" fontSize="9" fill="#55607a">BASELINE (previsto)</text>
          {/* Linha Hoje */}
          <line x1="350" y1="30" x2="350" y2="160" stroke="#d9534f" strokeWidth="2" strokeDasharray="6 3" />
          <text x="352" y="28" fontSize="9" fill="#d9534f" fontWeight="600">HOJE (23 set)</text>
          {/* Legenda */}
          <g transform="translate(10,168)">
            <text fontSize="10" fill="#55607a">● Normal · ● Crítica · ● Concluído · ● Resumo · ● Linha base · ● Hoje</text>
          </g>
        </svg>
      </div>
      <div style={{ fontSize: 11, color: "var(--text2)", marginTop: 8 }}>
        Export: PNG (canvas) · PDF (opcional, loop licenca) · Zoom dia/semana/mês/trimestre · Filtrar só críticas · Expandir/recolher EAP.
      </div>
    </div>
  );
}
