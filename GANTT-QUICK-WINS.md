# Gantt — Quick Wins (Implementação Rápida)

**Sprint 1-2:** Melhorias com baixo risco e alto impacto

---

## 🟢 Quick Win #1: Cores de Folga (20 minutos)

### Antes
```tsx
const color = r.critical ? "#c2181a" : "#1a6ce5";
```

### Depois
```tsx
const getBarColor = (activity: Activity) => {
  const folga = activity.totalFloat ?? 0;
  
  if (folga === 0) return "#c2181a";      // 🔴 Crítica
  if (folga < 5) return "#ff9800";        // 🟠 Alto risco
  if (folga < 10) return "#ffd700";       // 🟡 Segura
  return "#90ee90";                       // 🟢 Muito segura
};

// Uso
{rows.map((r) => {
  const color = getBarColor(activities.find(a => a.id === r.id)!);
  return <rect fill={color} ... />;
})}
```

### UI Control
```tsx
<label style={{ fontSize: 11 }}>
  <input 
    type="radio" 
    name="colors"
    checked={colorMode === 'slack'}
    onChange={() => setColorMode('slack')}
  /> 
  Cores por folga
</label>
```

---

## 🟡 Quick Win #2: Milestones (30 minutos)

### DB Migration
```sql
ALTER TABLE schedule_activities 
ADD COLUMN activity_type ENUM('activity', 'milestone') DEFAULT 'activity';

UPDATE schedule_activities 
SET activity_type = 'milestone' 
WHERE durationDays = 0 OR name LIKE '%Marco%';
```

### Frontend Rendering
```tsx
{rows.map((r) => {
  const activity = activities.find(a => a.id === r.id);
  
  if (activity?.activity_type === 'milestone') {
    const pos = posById.get(r.id)!;
    // Diamante no centro da data
    const x = pos.x0 + (pos.x1 - pos.x0) / 2;
    const y = pos.y + ROW_H / 2;
    
    return (
      <g key={`milestone-${r.id}`}>
        <polygon
          points={`${x},${y-8} ${x+8},${y} ${x},${y+8} ${x-8},${y}`}
          fill="#ffd700"
          stroke="#cc9900"
          strokeWidth={2}
        />
        <title>{r.name} — Marco</title>
      </g>
    );
  }
  
  // Renderizar barra normal
  return <rect ... />;
})}
```

---

## 🔴 Quick Win #3: Indicador de Atraso (25 minutos)

### Função Auxiliar
```typescript
function getDaysLate(
  activity: Activity,
  projectStart: number | null,
  today: Date
): number {
  if (!projectStart) return 0;
  
  // Data planejada de conclusão
  const plannedEnd = new Date(
    projectStart + 
    (activity.startOffset! + activity.durationDays!) * 86400000
  );
  
  return Math.max(0, Math.floor(
    (today.getTime() - plannedEnd.getTime()) / 86400000
  ));
}

function getRiskIcon(daysLate: number): { emoji: string; color: string; label: string } {
  if (daysLate === 0) return { emoji: '🟢', color: '#1e8a4f', label: 'No prazo' };
  if (daysLate <= 3) return { emoji: '🟡', color: '#ffd700', label: `Aviso: ${daysLate}d` };
  return { emoji: '🔴', color: '#c2181a', label: `Atraso: ${daysLate}d` };
}
```

### Adicionar ao Tooltip
```tsx
{rows.map((r) => {
  const activity = activities.find(a => a.id === r.id)!;
  const daysLate = getDaysLate(activity, projectStart, new Date());
  const risk = getRiskIcon(daysLate);
  
  return (
    <rect
      title={`${r.name} | ${risk.label} ${risk.emoji}`}
      ...
    />
  );
})}
```

---

## 🟢 Quick Win #4: Toggle Apenas Críticas + Atraso (15 minutos)

### Estado
```tsx
const [filterMode, setFilterMode] = useState<'all' | 'critical' | 'late'>('all');

const filtered = useMemo(() => {
  let result = activities;
  
  if (filterMode === 'critical') {
    result = result.filter(a => a.critical === 1);
  } else if (filterMode === 'late') {
    const today = new Date();
    result = result.filter(a => getDaysLate(a, projectStart, today) > 0);
  }
  
  return result;
}, [activities, filterMode, projectStart]);
```

### UI
```tsx
<div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
  {[
    { label: 'Todas', value: 'all' },
    { label: 'Só críticas', value: 'critical' },
    { label: 'Com atraso', value: 'late' }
  ].map(({ label, value }) => (
    <button
      key={value}
      onClick={() => setFilterMode(value as any)}
      style={{
        background: filterMode === value ? 'var(--primary)' : 'var(--surf)',
        color: filterMode === value ? '#fff' : 'var(--text)',
        fontSize: 11,
        padding: '3px 10px',
        borderRadius: 6,
        border: '1px solid var(--border)',
        cursor: 'pointer'
      }}
    >
      {label}
    </button>
  ))}
</div>
```

---

## 🟠 Quick Win #5: Baseline Tracejada (45 minutos)

### Estado & Query
```tsx
const [showBaseline, setShowBaseline] = useState(false);
const baseline = planning.data?.baselines?.[0]; // Pega primeira baseline

const baselineActivities = useMemo(() => {
  if (!baseline) return new Map();
  const map = new Map<number, Activity>();
  baseline.items?.forEach(item => {
    map.set(item.activityId, item.activity);
  });
  return map;
}, [baseline]);
```

### Renderização Dupla
```tsx
{showBaseline && baseline && rows.map((r) => {
  const baselineActivity = baselineActivities.get(r.id);
  if (!baselineActivity) return null;
  
  const pos = posById.get(r.id)!;
  const baselineW = Math.max(6, baselineActivity.durationDays! * scale);
  
  return (
    <rect
      key={`baseline-${r.id}`}
      x={pos.x0}
      y={pos.y + 6}
      width={baselineW}
      height={14}
      rx={3}
      fill="transparent"
      stroke="#8b98a8"
      strokeWidth={2}
      strokeDasharray="4,4"
      opacity={0.5}
    />
  );
})}
```

### UI Toggle
```tsx
<label style={{ fontSize: 11, marginLeft: 8 }}>
  <input
    type="checkbox"
    checked={showBaseline}
    onChange={(e) => setShowBaseline(e.target.checked)}
  />
  Mostrar baseline
</label>
```

---

## 🔵 Quick Win #6: Tooltip Expandido (20 minutos)

### Componente SVG Title
```tsx
{rows.map((r) => {
  const activity = activities.find(a => a.id === r.id)!;
  const daysLate = getDaysLate(activity, projectStart, new Date());
  
  const tooltipText = [
    `${r.wbsCode}: ${r.name}`,
    `${r.inicio} → ${r.termino}`,
    `Duração: ${r.duration}d`,
    `Progresso: ${r.progress}%`,
    `Folga: ${activity.totalFloat ?? 0}d`,
    daysLate > 0 ? `⚠️ Atraso: ${daysLate}d` : '',
    activity.allocations?.length > 0 
      ? `Recurso: ${activity.allocations.map(a => a.resourceName).join(', ')}`
      : ''
  ]
    .filter(Boolean)
    .join(' | ');
  
  return (
    <rect
      title={tooltipText}
      {...}
    />
  );
})}
```

---

## 🟢 Quick Win #7: Exportar com Cores Novas (10 minutos)

### Ajuste Simples (já existe, apenas expandir)
```tsx
const svgToImage = async (svg: SVGSVGElement): Promise<HTMLImageElement> => {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  
  // Mapa de cores CSS → HTML
  const colorMap: Record<string, string> = {
    'var(--primary)': '#1a6ce5',
    'var(--warn)': '#c48a00',
    'var(--crit)': '#c2181a',
    // Adicionar novas
    '#ff9800': '#ff9800', // Laranja
    '#ffd700': '#ffd700', // Amarelo
    '#90ee90': '#90ee90', // Verde
  };
  
  // Já faz isso para warn, estender para todas
  Object.entries(colorMap).forEach(([css, html]) => {
    clone.querySelectorAll(`[fill='${css}']`).forEach(n => {
      n.setAttribute('fill', html);
    });
  });
  
  // ... resto do código
};
```

---

## 📊 Ordem de Implementação Recomendada

1. **Quick Win #1** (Cores de folga) — 20 min, máximo impacto visual
2. **Quick Win #4** (Filtros) — 15 min, acessibilidade
3. **Quick Win #3** (Atraso) — 25 min, gestão proativa
4. **Quick Win #2** (Milestones) — 30 min, clareza estrutural
5. **Quick Win #6** (Tooltip) — 20 min, contexto
6. **Quick Win #5** (Baseline) — 45 min, rastreabilidade
7. **Quick Win #7** (Exportação) — 10 min, relatórios

**Tempo total:** ~2-3 horas de desenvolvimento  
**Teste:** 1 hora

---

## ✅ Checklist de Deploy

- [ ] Nenhuma quebra de tipo TypeScript (`pnpm check`)
- [ ] Testes passam (`pnpm test`)
- [ ] Build sucede (`pnpm build`)
- [ ] PNG/PDF exportam com cores corretas
- [ ] Filtros funcionam (critical, late, all)
- [ ] Tooltips aparecem em hover
- [ ] Responsivo em mobile (zoom/scroll)

---

## 🚀 Próximo Passo

Após esses 7 quick wins, a base está pronta para:
- **Calendário de trabalho** (Sprint 1, 5-8h)
- **Baselines múltiplas** (Sprint 1, 6-10h)
- **Recursos alocados** (Sprint 3, 5-7h)


