"""Read-only, independent Excel/Decimal reconciliation. Prints aggregates only.

Usage: python3 scripts/reconcile_cost.py source.xlsx private-engine.json
The engine JSON contains {dataset, checks:[{filters, result}]}.
Never commits the source workbook or the private engine artifact.
"""
import json
import re
import sys
import unicodedata
from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from openpyxl import load_workbook
from openpyxl.utils.datetime import from_excel

def text(value):
    if value is None:
        return ''
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()

def header(value):
    return ' '.join(''.join(c for c in unicodedata.normalize('NFD', text(value)) if not unicodedata.combining(c)).lower().split())

def cents(value):
    value=re.sub(r'\s+', '', text(value).replace('R$', ''))
    if ',' in value:
        value=value.replace('.', '').replace(',', '.')
    if not re.fullmatch(r'-?\d+(?:\.\d+)?', value):
        return None
    result=int((Decimal(value)*100).quantize(Decimal('1'), rounding=ROUND_HALF_UP))
    return result if abs(result)<=9007199254740991 else None

book=load_workbook(sys.argv[1], data_only=True, read_only=True)
sheet=book.worksheets[0]
names=[header(v) for v in next(sheet.iter_rows(values_only=True))]
columns={name:i for i,name in enumerate(names)}
def iso(value):
    if isinstance(value,(date,datetime)):
        return value.strftime('%Y-%m-%d')
    if isinstance(value,(int,float)) and 1<=value<2958466:
        return from_excel(int(value),book.epoch).strftime('%Y-%m-%d')
    value=text(value)
    try:
        if re.fullmatch(r'\d{4}-\d{2}-\d{2}(?:T.*)?',value):
            return date.fromisoformat(value[:10]).isoformat()
        if re.fullmatch(r'\d{1,2}/\d{1,2}/\d{4}',value):
            d,m,y=map(int,value.split('/'))
            return date(y,m,d).isoformat()
    except ValueError:
        pass
    return None

dims={'company':'Empresa','type':'Tipo da Cirurgia','customer':'Cliente de Faturamento','customerUF':'UF do Cliente','hospital':'Hospital','hospitalUF':'UF do Hospital','doctor':'Médico','representative':'Representante Principal'}
rows=[]
for number,values in enumerate(sheet.iter_rows(min_row=2,values_only=True),2):
    if not any(v is not None and v!='' for v in values):
        continue
    def get(name):
        return values[columns[header(name)]]
    company=text(get('Empresa')).upper()
    appointment=text(get('Agendamento'))
    surgery,billing=iso(get('Data da Cirurgia')),iso(get('Data Faturamento Vale'))
    amount=cents(get('Valor total'))
    raw_cost=get('Custo médio total')
    cost=cents(raw_cost)
    if cost is not None and (cost<0 or text(raw_cost).replace('R$','').strip().startswith('-')):
        cost=None
    invalid=not company or not appointment or not surgery or bool(text(get('Data Faturamento Vale')) and not billing) or bool(surgery and billing and billing<surgery) or amount is None or amount<0
    dimensions={dim:(text(get(name)).upper() if dim in ['company','customerUF','hospitalUF'] else text(get(name))) or 'Não informado' for dim,name in dims.items()}
    rows.append(dict(row=number,key=(company,appointment),surgery=surgery,billing=billing,amount=amount,cost=cost,invalid=invalid,dims=dimensions))
groups=defaultdict(list)
for row in rows:
    if not row['invalid']:
        groups[row['key']].append(row)
for group in groups.values():
    if len({r['surgery'] for r in group})>1:
        for row in group:
            row['invalid']=True
valid=[r for r in rows if not r['invalid']]
engine=json.load(open(sys.argv[2],encoding='utf8'))
dataset=engine['dataset']
actual={r['sourceRow']:r for r in dataset['records']}
assert set(actual)=={r['row'] for r in valid},'Valid row set differs'
for row in valid:
    record=actual[row['row']]
    assert record['cents']==row['amount'] and record.get('costCents')==row['cost'], 'Money interpretation differs'
assert dataset['audit']['quarantinedRows']==len(rows)-len(valid)
reports=[]
for check in engine['checks']:
    filters=check['filters']
    at=check['at']
    selected=defaultdict(list)
    for row in valid:
        if row['surgery']<=at and all(not filters.get(dim) or row['dims'][dim] in filters[dim] for dim in dims):
            selected[row['key']].append(row)
    retained=[]
    included=False
    for group in selected.values():
        pending=[r for r in group if not r['billing'] or r['billing']>at]
        billed=[r for r in group if r['billing'] and r['billing']<=at]
        status='Parcialmente faturada' if pending and billed else 'Totalmente pendente' if pending else 'Totalmente faturada'
        age=(date.fromisoformat(at)-date.fromisoformat(group[0]['surgery'])).days
        band=next((i for i,n in enumerate([45,90,135,180]) if age<=n),4) if pending else None
        if filters.get('statuses') and status not in filters['statuses']:
            continue
        if filters.get('bands') and band not in filters['bands']:
            continue
        included=True
        retained.extend(pending)
    covered=[r for r in retained if r['cost'] is not None]
    expected=dict(pendingCents=sum(r['amount'] for r in retained),costCents=sum(r['cost'] for r in covered) if covered else 0 if not retained and included else None,eligibleRows=len(retained),coveredRows=len(covered))
    assert check['result']==expected, 'Independent retained cost differs'
    # Do not output dimension values, identities, source rows, or patient data.
    reports.append(dict(at=at,filtered=any(filters.get(k) for k in [*dims,'statuses','bands']),**expected))
print(json.dumps(dict(sourceRows=len(rows),validRows=len(valid),quarantinedRows=len(rows)-len(valid),checks=reports),ensure_ascii=False,indent=2))
