#!/usr/bin/env python3
"""Gera itens de orçamento para AURORA TESTE baseados em composições SEINFRA."""
import json
import urllib.request
import urllib.error
import sys
from datetime import datetime

SUPABASE_URL = "https://tromrvfijbtihuilvnuk.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRvbXJ2ZmlqYnRpaHVpbHZudWsiLCJyb2xlIjoic2VydmljZV9yb2xlIiwiaWF0IjoxNzQ2OTc5MjAwLCJleHAiOjE5MDQ3NDU2MDB9.SgKsXTX3xaNhYpjIVYkMfw_vzIcvFer"

PROJECT_ID = 7
VERSION_ID = 8
BUDGET_VERSION_ID = 4

def supabase_request(path, method="GET", data=None):
    """Faz request ao Supabase REST API."""
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }
    
    req = urllib.request.Request(url, headers=headers, method=method)
    if data:
        req.data = json.dumps(data).encode('utf-8')
    
    try:
        resp = urllib.request.urlopen(req)
        return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        error_body = e.read().decode('utf-8')
        raise Exception(f"HTTP {e.code}: {error_body}")

def get_composition_unit_cost(composition_id):
    """Calcula custo unitário total de uma composição (soma dos componentes)."""
    try:
        # Busca componentes com preços
        components = supabase_request(
            f"composition_components?compositionId=eq.{composition_id}"
            f"&select=priceItemId,componentType,quantity"
        )
        
        total_cost = 0.0
        for comp in components:
            if comp.get('priceItemId'):
                try:
                    price_item = supabase_request(
                        f"price_items?id=eq.{comp['priceItemId']}"
                        f"&select=unitPrice"
                    )
                    if price_item and price_item[0].get('unitPrice'):
                        qty = float(comp.get('quantity', 0))
                        price = float(price_item[0]['unitPrice'])
                        total_cost += qty * price
                except:
                    pass
        
        return total_cost
    except:
        return 0.0

# Mapeamento atividade -> composição SEINFRA (baseado na análise das atividades)
ACTIVITY_TO_COMPOSITION = {
    # Serviços gerais
    "Mobilização e canteiro": None,  # Sem composição direta
    "Administração e controle da obra": None,
    "Licenças, sinalização e segurança": None,
    
    # Infraestrutura
    "Locação e preparação do terreno": None,
    "Limpeza e remoção": None,
    "Demolições e remanejamentos": None,
    "Terraplenagem": None,  # 450 m³
    
    # Fundações
    "Fundações": None,  # 220 m³
    "Contenções": None,  # 180 m²
    
    # Estrutura
    "Pilares": None,  # 80 m³
    "Vigas": None,  # 100 m³
    "Lajes": None,  # 320 m³
    "Escadas e elementos estruturais complementares": None,  # 25 m³
    
    # Vedação
    "Alvenarias": None,  # 4500 m²
    "Divisórias e sistemas leves": None,  # 900 m²
    "Elementos de vedação complementares": None,  # 600 m²
    
    # Cobertura
    "Estrutura da cobertura": None,  # 18 m³
    "Telhamento e fechamento": None,  # 280 m²
    "Calhas, rufos e arremates": None,  # 140 m
    
    # Impermeabilização
    "Impermeabilização de fundações e áreas enterradas": None,  # 600 m²
    "Impermeabilização de áreas molhadas": None,  # 950 m²
    "Impermeabilização de cobertura e áreas expostas": None,  # 300 m²
    
    # Revestimentos
    "Chapisco, emboço e reboco": None,  # 8000 m²
    "Contrapisos": None,  # 2100 m²
    "Revestimentos de paredes": None,  # 6500 m²
    "Revestimentos de pisos": None,  # 2100 m²
    "Forros": None,  # 2000 m²
    
    # Esquadrias
    "Portas e esquadrias": None,  # 950 m²
    "Vidros": None,  # 700 m²
    "Ferragens e acessórios": None,
    
    # Instalações
    "Instalações hidrossanitárias": None,
    "Instalações elétricas": None,
    "SPDA e aterramento": None,
    "Sistemas de incêndio": None,
    "Telecomunicações e sistemas especiais": None,
    "Climatização e ventilação": None,
    
    # Acabamentos
    "Revestimento e acabamento de fachada": None,  # 2800 m²
    "Esquadrias e elementos externos": None,  # 950 m²
    "Selagens e arremates": None,
    "Pintura": None,  # 10500 m²
    "Louças, metais e acessórios": None,
    "Bancadas e elementos de acabamento": None,
    "Sinalização e acabamento final": None,
    
    # Externos
    "Calçadas e pavimentação externa": None,  # 900 m²
    "Drenagem externa": None,  # 350 m
    "Muros, gradis e fechamentos": None,  # 500 m
    "Paisagismo e urbanização": None,  # 600 m²
    
    # Finalização
    "Testes e inspeções": None,
    "Comissionamento dos sistemas": None,
    "Correção de pendências": None,
    "As built e documentação": None,
    "Limpeza e desmobilização": None,
    "Entrega e aceite final": None,
}

# Mapeamento de palavras-chave para buscar composições
KEYWORD_MAPPINGS = [
    ("Terraplenagem", ["terraplenagem", "escavação", "aterro"]),
    ("Fundações", ["fundação", "estaca", "bloco de fundação", "sapata"]),
    ("Contenções", ["contenção", "muro de contenção"]),
    ("Pilares", ["pilar", "column"]),
    ("Vigas", ["viga"]),
    ("Lajes", ["laje", "slab"]),
    ("Escadas", ["escada"]),
    ("Alvenarias", ["alvenaria", "vedação", "block", "bloco"]),
    ("Divisórias", ["divisória", "drywall", "partição"]),
    ("Estrutura da cobertura", ["cobertura", "estrutura de cobertura"]),
    ("Telhamento", ["telha", "telhado"]),
    ("Calhes", ["calha", "rufos"]),
    ("Impermeabilização", ["impermeabilização", "impermeabilizante"]),
    ("Chapisco", ["chapisco", "emboço", "reboco"]),
    ("Contrapisos", ["contrapiso"]),
    ("Revestimentos de paredes", ["revestimento", "cerâmica", "azulejo", "pastilha"]),
    ("Revestimentos de pisos", ["piso", "cerâmica", "porcelanato"]),
    ("Forros", ["forro", "gesso", "drywall ceiling"]),
    ("Portas e esquadrias", ["porta", "esquadria", "janela"]),
    ("Vidros", ["vidro"]),
    ("Pintura", ["pintura", "tinta", "latex"]),
    ("Instalações hidrossanitárias", ["hidrossanitário", "hidráulico", "sanitário"]),
    ("Instalações elétricas", ["elétrico", "elétrica"]),
    ("SPDA", ["spda", "aterra", "para-raios"]),
    ("Sistemas de incêndio", ["incêndio", "sprinkler"]),
    ("Drenagem externa", ["drenagem", "dreno"]),
    ("Muros, gradis e fechamentos", ["muro", "gradil", "fechamento", "cerca"]),
    ("Calçadas e pavimentação", ["calçada", "pavimentação", "piso externo"]),
]

def find_composition_for_activity(activity_name):
    """Busca composição SEINFRA apropriada para a atividade."""
    for keyword, search_terms in KEYWORD_MAPPINGS:
        if keyword.lower() in activity_name.lower():
            for term in search_terms:
                try:
                    results = supabase_request(
                        f"service_compositions?description=ilike.*{term}*"
                        f"&select=id,code,description,unit"
                        f"&limit=3"
                    )
                    if results:
                        # Retorna a primeira composição encontrada
                        return results[0]
                except:
                    continue
    return None

def main():
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Iniciando geração de orçamento...")
    
    # 1. Buscar atividades
    activities = supabase_request(
        f"schedule_activities?projectId=eq.{PROJECT_ID}"
        f"&versionId=eq.{VERSION_ID}"
        f"&select=id,name,wbsNodeId,unit,plannedQuantity,durationDays"
        f"&order=id.asc"
    )
    print(f"  Atividades encontradas: {len(activities)}")
    
    # 2. Buscar códigos WBS
    wbs_ids = list(set(a['wbsNodeId'] for a in activities if a.get('wbsNodeId')))
    wbs_nodes = {}
    for wbs_id in wbs_ids:
        try:
            node = supabase_request(f"wbs_nodes?id=eq.{wbs_id}&select=id,code")
            if node:
                wbs_nodes[wbs_id] = node[0]['code']
        except:
            pass
    
    # 3. Criar budget_items
    budget_items = []
    total_cost = 0.0
    mapped_count = 0
    
    for activity in activities:
        name = activity['name']
        unit = activity.get('unit', 'un')
        qty = float(activity.get('plannedQuantity', 0))
        duration = activity.get('durationDays', 0)
        wbs_code = wbs_nodes.get(activity.get('wbsNodeId'), '')
        
        # Buscar composição
        comp = find_composition_for_activity(name)
        
        if comp:
            unit_cost = get_composition_unit_cost(comp['id'])
            total_item_cost = qty * unit_cost
            total_cost += total_item_cost
            mapped_count += 1
            
            budget_items.append({
                "budgetVersionId": BUDGET_VERSION_ID,
                "wbsNodeId": activity.get('wbsNodeId'),
                "code": comp['code'],
                "description": f"{name} — {comp['description']}",
                "unit": comp['unit'],
                "quantity": qty,
                "unitPrice": round(unit_cost, 2),
                "compositionId": comp['id'],
                "compositionUnitCost": round(unit_cost, 2),
                "plannedDurationDays": duration,
                "source": "SEINFRA-CE 028.1",
                "referencePeriod": "2024",
                "compositionNote": f"Gerado automaticamente da composição {comp['code']}",
                "sortOrder": len(budget_items),
            })
        else:
            # Item sem composição - cria item genérico
            budget_items.append({
                "budgetVersionId": BUDGET_VERSION_ID,
                "wbsNodeId": activity.get('wbsNodeId'),
                "code": f"S-{len(budget_items)+1:04d}",
                "description": name,
                "unit": unit,
                "quantity": qty,
                "unitPrice": 0,
                "plannedDurationDays": duration,
                "source": "AURORA TESTE",
                "referencePeriod": "2024",
                "compositionNote": "Sem composição SEINFRA associada",
                "sortOrder": len(budget_items),
            })
    
    print(f"  Composições mapeadas: {mapped_count}/{len(activities)}")
    print(f"  Custo total estimado: R$ {total_cost:,.2f}")
    
    # 4. Inserir no banco (batch)
    print(f"\n[{datetime.now().strftime('%H:%M:%S')}] Inserindo {len(budget_items)} itens...")
    
    try:
        result = supabase_request(
            "budget_items?on_conflict=budgetVersionId,code",
            method="POST",
            data=budget_items
        )
        print(f"  ✅ {len(result)} itens inseridos com sucesso")
    except Exception as e:
        print(f"  ❌ Erro ao inserir: {e}")
        # Tenta inserir um por um
        success = 0
        for item in budget_items:
            try:
                supabase_request("budget_items", method="POST", data=item)
                success += 1
            except:
                pass
        print(f"  ✅ {success}/{len(budget_items)} itens inseridos individualmente")
    
    print(f"\n[{datetime.now().strftime('%H:%M:%S')}] Concluído!")
    print(f"  Total de itens: {len(budget_items)}")
    print(f"  Mapeados com SEINFRA: {mapped_count}")
    print(f"  Sem composição: {len(budget_items) - mapped_count}")
    print(f"  Custo total: R$ {total_cost:,.2f}")

if __name__ == "__main__":
    main()
