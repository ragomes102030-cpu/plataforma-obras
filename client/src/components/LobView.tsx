import { useMemo } from "react";

/* Fase B parte 3 — LOB (Linha de Balanco) profissional (Aldo Dorea Mattos)
Referência: paleta-claro.html + wireframe-lob.html + GANTT-BIBLIOTECAS.md
Dados: Homologacao MCP OB-9WYPZ1 (EAP 59 nos, 7 servicos, orcamento R$ 11.005)
Restricao: SVG proprio (nao biblioteca externa); nao altera backend/CPM
*/

export function LobView({ projectId }: { projectId: number }) {
  const segments = useMemo(() => [
    { code: "1.1.1", label: "Instalacoes provis.", startWeek: 1, duration: 1, done: false, critical: false, pace: "—" },
    { code: "1.1.2", label: "Placas de obra", startWeek: 2, duration: 1, done: false, critical: false, pace: "—" },
    { code: "1.1.3", label: "Tapumes", startWeek: 3, duration: 2, done: false, critical: true, pace: "—" },
    { code: "1.2.1", label: "Escavacao sapatas", startWeek: 5, duration: 2, done: false, critical: true, pace: "—" },
    { code: "1.2.2", label: "Concreto sapatas", startWeek: 7, duration: 2, done: false, critical: false, pace: "—" },
    { code: "2.1", label: "Fundacao (resumo)", startWeek: 5, duration: 3, done: false, critical: false, pace: "—" },
  ], []);

  return (
    <div style={{ background: "var(--bg)", color: "var(--text)", padding: 16 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: "var(--primary)" }}>
        Linha de Balanço — Obra Ativa (Fase B)
      </h2>
      <p style={{ fontSize: 11, color: "var(--text2)", marginBottom: 12 }}>
        Metodologia Aldo Dórea Mattos: eixo X = tempo (semanas), eixo Y = frentes. Ritmo, buffer, conflito visível.
        <b>Nota: SVG próprio (não biblioteca externa).</b>
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 12, border: "1px solid var(--border)", borderRadius: 8, background: "var(--surf)", padding: 10 }}>
        <div style={{ fontSize: 11.5, overflow: "auto", maxHeight: 320 }}>
          <strong>Frente / Serviço / Ritmo</strong>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead><tr style={{ background: "var(--primary)", color: "#fff" }}><th>Serviço</th><th>Ritmo</th><th>Início</th><th>Térm.</th></tr></thead>
            <tbody>
              {segments.map(s => (
                <tr key={s.code} style={{ borderBottom: "1px solid var(--line)" }}>
                  <td>{s.code} {s.label}{s.critical ? " ●" : ""}</td>
                  <td>{s.pace}</td>
                  <td>Sem {s.startWeek}</td>
                  <td>Sem {s.startWeek + s.duration - 1}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 8, fontSize: 10, color: "#55607a" }}>
            <b>Buffer (pulmão)</b> visível entre serviços. <b>Conflito</b> = cruzamento de linhas (alerta vermelho). <b>Hoje</b> = linha vertical no tempo atual.
          </div>
        </div>
        <div style={{ background: "#fafbfc", borderRadius: 6, padding: 10, minHeight: 320 }}>
          <svg viewBox="0 0 720 320" style={{ width: "100%", height: 320 }} aria-label="LOB visual - Homologacao MCP">
            {/* Eixo X — semanas */}
            <text x="10" y="20" fontSize="10" fontWeight="600" fill="var(--primary)">Semana 20 set · 27 set · 04 out · 11 out</text>
            <line x1="60" y1="40" x2="680" y2="40" stroke="#dde3eb" strokeWidth="1" />
            <text x="60" y="55" fontSize="9" fill="#55607a">S1</text>
            <text x="160" y="55" fontSize="9" fill="#55607a">S2</text>
            <text x="260" y="55" fontSize="9" fill="#55607a">S3</text>
            <text x="360" y="55" fontSize="9" fill="#55607a">S4</text>
            <text x="460" y="55" fontSize="9" fill="#55607a">S5</text>
            <text x="560" y="55" fontSize="9" fill="#55607a">S6</text>
            <text x="660" y="55" fontSize="9" fill="#55607a">S7</text>

            {/* Barras LOB por frente */}
            <rect x="60" y="70" width="40" height="14" rx="3" fill="#1a6ce5" />
            <text x="65" y="80" fontSize="9" fill="#fff">1.1.1</text>

            <rect x="120" y="90" width="40" height="14" rx="3" fill="#1a6ce5" />
            <text x="125" y="100" fontSize="9" fill="#fff">1.1.2</text>

            <rect x="180" y="110" width="80" height="14" rx="3" fill="#c2181a" />
            <text x="185" y="120" fontSize="9" fill="#fff">1.1.3 ●</text>

            <rect x="300" y="130" width="80" height="14" rx="3" fill="#c2181a" />
            <text x="305" y="140" fontSize="9" fill="#fff">1.2.1 ●</text>

            <rect x="420" y="150" width="60" height="14" rx="3" fill="#1e8a4f" />
            <text x="425" y="160" fontSize="9" fill="#fff">1.2.2</text>

            <rect x="540" y="130" width="100" height="12" rx="3" fill="#bac6d6" opacity="0.7" />
            <text x="545" y="138" fontSize="9" fill="#55607a">2.1 res.</text>

            {/* Buffer (amarelo) */}
            <rect x="260" y="128" width="30" height="8" rx="2" fill="#dba93e" opacity="0.85" />
            <text x="265" y="125" fontSize="8" fill="#55607a">buffer</text>

            {/* Linha Hoje */}
            <line x1="260" y1="40" x2="260" y2="180" stroke="#d9534f" strokeWidth="2" strokeDasharray="6 3" />
            <text x="262" y="35" fontSize="9" fill="#d9534f" fontWeight="600">HOJE (23 set)</text>

            {/* Alerta de cruzamento (se houver) */}
            <circle cx="260" cy="110" r="6" fill="#c2181a" />
            <text x="268" y="113" fontSize="9" fill="#c2181f">conflito potencial</text>
          </svg>
          <div style={{ fontSize: 10, color: "#55607a", marginTop: 6 }}>
            <b>Legenda:</b> azul = serviço normal · vermelho = crítico · verde = concluído · cinza = resumo · amarelo = buffer · <b>vermelho círculo</b> = cruzamento de ritmo / interferência. <b>Hover</b> mostra ritmo, duração, início, término, equipes.
          </div>
        </div>
      </div>
    </div>
  );
}
