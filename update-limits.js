const fs = require('fs');
const wf = JSON.parse(fs.readFileSync('c:\\Users\\john.kelly\\Documents\\GitHub\\traffic-analyzer-for-infra\\services-overview-jk-workflow.json', 'utf8'));

const dqlTasks = Object.entries(wf.tasks).filter(([k, v]) => v.action === 'dynatrace.automations:execute-dql-query');

dqlTasks.forEach(([k, v]) => {
  let q = v.input.query;
  
  // Replace all limit N with limit 50
  q = q.replace(/\blimit\s+\d+/gi, 'limit 50');
  
  // For process_memory_used which has duplicate limit lines, deduplicate
  // Remove consecutive duplicate "| limit 50" lines
  q = q.replace(/([\r\n]\| limit 50)([\r\n]\| limit 50)/g, '$1');
  // Also handle without pipe
  q = q.replace(/([\r\n]limit 50)([\r\n]limit 50)/g, '$1');
  
  v.input.query = q;
});

fs.writeFileSync('c:\\Users\\john.kelly\\Documents\\GitHub\\traffic-analyzer-for-infra\\services-overview-jk-workflow.json', JSON.stringify(wf, null, 2), 'utf8');
console.log('Updated all limits to 50');

// Verify
dqlTasks.forEach(([k, v]) => {
  const m = v.input.query.match(/\blimit\s+(\d+)/gi);
  console.log(k, ':', m ? m.join(', ') : 'NO LIMIT');
});
