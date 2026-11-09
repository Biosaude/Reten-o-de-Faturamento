import {retainedCost,validCost} from './retention-cost.js';
import {buildView,type Dataset,type Filters} from './domain.js';
export function reportRows(ds:Dataset,f:Filters){
 const v=buildView(ds,f);
 const details=v.surgeries.map(s=>{const cost=retainedCost([s]);return [s.company,s.appointment,s.surgeryDate,s.type,s.customer,s.customerUF,s.hospital,s.hospitalUF,s.doctor,s.representative,s.total/100,s.billed/100,s.pending/100,s.band!==null?s.days:null,s.band!==null?v.summary.bands[s.band].label:'—',s.status,cost.cents===null?null:cost.cents/100,cost.coveredRows,cost.eligibleRows];});
 const summary=[['Data de corte da base',ds.asOf],['Fechamento',v.period.end??'Sem período disponível'],['Filtros',JSON.stringify(f)],['Última atualização',ds.updatedAt],['Pendente (R$)',v.summary.pending/100],['Cirurgias pendentes',v.summary.count],['Retenção média (dias)',v.summary.mean],['Faturado no período (R$)',v.flowCents/100],['Cirurgias faturadas no período',v.flowCount],['Parcialmente faturadas',v.summary.partial],['Quarentena (R$)',ds.audit.quarantinedCents/100]];
 const cost=v.summary.cost;
 summary.push(['Retenção a Preço de Custo (R$)',cost.cents===null?'Indisponível':cost.cents/100],['Cobertura de custo',`${cost.coveredRows} de ${cost.eligibleRows} registros pendentes`],['Custo sobre o valor retido',cost.percent===null?'Indisponível':`${(cost.percent*100).toFixed(2)}%`],['Premissa do custo','Custo informado das linhas pendentes, sem rateio; soma parcial quando a cobertura é incompleta.']);
 return {v,details,summary};
}

export function costReportRows(ds:Dataset,f:Filters){
 const v=buildView(ds,f);
 return [['Análise','Referência','Custo retido conhecido (R$)','Registros com custo','Registros pendentes','Cobertura'],
 ...v.monthly.map(m=>['Mensal',m.at,m.cost.cents===null?null:m.cost.cents/100,m.cost.coveredRows,m.cost.eligibleRows,m.cost.coverage]),
 ...v.quarterly.map(q=>['Trimestral',q.at,q.cost.cents===null?null:q.cost.cents/100,q.cost.coveredRows,q.cost.eligibleRows,q.cost.coverage]),
 ...v.summary.bands.map(b=>['Faixa',b.label,b.cost.cents===null?null:b.cost.cents/100,b.cost.coveredRows,b.cost.eligibleRows,b.cost.coverage])];
}
export const recordCostValue=(r:import('./domain.js').FinancialRecord)=>validCost(r.costCents)?r.costCents/100:null;
