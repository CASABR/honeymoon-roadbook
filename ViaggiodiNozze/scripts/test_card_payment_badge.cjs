const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname,'..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(read('src/utils/priceHelper.ts'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, {
  exports: exportsObject, require: name => {
    assert.equal(name,'../services/currencyService');
    return { roundEur: n => Math.round(n*100)/100 };
  }
});
const badge = exportsObject.resolveCardPaymentBadge;
const base = {costNum: 100, remainingNum: 40, paidNum: 60, isPaid: false, isEstimatedConversion: false, compactPaymentText: '€40 da saldare · Acc. €60'};
assert.equal(badge(base).text,'€40');
assert.equal(badge(base).className,'hounigo-ds-pay-dasaldare');
assert.equal(badge(base).accessibleLabel,base.compactPaymentText);
assert.equal(badge({...base,isPaid:true,remainingNum:0}).text,'€100');
assert.equal(badge({...base,isPaid:true}).className,'hounigo-ds-pay-saldato');
assert.equal(badge({...base,remainingNum:59.8,isEstimatedConversion:true}).text,'~€59,80');
for (const name of ['Alloggio','Attivita','Ristorante','Shopping','Trasporto']) {
  const code = read('src/components/cards/'+name+'Card.tsx');
  assert.match(code,/resolveCardPaymentBadge\(paymentInfo\)\.text/);
  assert.match(code,/resolveCardPaymentBadge\(paymentInfo\)\.className/);
  assert.doesNotMatch(code,/\{(?:paymentInfo\.)?compactPaymentText\}/);
}
console.log('PASS: compact payment amount, remaining balance, estimate marker and all five card types');
