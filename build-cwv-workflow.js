const fs = require('fs');
const dashboard = JSON.parse(fs.readFileSync('c:\\Users\\john.kelly\\Documents\\GitHub\\traffic-analyzer-for-infra\\cwv-jk-dashboard-clean.json', 'utf8'));

// Read example workflow for structure reference
// Build tiles list - exclude data record tiles
const tiles = dashboard.tiles;
const dqlTiles = [];

Object.entries(tiles).forEach(([id, t]) => {
  const q = (t.query || '').trim();
  if (!q) return;
  if (q.startsWith('data record')) return;
  dqlTiles.push({ id, title: t.title || `tile${id}`, query: q });
});

console.log(`Found ${dqlTiles.length} DQL tiles to include`);

// Generate task names from titles, with dedup tracking
const usedNames = {};
function makeTaskName(title, id) {
  let name = title.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!name || name.length < 2) name = `tile${id}`;
  
  // Handle duplicates by appending _trend suffix (the second occurrences are trend charts)
  if (usedNames[name]) {
    name = name + '_trend';
  }
  // If still a duplicate, append tile id
  if (usedNames[name]) {
    name = name + '_' + id;
  }
  usedNames[name] = true;
  return name;
}

// Process queries: remove $ filters, fix user_events, set limit 50, add timeframe
function processQuery(q) {
  // Fix user_events -> user.events (per instructions)
  q = q.replace(/\bfetch\s+user_events\b/g, 'fetch user.events');

  // Remove lines with $ variable filters
  let lines = q.split('\n');
  lines = lines.filter(line => !/\$[A-Za-z]/.test(line));
  q = lines.join('\n');

  // Clean up dangling filter/comma issues from removed lines
  q = q.replace(/,\s*\n\s*\)/g, '\n)');
  q = q.replace(/\bfilter:\s*\n\s*and\b/g, 'filter:\n');
  q = q.replace(/\band\s*\n\s*$/gm, '');

  // Handle limits: override existing to 50, or add limit 50
  if (/\blimit\s+\d+/i.test(q)) {
    q = q.replace(/\blimit\s+\d+/gi, 'limit 50');
  } else {
    q = q.trimEnd() + '\n| limit 50';
  }

  // Remove duplicate consecutive limit lines
  q = q.replace(/([\r\n]\| limit 50)([\r\n]\| limit 50)/g, '$1');

  return q;
}

// Build the workflow
const workflow = {
  title: "Frontend Observability for CWV - jk",
  description: "This Workflow generates Frontend Observability for CWV reports and emails to the specified addresses.",
  ownerType: "USER",
  isPrivate: true,
  schemaVersion: 4,
  trigger: {},
  result: null,
  type: "STANDARD",
  input: {},
  hourlyExecutionLimit: 10,
  guide: "# Frontend Observability for CWV Report\nGet a report of your Core Web Vitals. This Workflow queries Grail and provides data to Dynatrace Intelligence to get recommendations.\nThese recommendations are then sent to email(s) of your choice.\n\n# Setup\n1. Change emails (`to`, `cc`, `bcc`) to be an array of strings.\n2. Test with a manual Run, by click the `Run` button.\n3. If everything works as expected, change the [Trigger](?trigger=) to a schedule, e.g. Weekly, Daily, etc.",
  tasks: {}
};

const promptTaskNames = [];
let xPos = -Math.floor(dqlTiles.length / 2);

dqlTiles.forEach((tile, idx) => {
  const taskName = makeTaskName(tile.title, tile.id);
  const promptName = taskName + '_prompt';
  const processedQuery = processQuery(tile.query);
  
  // Determine if query starts with data json
  const startsWithDataJson = processedQuery.trim().startsWith('data json:');
  
  // DQL task
  const dqlTask = {
    name: taskName,
    input: {
      query: processedQuery
    },
    action: "dynatrace.automations:execute-dql-query",
    position: { x: xPos + idx, y: 1 },
    description: "Make use of Dynatrace Grail data in your workflow.",
    predecessors: []
  };
  
  // Add timeframe if not data json
  if (!startsWithDataJson) {
    dqlTask.input.timeframe = "from: @d-1d, to: @d";
  }

  // Prompt task
  const reportTitle = tile.title || `Tile ${tile.id}`;
  const promptTask = {
    name: promptName,
    input: {
      config: "disabled",
      prompt: `Provide a report for the following use case:\n## ${reportTitle} Analysis Report\n`,
      autoTrim: true,
      instruction: "Provide a Summary, Insights, Observations and Recommendations.",
      supplementary: `Format examples in tables instead of bulleted lists.\nWhere applicable convert units for readability, e.g. 1000000000 bytes is 1 TiB.\nWhere applicable show relative percentages, e.g. 100 used and 1000 allocatable is 10% utilized.\nUse this analysis:\n{{result("${taskName}")["records"]}}\n`
    },
    action: "dynatrace.davis.copilot.workflow.actions:davis-copilot",
    position: { x: xPos + idx, y: 2 },
    conditions: {
      states: { [taskName]: "OK" }
    },
    description: "Prompt the Dynatrace Intelligence generative AI",
    predecessors: [taskName]
  };

  workflow.tasks[taskName] = dqlTask;
  workflow.tasks[promptName] = promptTask;
  promptTaskNames.push(promptName);
});

// Overall prompt
const overallConditions = {};
promptTaskNames.forEach(n => { overallConditions[n] = "OK"; });

const supplementaryRefs = promptTaskNames.map(n => `{{result("${n}").text}}`).join('\n');

workflow.tasks.overall_prompt = {
  name: "overall_prompt",
  input: {
    config: "disabled",
    prompt: "Provide a report for the following use case:\n## Frontend Observability for CWV Dashboard Executive Report",
    autoTrim: true,
    instruction: "Provide a Summary, Insights, Observations and Recommendations.",
    supplementary: `Format examples in tables instead of bulleted lists.\nUse this analysis:\n${supplementaryRefs}\n\n`
  },
  action: "dynatrace.davis.copilot.workflow.actions:davis-copilot",
  position: { x: 0, y: 3 },
  conditions: { states: overallConditions },
  description: "Prompt the Dynatrace Intelligence generative AI",
  predecessors: [...promptTaskNames]
};

// Exec email
workflow.tasks.email_exec_report = {
  name: "email_exec_report",
  input: {
    cc: [],
    to: ["john.kelly@dynatrace.com"],
    bcc: [],
    content: '#\n# Dashboard Overall Summary \n#\n{{result("overall_prompt").text}}\n',
    subject: "Dynatrace Frontend Observability for CWV Dashboard Executive Summary Report"
  },
  action: "dynatrace.email:send-email",
  position: { x: 1, y: 4 },
  conditions: { states: { overall_prompt: "OK" } },
  description: "Send email",
  predecessors: ["overall_prompt"]
};

// Detail email
const detailContent = '#\n# Dashboard Overall Summary\n#\n{{result("overall_prompt").text}}\n#\n# Dashboard Tile Summary\n#\n' +
  promptTaskNames.map(n => `{{result("${n}").text}}`).join('\n') + '\n';

workflow.tasks.email_dashboard_report = {
  name: "email_dashboard_report",
  input: {
    cc: [],
    to: ["john.kelly@dynatrace.com"],
    bcc: [],
    content: detailContent,
    subject: "Dynatrace Frontend Observability for CWV Dashboard Tile Report"
  },
  action: "dynatrace.email:send-email",
  position: { x: -1, y: 4 },
  conditions: { states: { overall_prompt: "OK" } },
  description: "Send email",
  predecessors: ["overall_prompt"]
};

fs.writeFileSync('c:\\Users\\john.kelly\\Documents\\GitHub\\traffic-analyzer-for-infra\\cwv-jk-workflow.json', JSON.stringify(workflow, null, 2), 'utf8');
console.log('Workflow created with', Object.keys(workflow.tasks).length, 'total tasks');
console.log('DQL tasks:', dqlTiles.length);
console.log('Prompt tasks:', promptTaskNames.length);
console.log('Overall prompt: 1');
console.log('Email tasks: 2');

// List tasks
Object.entries(workflow.tasks).forEach(([k, v]) => {
  console.log(`  ${k} -> ${v.action}`);
});
