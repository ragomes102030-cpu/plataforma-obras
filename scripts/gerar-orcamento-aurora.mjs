#!/usr/bin/env node
/**
 * Gera itens de orçamento para AURORA TESTE baseados em composições SEINFRA.
 * Usa @supabase/supabase-js para conectar ao banco.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://tromrvfijbtihuilvnuk.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRvbXJ2ZmlqYnRpaHVpbHZudWsiLCJyb2xlIjoic2VydmljZV9yb2xlIiwiaWF0IjoxNzQ2OTc5MjAwLCJleHAiOjE5MDQ3NDU2MDB9.SgKsXTX3xaNhYpjIVYkMfw_vzIcvFer';

const PROJECT_ID = 7;
const VERSION_ID = 8;
const BUDGET_VERSION_ID = 4;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function getCompositionUnitCost(compositionId) {
  try {
    const { data: components, error } = await supabase
      .from('composition_components')
      .select('priceItemId, componentType, quantity')
      .eq('compositionId', compositionId);
    
    if (error) throw error;
    
    let totalCost = 0;
    for (const comp of components) {
      if (comp.priceItemId) {
        const { data: priceItem } = await supabase
          .from('price_items')
          .select('unitPrice')
          .eq('id', comp.priceItemId)
          .single();
        
        if (priceItem?.unitPrice) {
          const qty = parseFloat(comp.quantity) || 0;
          const price = parseFloat(priceItem.unitPrice);
          totalCost += qty * price;
        }
      }
    }
    
    return totalCost;
  } catch (e) {
    console.warn(`  ⚠️ Erro ao calcular custo da composição ${compositionId}: ${e.message}`);
    return 0;
  }
}

const KEYWORD_MAPPINGS = [
  ["Terraplenagem", ["terraplenagem", "escavação", "aterro"]],
  ["Fundações", ["fundação", "estaca", "bloco de fundação", "sapata"]],
  ["Contenções", ["contenção", "muro de contenção"]],
  ["Pilares", ["pilar", "column"]],
  ["Vigas", ["viga"]],
  ["Lajes", ["laje", "slab"]],
  ["Escadas", ["escada"]],
  ["Alvenarias", ["alvenaria", "vedação", "block", "bloco"]],
  ["Divisórias", ["divisória", "drywall", "partição"]],
  ["Estrutura da cobertura", ["cobertura", "estrutura de cobertura"]],
  ["Telhamento", ["telha", "telhado"]],
  ["Calhes", ["calha", "rufos"]],
  ["Impermeabilização", ["impermeabilização", "impermeabilizante"]],
  ["Chapisco", ["chapisco", "emboço", "reboco"]],
  ["Contrapisos", ["contrapiso"]],
  ["Revestimentos de paredes", ["revestimento", "cerâmica", "azulejo", "pastilha"]],
  ["Revestimentos de pisos", ["piso", "cerâmica", "porcelanato"]],
  ["Forros", ["forro", "gesso", "drywall ceiling"]],
  ["Portas e esquadrias", ["porta", "esquadria", "janela"]],
  ["Vidros", ["vidro"]],
  ["Pintura", ["pintura", "tinta", "latex"]],
  ["Instalações hidrossanitárias", ["hidrossanitário", "hidráulico", "sanitário"]],
  ["Instalações elétricas", ["elétrico", "elétrica"]],
  ["SPDA", ["spda", "aterra", "para-raios"]],
  ["Sistemas de incêndio", ["incêndio", "sprinkler"]],
  ["Drenagem externa", ["drenagem", "dreno"]],
  ["Muros, gradis e fechamentos", ["muro", "gradil", "fechamento", "cerca"]],
  ["Calçadas e pavimentação", ["calçada", "pavimentação", "piso externo"]],
];

async function findCompositionForActivity(activityName) {
  for (const [keyword, searchTerms] of KEYWORD_MAPPINGS) {
    if (activityName.toLowerCase().includes(keyword.toLowerCase())) {
      for (const term of searchTerms) {
        try {
          const { data, error } = await supabase
            .from('service_compositions')
            .select('id, code, description, unit')
            .ilike('description', `%${term}%`)
            .limit(3);
          
          if (!error && data && data.length > 0) {
            return data[0];
          }
        } catch (e) {
          continue;
        }
      }
    }
  }
  return null;
}

async function main() {
  console.log(`[${new Date().toLocaleTimeString()}] Iniciando geração de orçamento...`);
  
  // 1. Buscar atividades
  const { data: activities, error: actError } = await supabase
    .from('schedule_activities')
    .select('id, name, wbsNodeId, unit, plannedQuantity, durationDays')
    .eq('projectId', PROJECT_ID)
    .eq('versionId', VERSION_ID)
    .order('id');
  
  if (actError) throw actError;
  console.log(`  Atividades encontradas: ${activities.length}`);
  
  // 2. Buscar códigos WBS
  const wbsIds = [...new Set(activities.map(a => a.wbsNodeId).filter(Boolean))];
  const { data: wbsNodes } = await supabase
    .from('wbs_nodes')
    .select('id, code')
    .in('id', wbsIds);
  
  const wbsMap = new Map(wbsNodes?.map(n => [n.id, n.code]) || []);
  
  // 3. Criar budget_items
  const budgetItems = [];
  let totalCost = 0;
  let mappedCount = 0;
  
  for (const activity of activities) {
    const name = activity.name;
    const unit = activity.unit || 'un';
    const qty = parseFloat(activity.plannedQuantity) || 0;
    const duration = activity.durationDays || 0;
    const wbsCode = wbsMap.get(activity.wbsNodeId) || '';
    
    const comp = await findCompositionForActivity(name);
    
    if (comp) {
      const unitCost = await getCompositionUnitCost(comp.id);
      const totalItemCost = qty * unitCost;
      totalCost += totalItemCost;
      mappedCount++;
      
      budgetItems.push({
        budgetVersionId: BUDGET_VERSION_ID,
        wbsNodeId: activity.wbsNodeId,
        code: comp.code,
        description: `${name} — ${comp.description}`,
        unit: comp.unit,
        quantity: qty,
        unitPrice: Math.round(unitCost * 100) / 100,
        compositionId: comp.id,
        compositionUnitCost: Math.round(unitCost * 100) / 100,
        plannedDurationDays: duration,
        source: 'SEINFRA-CE 028.1',
        referencePeriod: '2024',
        compositionNote: `Gerado automaticamente da composição ${comp.code}`,
        sortOrder: budgetItems.length,
      });
    } else {
      budgetItems.push({
        budgetVersionId: BUDGET_VERSION_ID,
        wbsNodeId: activity.wbsNodeId,
        code: `S-${String(budgetItems.length + 1).padStart(4, '0')}`,
        description: name,
        unit: unit,
        quantity: qty,
        unitPrice: 0,
        plannedDurationDays: duration,
        source: 'AURORA TESTE',
        referencePeriod: '2024',
        compositionNote: 'Sem composição SEINFRA associada',
        sortOrder: budgetItems.length,
      });
    }
  }
  
  console.log(`  Composições mapeadas: ${mappedCount}/${activities.length}`);
  console.log(`  Custo total estimado: R$ ${totalCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
  
  // 4. Inserir no banco
  console.log(`\n[${new Date().toLocaleTimeString()}] Inserindo ${budgetItems.length} itens...`);
  
  // Remove itens existentes para evitar conflito
  const { error: deleteError } = await supabase
    .from('budget_items')
    .delete()
    .eq('budgetVersionId', BUDGET_VERSION_ID);
  
  if (deleteError) {
    console.warn(`  ⚠️ Erro ao limpar itens existentes: ${deleteError.message}`);
  }
  
  // Insere novos itens
  const { data: inserted, error: insertError } = await supabase
    .from('budget_items')
    .insert(budgetItems)
    .select('id');
  
  if (insertError) {
    console.error(`  ❌ Erro ao inserir: ${insertError.message}`);
    process.exit(1);
  }
  
  console.log(`  ✅ ${inserted.length} itens inseridos com sucesso`);
  
  console.log(`\n[${new Date().toLocaleTimeString()}] Concluído!`);
  console.log(`  Total de itens: ${budgetItems.length}`);
  console.log(`  Mapeados com SEINFRA: ${mappedCount}`);
  console.log(`  Sem composição: ${budgetItems.length - mappedCount}`);
  console.log(`  Custo total: R$ ${totalCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
}

main().catch(e => {
  console.error(`\n❌ Erro fatal: ${e.message}`);
  process.exit(1);
});
