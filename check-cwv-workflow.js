const fs = require('fs');
const wf = JSON.parse(fs.readFileSync('c:\\Users\\john.kelly\\Documents\\GitHub\\traffic-analyzer-for-infra\\cwv-jk-workflow.json', 'utf8'));
const tasks = Object.keys(wf.tasks);
console.log('Total tasks:', tasks.length);

console.log('\n=== DQL tasks ===');
const dqlTasks = tasks.filter(t => wf.tasks[t].action === 'dynatrace.automations:execute-dql-query');
console.log('Count:', dqlTasks.length);
dqlTasks.forEach(t => {
  const q = wf.tasks[t].input.query;
  const limits = q.match(/\blimit\s+\d+/gi) || [];
  const hasDollar = /\$[A-Za-z]/.test(q);
  const hasUserEvents = /\buser\.events\b/.test(q);
  const hasUserUnderscore = /\buser_events\b/.test(q);
  const tf = wf.tasks[t].input.timeframe || null;
  console.log(`  ${t} | limits: [${limits}] | has_dollar: ${hasDollar} | user.events: ${hasUserEvents} | user_events: ${hasUserUnderscore} | timeframe: ${JSON.stringify(tf)}`);
});

console.log('\n=== Prompt tasks ===');
const promptTasks = tasks.filter(t => wf.tasks[t].action === 'dynatrace.davis.copilot.workflow.actions:davis-copilot');
console.log('Count:', promptTasks.length);
promptTasks.forEach(t => {
  const pred = wf.tasks[t].predecessors;
  const conds = Object.keys(wf.tasks[t].conditions?.states || {});
  console.log(`  ${t} | predecessors: [${pred}] | conditions: [${conds}]`);
});

console.log('\n=== Email tasks ===');
const emailTasks = tasks.filter(t => wf.tasks[t].action === 'dynatrace.email:send-email');
console.log('Count:', emailTasks.length);
emailTasks.forEach(t => {
  console.log(`  ${t} | to: ${JSON.stringify(wf.tasks[t].input.to)} | predecessors: [${wf.tasks[t].predecessors}]`);
});

console.log('\n=== Overall prompt ===');
if (wf.tasks.overall_prompt) {
  const op = wf.tasks.overall_prompt;
  console.log('predecessors count:', op.predecessors.length);
  console.log('conditions count:', Object.keys(op.conditions.states).length);
  console.log('supplementary refs count:', (op.input.supplementary.match(/result\(/g) || []).length);
}

// Balance check
console.log('\n=== Balance check ===');
dqlTasks.forEach(t => {
  const q = wf.tasks[t].input.query;
  let parens = 0, brackets = 0, braces = 0;
  let inString = false, strChar = '';
  for (let i = 0; i < q.length; i++) {
    const c = q[i];
    if (inString) { if (c === strChar && q[i-1] !== '\\') inString = false; continue; }
    if (c === '"' || c === "'") { inString = true; strChar = c; continue; }
    if (c === '/' && q[i+1] === '/') { while (i < q.length && q[i] !== '\n') i++; continue; }
    if (c === '(') parens++;
    if (c === ')') parens--;
    if (c === '[') brackets++;
    if (c === ']') brackets--;
    if (c === '{') braces++;
    if (c === '}') braces--;
  }
  if (parens !== 0 || brackets !== 0 || braces !== 0) {
    console.log(`  UNBALANCED: ${t} | parens: ${parens} | brackets: ${brackets} | braces: ${braces}`);
  }
});
console.log('Balance check complete.');

// Print full queries for review
console.log('\n=== Full DQL Queries ===');
dqlTasks.forEach(t => {
  console.log(`\n--- ${t} ---`);
  console.log(wf.tasks[t].input.query);
});
