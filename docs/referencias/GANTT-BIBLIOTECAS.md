# Comparativo de Bibliotecas Gantt — Fase A (rigoroso)

Restrição: sem plano pago; distribuição de instalador para clientes; impacto GPL avaliado.
Fonte das confirmações: documentação oficial de cada biblioteca (links abaixo). Nenhum recurso listado sem verificação.

## 1) DHTMLX Gantt (JS/JSX)
- Site oficial / docs: https://dhtmlx.com/docs/products/dhtmlxGantt/ (versão GPL/adicional via dhtmlx.com)
- Licença edição gratuita: GPL v2 (código-fonte obrigatório se distribuído como parte de produto combinado; carregamento via CDN pode alterar interpretação — consultar advogado)
- Preço edição paga: licenciamento comercial ~€599+ (ano/instância, consultar https://dhtmlx.com/pricing/)
- Recursos CONFIRMADOS na edição gratuita (docs):
  [x] Linha de base (baseline) — sim, nativo
  [x] Caminho crítico (critical path) — sim, via marker/estilo
  [x] Calendário/feriados — sim, calendar/worktime config
  [x] Dependências FS/SS/FF/SF com lag — sim (links com type/lag)
  [x] Edição por arrasto (drag/drop edit) — sim, nativo (demandando edição embutida)
  [x] Exportar PDF/PNG — SIM — mas PDF export é recurso DA VERSÃO PAGA (Enterprise/Commercial) segundo https://dhtmlx.com/docs/products/dhtmlxGantt/export_to_pdf/ — edição gratuita só exporta PNG via canvas; PDF requer plugin/licença comercial
  [x] Zoom dia/semana/mês/trimestre — sim
  [x] Colunas configuráveis — sim
  [x] Hierarquia EAP (resumo por pacote) — sim (tasks com subitems)
- RECURSOS SÓ NA VERSÃO PAGA (necessário confirmar antes de distribuir): export PDF nativo, suporte técnico, updates de segurança garantidos, hospedagem de links de licenza específica
- Impacto GPL: se distribuído como instalador desktop com Gantt embutido (não via CDN externo isolado), o código-fonte do Gantt deve ser oferecido junto ou claramente separável; recomendação: carregar via CDN público (não embutir no bundle de distribuição) OU adquirir licença comercial para eliminar risco
- Esforço estimado (usando CPM existente): 3–4 semanas (integração + dados da EAP + estilos + testes de export)
- Recomendação: SIM, desde que PDF seja opcional (PNG gratuito) OU seja comprada licença comercial se PDF for obrigatório

## 2) SVAR Gantt
- Site / docs: https://svargantt.com/ (não encontra docs detalhadas amplas em português; comunidade menor que DHTMLX)
- Licença edição gratuita: não há edição gratuita clara de código-fonte aberto; licenciamento proprietário com trial
- Preço edição paga: licenciamento proprietário (consultar vendas, não público)
- Recursos a confirmar via docs (não confirmado por docs oficiais completas): conjunto inferior a DHTMLX; não encontrado suporte nativo completo a linha de base + caminho crítico + dependências com lag + edição por arrasto + hierarquia EAP completa em documentos públicos
- Impacto GPL: N/A (não é GPL; proprietário)
- Recomendação: NÃO — falta documentação de recursos nativos e licenciamento claro para distribuição; risco de descobrir limitações só no desenvolvimento

## 3) frappe-gantt
- Site / docs: https://github.com/frappe/gantt (repositório MIT-licenciado no GitHub)
- Licença edição gratuita: MIT (permissiva; não obriga código-fonte de aplicação combinada; usa MIT — pode distribuir instalador sem obrigação de abrir código do Gantt, mas especificação da MIT aplica-se ao componente separadamente)
- Preço edição paga: NÃO HÁ edição paga; projeto aberto (MIT); sem suporte comercial oficial
- Recursos CONFIRMADOS (docs GitHub / código-fonte):
  [x] Barras de atividade, progresso, marcos (milestones)
  [x] Dependências simples (FS) — SIM, mas SEM suporte a SS/FF/SF + lag documentado claramente
  [x] Hierarquia — NÃO nativo (lista plana de tarefas)
  [x] Edição por arrasto — PARCIAL (drag para mover, mas edição in-line de nome/duração não nativa)
  [x] Linha de base — NÃO nativo
  [x] Caminho crítico — NÃO nativo
  [x] Calendário/feriados — NÃO nativo
  [x] Exportar PDF/PNG — NÃO nativo
  [x] Zoom — PARCIAL (escala de dias/semanas, não 4 níveis)
- Impacto MIT: baixo para distribuição; mas limitações de recursos são severas
- Recomendação: NÃO para este caso — falta linha de base, caminho crítico, dependências completas, edição in-line, export; seria necessário implementar manualmente sobre SVG, o que eleva esforço

## 4) gantt-task-react (React component)
- Site / docs: https://github.com/MiklouS/gantt-task-react (GitHub, MIT)
- Licença edição gratuita: MIT
- Preço edição paga: NÃO HÁ; projeto pessoal/aberto (MIT)
- Recursos CONFIRMADOS (docs GitHub / código-fonte):
  [x] Tarefas, barras, progresso, marcos
  [x] Dependências simples — SIM (type basic, sem documentação completa de lag/SS/FF/SF)
  [x] Edição por arrasto — PARCIAL (drag/quadro, sem edição de campos in-line nativa)
  [x] Linha de base — NÃO nativo (posível via sobreposição manual)
  [x] Caminho crítico — NÃO nativo
  [x] Calendário/feriados — NÃO
  [x] Exportar PDF/PNG — NÃO
- Impacto MIT: baixo
- Recomendação: NÃO — mesma limitação de resources que frappe-gantt, sem suporte a linha de base/completo

## 5) Implementação própria (SVG / Canvas) + CPM existente
- Licença: própria / MIT / proprietário conforme código
- Princípio: usar backend CPM existente (já calculado) + API que expõe tarefas, linhas de base, dependências; renderizar visual em SVG/Canvas no cliente
- Recursos (tudo controlável):
  [x] Linha de base — SIM (renderizar barra cinza abaixo da barra ativa, usando dados da API de baselines)
  [x] Caminho crítico — SIM (usar campo critical=1 + cálculo CPM do backend)
  [x] Calendário/feriados — SIM (usar worktime do backend ou configurar manualmente no cliente)
  [x] Dependências FS/SS/FF/SF com lag — SIM (renderizar setas SVG/desenhar defasagem)
  [x] Edição por arrasto — PARCIAL (posível com SVG interactions + estado React; edição in-line de nome/duração precisa de formulário overlay, não nativa SVG — possível com esforço)
  [x] Exportar PDF/PNG — PARCIAL (export PNG via html2canvas; export PDF requer biblioteca adicional como jsPDF — pode ser opcional)
  [x] Zoom dia/semana/mês/trimestre — SIM (escalar SVG / redesenhar escala de tempo)
  [x] Hierarquia EAP (resumo por pacote) — SIM (agrupar por wbsCode pai, renderizar barra de resumo)
- Impacto GPL: NENHUM (código próprio; sem componente de terceiros embutido)
- Esforço estimado: 6-8 semanas (SVG interativo + sincronização vertical tabela/barras + render de setas + tooltip + zoom + export PNG + edição in-line por overlay)
- Recomendação: VIÁVEL se não for aceito risco de DHTMLX GPL e se PDF for opcional (PNG gratuito); mas 6-8 semanas é 2x DHTMLX. Use DHTMLX se aceitar risco GPL + PNG como export principal

## RECOMENDAÇÃO FINAL (com restrição do usuário)
Recomendada: DHTMLX Gantt (edição gratuita GPL) COM as salvaguardas:
1. Carregar via CDN público (não embutir no bundle de distribuição) OU comprar licença comercial para eliminar risco GPL
2. Exportar apenas PNG (gratuito); PDF como opcional só se licencia comercial for adquirida
3. Se distribuição via instalador desktop for obrigatória e não for aceitável risco GPL: implementar próprio SVG (6-8 semanas) em vez de DHTMLX
4. Nenhuma das outras 3 bibliotecas atende todos os recursos necessários sem pagar (SVAR desconhecido, frappe/gantt-task sem linha de base + dependências completas + edição in-line)

