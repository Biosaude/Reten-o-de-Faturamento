import {ranking,type Dimension,type Surgery} from './domain';

export function weightedRetentionDays(values:Iterable<{days:number;cents:number}>):number {
 let weighted=0,total=0;
 for(const value of values){weighted+=value.days*value.cents;total+=value.cents;}
 return total>0?weighted/total:0;
}

// Executive presentation only: general KPI averages and existing exports stay unchanged.
export function executiveRanking(surgeries:Surgery[],dimension:Dimension,reference:string|null,totalPending:number){
 const weights=new Map<string,{days:number;cents:number}[]>();
 if(reference)for(const surgery of surgeries)for(const record of surgery.records){
  if(record.billingDate&&record.billingDate<=reference)continue;
  const values=weights.get(record[dimension])??[];
  values.push({days:surgery.days,cents:record.cents});weights.set(record[dimension],values);
 }
 return ranking(surgeries,dimension).map(item=>({...item,
  share:totalPending>0?item.cents/totalPending:0,
  weightedMean:weightedRetentionDays(weights.get(item.name)??[]),
 }));
}

export const formatRankingPercent=(share:number)=>new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(share*100)+'%';
export const formatWeightedDays=(days:number)=>new Intl.NumberFormat('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1}).format(days);
