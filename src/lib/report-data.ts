import {buildView,type Dataset,type Filters} from './domain';
export function reportRows(ds:Dataset,f:Filters){
 const v=buildView(ds,f);
 const details=v.surgeries.map(s=>[s.company,s.appointment,s.surgeryDate,s.type,s.customer,s.customerUF,s.hospital,s.hospitalUF,s.doctor,s.representative,s.total/100,s.billed/100,s.pending/100,s.band!==null?s.days:null,s.band!==null?v.summary.bands[s.band].label:'—',s.status]);
 const summary=[['Data de corte da base',ds.asOf],['Fechamento',v.period.end??'Sem período disponível'],['Filtros',JSON.stringify(f)],['Última atualização',ds.updatedAt],['Pendente (R$)',v.summary.pending/100],['Cirurgias pendentes',v.summary.count],['Retenção média (dias)',v.summary.mean],['Faturado no período (R$)',v.flowCents/100],['Cirurgias faturadas no período',v.flowCount],['Parcialmente faturadas',v.summary.partial],['Quarentena (R$)',ds.audit.quarantinedCents/100]];
 return {v,details,summary};
}
