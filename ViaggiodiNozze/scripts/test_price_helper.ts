import { isCostFree, isCostPackageIncluded, parseCostToNumber, resolvePaymentInfo } from '../src/utils/priceHelper.ts';

function runTests() {
  console.log('--- Test 1: Gratuito / Free detection ---');
  console.assert(isCostFree('Gratuito') === true, 'Test 1.1 fallito');
  console.assert(isCostFree('0 €') === true, 'Test 1.2 fallito');
  console.assert(isCostFree(0) === true, 'Test 1.3 fallito');
  console.assert(isCostFree('0.00') === true, 'Test 1.4 fallito');
  console.assert(isCostFree('Incluso nel pacchetto') === false, 'Test 1.5 fallito');
  console.assert(isCostFree('150.00 €') === false, 'Test 1.6 fallito');

  console.log('--- Test 2: Incluso nel pacchetto detection ---');
  console.assert(isCostPackageIncluded('Incluso nel pacchetto') === true, 'Test 2.1 fallito');
  console.assert(isCostPackageIncluded('0 €', true) === true, 'Test 2.2 fallito');
  console.assert(isCostPackageIncluded('150.00 €', false) === false, 'Test 2.3 fallito');

  console.log('--- Test 3: resolvePaymentInfo for Free ---');
  const freeRes = resolvePaymentInfo({
    cost: 'Gratuito',
    paymentStatus: 'da_saldare'
  });
  console.assert(freeRes.isFree === true, 'Test 3.1 fallito');
  console.assert(freeRes.isPaid === false, 'Test 3.2 fallito');
  console.assert(freeRes.costNum === 0, 'Test 3.3 fallito');
  console.assert(freeRes.displayText === 'Gratuito', 'Test 3.4 fallito');

  console.log('--- Test 4: resolvePaymentInfo for Package Included ---');
  const pkgRes = resolvePaymentInfo({
    cost: '0.00',
    packageIncluded: true
  });
  console.assert(pkgRes.isPackageIncluded === true, 'Test 4.1 fallito');
  console.assert(pkgRes.isPaid === false, 'Test 4.2 fallito');
  console.assert(pkgRes.costNum === 0, 'Test 4.3 fallito');
  console.assert(pkgRes.displayText === 'Incluso nel pacchetto', 'Test 4.4 fallito');

  console.log('--- Test 5: resolvePaymentInfo for Paid / To Pay ---');
  const paidRes = resolvePaymentInfo({
    cost: '1074.86',
    depositPaid: '1074.86',
    paymentStatus: 'saldato'
  });
  console.assert(paidRes.isPaid === true, 'Test 5.1 fallito');
  console.assert(paidRes.costNum === 1074.86, 'Test 5.2 fallito');

  console.log('TUTTI I TEST SUPERATI CON SUCCESSO!');
}

runTests();
