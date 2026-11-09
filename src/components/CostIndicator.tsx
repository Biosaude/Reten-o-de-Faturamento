import {Wallet} from 'lucide-react';
import {fmtMoney,fmtNumber} from '../lib/domain';
import type {retainedCost} from '../lib/retention-cost';
type Cost=ReturnType<typeof retainedCost>;
export const costLabel=(cost:Cost)=>cost.cents===null?'Indisponível':`${fmtMoney(cost.cents)}${cost.coveredRows<cost.eligibleRows?' (parcial)':''}`;
export function CostIndicator({cost}:{cost:Cost}){
 return <section className="panel cost-indicator" aria-label="Retenção a Preço de Custo">
  <div className="cost-value"><p>Retenção a Preço de Custo</p><strong data-testid="retained-cost">{costLabel(cost)}</strong><small>Custo informado das linhas pendentes · sem rateio</small></div>
  <div><span>Custo sobre o valor retido</span><b data-testid="retained-cost-percent">{cost.percent===null?'Indisponível':`${fmtNumber(cost.percent*100,2)}%`}</b><small>Calculado somente com cobertura integral e saldo positivo</small></div>
  <div><span>Cobertura dos registros pendentes</span><b data-testid="retained-cost-coverage">{cost.coveredRows} de {cost.eligibleRows}{cost.coverage===null?'':` · ${fmtNumber(cost.coverage*100,1)}%`}</b><small>Ausência de custo não equivale a custo zero</small></div><Wallet size={20}/>
 </section>;
}
