const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

console.log('========================================================================');
console.log('HOUNIGO — VERIFICA AUTOMAZIONE DEPLOY (ANTIGRAVITY, TERMINALE & CHATGPT)');
console.log('========================================================================\n');

const root = path.resolve(__dirname, '../..');

// 1. VERIFICA SCHEMA E FILE DI RICHIESTA CHATGPT
const schemaPath = path.join(root, '.github/hounigo-deploy-request.schema.json');
const requestPath = path.join(root, '.github/hounigo-deploy-request.json');
const deployWorkflowPath = path.join(root, '.github/workflows/deploy.yml');
const deployScriptPath = path.join(root, 'scripts/deploy-actions.ps1');

assert.ok(fs.existsSync(schemaPath), 'hounigo-deploy-request.schema.json deve esistere');
assert.ok(fs.existsSync(requestPath), 'hounigo-deploy-request.json deve esistere');
assert.ok(fs.existsSync(deployWorkflowPath), 'deploy.yml deve esistere');
assert.ok(fs.existsSync(deployScriptPath), 'deploy-actions.ps1 deve esistere');

const requestJson = JSON.parse(fs.readFileSync(requestPath, 'utf8'));
assert.equal(requestJson.action, 'dry-run', 'La richiesta iniziale deve essere tassativamente dry-run per sicurezza');
assert.equal(requestJson.requestedBy, 'CASABR', 'Richiedente autorizzato');
assert.ok(requestJson.requestId, 'requestId deve essere presente');
assert.equal(requestJson.confirm, '', 'confirm iniziale deve essere vuoto');

console.log('✓ 1. File di richiesta ChatGPT e Schema JSON conformi.');

// 2. VERIFICA CONFIGURAZIONE deploy.yml
const workflowContent = fs.readFileSync(deployWorkflowPath, 'utf8');

assert.ok(
  workflowContent.includes("paths:\n      - '.github/hounigo-deploy-request.json'"),
  'deploy.yml deve intercettare push ESCLUSIVAMENTE sul file .github/hounigo-deploy-request.json'
);
assert.ok(
  workflowContent.includes('workflow_dispatch:'),
  'deploy.yml deve mantenere workflow_dispatch per Antigravity e PowerShell'
);
assert.ok(
  workflowContent.includes('github.actor') && workflowContent.includes('CASABR'),
  'deploy.yml deve verificare tassativamente che github.actor sia CASABR'
);
assert.ok(
  workflowContent.includes('CONFIRM_VAL') && workflowContent.includes('CONFERMA'),
  'deploy.yml deve richiedere esplicitamente CONFERMA per deploy reale'
);

console.log('✓ 2. Workflow deploy.yml configurato con doppi trigger e protezioni rigorose.');

// 3. SIMULAZIONE LOGICA DI VALIDAZIONE RICHIESTE CHATGPT
function validateDeployRequest({ actor, repoOwner = 'CASABR', requestData }) {
  if (actor !== 'CASABR' && repoOwner !== actor) {
    return { ok: false, error: 'Unauthorized actor' };
  }
  if (!requestData.requestId || !requestData.action) {
    return { ok: false, error: 'Missing requestId or action' };
  }
  if (!['dry-run', 'deploy', 'rollback'].includes(requestData.action)) {
    return { ok: false, error: 'Invalid action' };
  }
  const isRealDeploy = requestData.action === 'deploy' || requestData.action === 'rollback';
  if (isRealDeploy && requestData.confirm !== 'CONFERMA') {
    return { ok: false, error: 'Missing CONFERMA' };
  }
  if (requestData.action === 'rollback' && (!requestData.ref || requestData.ref === 'main')) {
    return { ok: false, error: 'Rollback requires specific commit SHA' };
  }
  return {
    ok: true,
    action: requestData.action,
    ref: requestData.ref || 'main',
    shouldDeploy: isRealDeploy && requestData.confirm === 'CONFERMA'
  };
}

// Test Casi di Validazione:
// A) Attore non autorizzato -> BLOCCATO
const testActor = validateDeployRequest({
  actor: 'malicious_user',
  requestData: { requestId: 'req-1', action: 'deploy', ref: 'main', confirm: 'CONFERMA' }
});
assert.equal(testActor.ok, false);
assert.equal(testActor.error, 'Unauthorized actor');

// B) Deploy reale senza digitazione esatta CONFERMA -> BLOCCATO
const testNoConfirm = validateDeployRequest({
  actor: 'CASABR',
  requestData: { requestId: 'req-2', action: 'deploy', ref: 'main', confirm: 'conferma' }
});
assert.equal(testNoConfirm.ok, false);
assert.equal(testNoConfirm.error, 'Missing CONFERMA');

// C) Dry-run valido -> PASS, shouldDeploy=false
const testDryRun = validateDeployRequest({
  actor: 'CASABR',
  requestData: { requestId: 'req-3', action: 'dry-run', ref: 'main' }
});
assert.equal(testDryRun.ok, true);
assert.equal(testDryRun.shouldDeploy, false);

// D) Deploy reale valido -> PASS, shouldDeploy=true
const testDeploy = validateDeployRequest({
  actor: 'CASABR',
  requestData: { requestId: 'req-4', action: 'deploy', ref: 'main', confirm: 'CONFERMA' }
});
assert.equal(testDeploy.ok, true);
assert.equal(testDeploy.shouldDeploy, true);

// E) Rollback su commit specifico con conferma -> PASS, shouldDeploy=true
const testRollback = validateDeployRequest({
  actor: 'CASABR',
  requestData: { requestId: 'req-5', action: 'rollback', ref: '86435b5', confirm: 'CONFERMA' }
});
assert.equal(testRollback.ok, true);
assert.equal(testRollback.shouldDeploy, true);
assert.equal(testRollback.ref, '86435b5');

// F) Rollback senza commit specifico -> BLOCCATO
const testRollbackNoRef = validateDeployRequest({
  actor: 'CASABR',
  requestData: { requestId: 'req-6', action: 'rollback', ref: 'main', confirm: 'CONFERMA' }
});
assert.equal(testRollbackNoRef.ok, false);
assert.equal(testRollbackNoRef.error, 'Rollback requires specific commit SHA');

console.log('✓ 3. Tutti i test di validazione logica (attore, permessi, dry-run, deploy, rollback) superati.');

console.log('\n========================================================================');
console.log('🎉 TUTTE LE VERIFICHE SULLA PIPELINE AUTOMATICA SUPERATE (PASS)');
console.log('========================================================================\n');
