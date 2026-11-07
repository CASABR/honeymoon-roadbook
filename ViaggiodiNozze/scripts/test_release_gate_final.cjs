const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const results = [];
function run(label, executable, args, timeout = 120000) {
  const result = spawnSync(executable, args, { cwd: root, stdio: 'inherit', windowsHide: true, timeout });
  results.push([label, result.status === 0 && !result.error ? 'PASS' : 'FAIL']);
  if (result.error) console.error(result.error.message);
}
run('Production build', process.platform === 'win32' ? 'cmd.exe' : 'npm', process.platform === 'win32' ? ['/d','/s','/c','npm run build'] : ['run','build']);
for (const file of ['test_prebeta_final_corrections.cjs','test_public_bundle_privacy.cjs','test_p0_queue_release.cjs','test_release_gate_emulator.cjs']) {
  run(file, process.execPath, [path.join(__dirname,file)]);
}
run('Git diff whitespace', 'git', ['diff','--check']);
run('Git status', 'git', ['status','--short']);
run('Git diff scope', 'git', ['diff','--stat']);
console.table(results.map(([check,result])=>({check,result})));
if (results.some(([,result])=>result==='FAIL')) process.exitCode = 1;
