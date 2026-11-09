import {test,expect} from './fixtures';

// Preserve the original official assertions without pretending a synthetic base is official.
test.use({officialDataDir:process.env.E2E_OFFICIAL_DATA_DIR});
test.skip(!process.env.E2E_OFFICIAL_DATA_DIR,'Base oficial de setembro ausente: informe diretório privado com dataset.enc e encryption.key.');
test('regressão dos saldos oficiais de setembro, Q2 e faixa acima de 180 dias',async({page})=>{
 await page.goto('/');
 await expect(page.getByTestId('financial-reference')).toContainText('30/09/2026');
 await expect(page.locator('.kpi').first()).toContainText('8.489.909,79');
 await expect(page.locator('.kpi').nth(1)).toContainText('504');
 await page.getByLabel('Quarter',{exact:true}).click();await page.getByText('Q2',{exact:true}).first().click();await page.getByLabel('Quarter',{exact:true}).click();
 await expect(page.locator('.kpi').first()).toContainText('8.127.399,40');
 await page.getByRole('button',{name:'Limpar filtros'}).click();
 await page.getByRole('button',{name:/Acima de 180 dias/}).first().click();
 await expect(page.locator('.kpi').first()).toContainText('187.446,00');
});
