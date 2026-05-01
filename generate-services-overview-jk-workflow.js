const fs = require('fs');

const dashboard = JSON.parse(fs.readFileSync('c:\\Users\\john.kelly\\Documents\\GitHub\\traffic-analyzer-for-infra\\services-overview-jk-clean.json', 'utf8'));
const tiles = dashboard.tiles;

const dqlTiles = [];
Object.entries(tiles).forEach(([id, t]) => {
  if (!t.query) return;
  const trimmed = t.query.trim();
  if (trimmed.startsWith('data record')) return;
  if (trimmed.startsWith('data json:"[]"')) return;
  dqlTiles.push({ id, title: t.title || `tile_${id}`, query: t.query });
});

console.log(`Found ${dqlTiles.length} DQL tiles to include in workflow:\n`);
dqlTiles.forEach((t, i) => console.log(`${i+1}. Tile ${t.id}: ${t.title}`));

function makeTaskName(title, id) {
  let name = title.replace(/[^a-zA-Z0-9\s]/g, '').trim().replace(/\s+/g, '_').toLowerCase();
  if (!name) name = `tile_${id}`;
  if (name.length > 50) name = name.substring(0, 50);
  return name;
}

function cleanQuery(query) {
  const lines = query.split('\n');
  const result = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Skip entirely comment lines with $
    if (trimmed.startsWith('//') && trimmed.includes('$')) continue;
    
    if (!trimmed.includes('$')) {
      result.push(line);
      continue;
    }
    
    // Line has $ reference(s). Try to salvage non-$ parts.
    
    // Case 1: "filter:in(dt.entity.service, array($ServiceID))],"
    // -> keep just "],"  
    // Case 2: "in(dt.entity.service, array($ServiceID))"
    // -> skip entirely but preserve trailing ] or ], if present
    // Case 3: "| filter in(id, array($ServiceID))" or "| filter matchesValue(...$...)"
    // -> skip
    // Case 4: Lines in concat() referencing $DynatraceTenant etc.
    // -> skip
    
    // Extract trailing brackets/punctuation that need preserving
    const trailingMatch = trimmed.match(/(\][\s,]*)+$/);
    const trailing = trailingMatch ? trailingMatch[0] : '';
    
    // If the line is a pipe filter with $, skip it (keeping trailing brackets)
    if (trimmed.startsWith('| filter') && trimmed.includes('$')) {
      if (trailing) {
        // Preserve trailing brackets on their own line at same indentation
        const indent = line.match(/^(\s*)/)[1];
        result.push(indent + trailing);
      }
      // Skip continuation lines of this filter
      while (i + 1 < lines.length) {
        const next = lines[i + 1].trim();
        if (next.includes('$') && (next.startsWith('in(') || next.startsWith('or') || next.startsWith('and'))) {
          i++;
          continue;
        }
        break;
      }
      continue;
    }
    
    // If it's a timeseries filter line: "filter:in(xxx, array($xxx))]," 
    if (/^\s*filter\s*:\s*in\(/.test(trimmed) && trimmed.includes('$')) {
      // Get previous line and remove trailing comma if it ended with one expecting this filter
      if (result.length > 0 && result[result.length - 1].trim().endsWith('and')) {
        result[result.length - 1] = result[result.length - 1].replace(/\s+and\s*$/, '');
      }
      if (trailing) {
        const indent = line.match(/^(\s*)/)[1];
        result.push(indent + trailing);
      }
      continue;
    }
    
    // If it's just "in(xxx, array($xxx))" - maybe continuation of a filter
    if (/^\s*in\(/.test(trimmed) && trimmed.includes('$')) {
      if (result.length > 0 && result[result.length - 1].trim().endsWith('and')) {
        result[result.length - 1] = result[result.length - 1].replace(/\s+and\s*$/, '');
      }
      if (trailing) {
        const indent = line.match(/^(\s*)/)[1];
        result.push(indent + trailing);
      }
      continue;
    }
    
    // If it's a "filter:" keyword line without condition (just "filter:" or "filter: \n...")
    if (/^\s*filter\s*:\s*$/.test(trimmed)) {
      continue;
    }
    
    // For multi-line filter where condition is on same line but has "and\n$continued"
    if (/^\s*filter\s*:/.test(trimmed) && trimmed.includes('$')) {
      // Try to keep the non-$ part
      // e.g. "filter:\n           http.response.status_code >= 500 and http.response.status_code <= 599 and\n           in(dt.entity.service, array($ServiceID))"
      // The $ part might be on the next line
      if (result.length > 0 && result[result.length - 1].trim().endsWith('and')) {
        result[result.length - 1] = result[result.length - 1].replace(/\s+and\s*$/, '');
      }
      if (trailing) {
        const indent = line.match(/^(\s*)/)[1];
        result.push(indent + trailing);
      }
      continue;
    }
    
    // General: any other line with $ - skip but preserve trailing ] brackets
    if (trailing && !trimmed.startsWith('//')) {
      const indent = line.match(/^(\s*)/)[1];
      result.push(indent + trailing);
    }
    // else: fully skip the line
  }
  
  let q = result.join('\n');
  
  // Fix empty filter: params in timeseries (only remove filter: when the next non-blank line starts with | or is end of query)
  const lines2 = q.split('\n');
  const fixedLines = [];
  for (let i = 0; i < lines2.length; i++) {
    const trimmed = lines2[i].trim();
    // Check if this is a standalone "filter:" line
    if (/^\s*filter:\s*$/.test(lines2[i])) {
      // Look ahead to see if the next non-blank line is a filter condition or something else
      let j = i + 1;
      while (j < lines2.length && lines2[j].trim() === '') j++;
      if (j < lines2.length) {
        const nextTrimmed = lines2[j].trim();
        // If next non-blank line starts with | or is a new command, the filter is empty - remove it
        // Also remove trailing comma on previous line
        if (nextTrimmed.startsWith('|') || nextTrimmed.startsWith('//') || j >= lines2.length) {
          if (fixedLines.length > 0 && fixedLines[fixedLines.length - 1].trimEnd().endsWith(',')) {
            fixedLines[fixedLines.length - 1] = fixedLines[fixedLines.length - 1].replace(/,\s*$/, '');
          }
          continue; // skip empty filter
        }
      }
    }
    fixedLines.push(lines2[i]);
  }
  q = fixedLines.join('\n');
  
  // Fix "Service = concat(Service,\n" -> Just "Service,"  
  // Pattern: "field = concat(field,\n         field2" where field2 is on next line as a regular field (no concat continuation)
  q = q.replace(/(\w+)\s*=\s*concat\(\1,\s*\n/g, '$1,\n');
  
  // Fix "Request = concat(endpoint.name,\n" -> "Request = endpoint.name,"
  q = q.replace(/(\w+)\s*=\s*concat\(([^,\n]+),\s*\n/g, '$1 = $2,\n');
  
  // Fix dangling "fieldsAdd LogErrorsLink = replaceString(LogErrorsLink, ...)" - LogErrorsLink was built from $ vars
  // Actually LogErrorsLink = concat(...$...) was removed, so references to LogErrorsLink are now broken
  // Remove lines that reference LogErrorsLink
  q = q.split('\n').filter(l => !l.includes('LogErrorsLink')).join('\n');
  
  // Fix dangling LogQueryPart2 lines (built for LogErrorsLink which is removed)
  q = q.split('\n').filter(l => !l.includes('LogQueryPart2')).join('\n');
  
  // Fix "`Analyze Errors` = concat(\n          LogErrorsLink)" -> remove this field
  // More generally, remove `Analyze Errors` field references since they built links with $ vars
  q = q.split('\n').filter(l => !l.trim().startsWith('`Analyze Errors`')).join('\n');
  
  // Remove empty comment blocks
  q = q.replace(/\/\/\s*\n\s*\/\/\s*\)/g, '');
  
  // Fix trailing commas before | or closing  
  q = q.split('\n').map((line, idx, arr) => {
    const trimmed = line.trim();
    const nextTrimmed = (idx + 1 < arr.length) ? arr[idx + 1].trim() : '';
    // Remove trailing comma if next line starts with | or is empty followed by |
    if (trimmed.endsWith(',') && (nextTrimmed.startsWith('|') || nextTrimmed === '')) {
      return line.replace(/,\s*$/, '');
    }
    return line;
  }).join('\n');
  
  // Remove orphaned comment-only blocks (consecutive comment lines that are remnants)
  q = q.split('\n').filter(l => {
    const t = l.trim();
    // Remove empty comment lines or comment lines about Analyze Errors 
    if (t === '//' || t === '//  )' || t.match(/^\/\/\s*`Analyze Errors`/)) return false;
    return true;
  }).join('\n');
  
  // Check for limit
  const hasLimit = /\|\s*limit\s+\d+/i.test(q);
  if (!hasLimit) {
    q = q.trimEnd() + '\n| limit 25';
  }
  
  // Clean multiple blank lines
  q = q.replace(/\n{3,}/g, '\n\n');
  
  // user_events -> user.events
  q = q.replace(/fetch\s+user_events/g, 'fetch user.events');
  
  return q.trim();
}

function isBalanced(str) {
  let depth = 0;
  let bdepth = 0;
  // Only count parens/brackets in non-comment lines
  const lines = str.split('\n');
  for (const line of lines) {
    if (line.trim().startsWith('//')) continue;
    for (const ch of line) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === '[') bdepth++;
      if (ch === ']') bdepth--;
    }
  }
  return depth === 0 && bdepth === 0;
}

// Build workflow
const tasks = {};
const dqlTaskNames = [];
const promptTaskNames = [];
let xPos = -Math.floor(dqlTiles.length / 2);

dqlTiles.forEach((tile, idx) => {
  const taskName = makeTaskName(tile.title, tile.id);
  const promptName = taskName + '_prompt';
  dqlTaskNames.push(taskName);
  promptTaskNames.push(promptName);

  let cleanedQuery = cleanQuery(tile.query);
  
  tasks[taskName] = {
    name: taskName,
    input: { query: cleanedQuery, timeframe: "from: @d-1d, to: @d" },
    action: "dynatrace.automations:execute-dql-query",
    position: { x: xPos + idx, y: 1 },
    description: "Make use of Dynatrace Grail data in your workflow.",
    predecessors: []
  };

  const reportTitle = tile.title || `Tile ${tile.id}`;
  tasks[promptName] = {
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
    conditions: { states: { [taskName]: "OK" } },
    description: "Prompt the Dynatrace Intelligence generative AI",
    predecessors: [taskName]
  };
});

const overallCond = {};
promptTaskNames.forEach(n => overallCond[n] = "OK");
tasks["overall_prompt"] = {
  name: "overall_prompt",
  input: {
    config: "disabled",
    prompt: "Provide a report for the following use case:\n## Services Overview Dashboard Executive Report",
    autoTrim: true,
    instruction: "Provide a Summary, Insights, Observations and Recommendations.",
    supplementary: "Format examples in tables instead of bulleted lists.\nUse this analysis:\n" + 
      promptTaskNames.map(n => `{{result("${n}").text}}`).join('\n') + '\n\n'
  },
  action: "dynatrace.davis.copilot.workflow.actions:davis-copilot",
  position: { x: 0, y: 3 },
  conditions: { states: overallCond },
  description: "Prompt the Dynatrace Intelligence generative AI",
  predecessors: promptTaskNames
};

tasks["email_exec_report"] = {
  name: "email_exec_report",
  input: { cc: [], to: ["john.kelly@dynatrace.com"], bcc: [],
    content: "#\n# Dashboard Overall Summary \n#\n{{result(\"overall_prompt\").text}}\n",
    subject: "Dynatrace Services Overview Dashboard Executive Summary Report"
  },
  action: "dynatrace.email:send-email",
  position: { x: 1, y: 4 },
  conditions: { states: { "overall_prompt": "OK" } },
  description: "Send email",
  predecessors: ["overall_prompt"]
};

tasks["email_dashboard_report"] = {
  name: "email_dashboard_report",
  input: { cc: [], to: ["john.kelly@dynatrace.com"], bcc: [],
    content: "#\n# Dashboard Overall Summary\n#\n{{result(\"overall_prompt\").text}}\n#\n# Dashboard Tile Summary\n#\n" +
      promptTaskNames.map(n => `{{result("${n}").text}}`).join('\n') + '\n',
    subject: "Dynatrace Services Overview Dashboard Tile Report"
  },
  action: "dynatrace.email:send-email",
  position: { x: -1, y: 4 },
  conditions: { states: { "overall_prompt": "OK" } },
  description: "Send email",
  predecessors: ["overall_prompt"]
};

const workflow = {
  title: "Services Overview - jk",
  description: "This Workflow generates Services Overview reports and emails to the specified addresses.",
  ownerType: "USER", isPrivate: true, schemaVersion: 4,
  trigger: {}, result: null, type: "STANDARD", input: {},
  hourlyExecutionLimit: 10,
  guide: "# Services Overview Report\nGet a list of your top Services. This Workflow queries Grail and provides data to Dynatrace Assist to get recommendations. These recommendations are then sent to email(s) of your choice.\n\n# Setup\n1. Change emails (`to`, `cc`, `bcc`) to be an array of strings.\n2. Test with a manual Run, by click the `Run` button.\n3. If everything works as expected, change the [Trigger](?trigger=) to a schedule, e.g. Weekly, Daily, etc.",
  tasks
};

const outPath = 'c:\\Users\\john.kelly\\Documents\\GitHub\\traffic-analyzer-for-infra\\services-overview-jk-workflow.json';
fs.writeFileSync(outPath, JSON.stringify(workflow, null, 2), 'utf8');
console.log(`\nWorkflow: ${outPath}`);
console.log(`DQL: ${dqlTaskNames.length}, Prompts: ${promptTaskNames.length}, Total: ${Object.keys(tasks).length}`);

let issues = 0;
Object.entries(tasks).forEach(([name, t]) => {
  if (t.input && t.input.query) {
    if (t.input.query.includes('$')) {
      console.log(`WARNING: ${name} has $ refs`);
      t.input.query.split('\n').filter(l => l.includes('$') && !l.trim().startsWith('//')).forEach(l => console.log(`  >>> ${l.trim()}`));
      issues++;
    }
    if (!isBalanced(t.input.query)) {
      const opens = (t.input.query.match(/\(/g) || []).length;
      const closes = (t.input.query.match(/\)/g) || []).length;
      const bopens = (t.input.query.match(/\[/g) || []).length;
      const bcloses = (t.input.query.match(/\]/g) || []).length;
      console.log(`WARNING: ${name} unbalanced: ( ${opens} vs ) ${closes}, [ ${bopens} vs ] ${bcloses}`);
      issues++;
    }
  }
});
if (issues === 0) console.log('\nAll queries clean and balanced!');
