const fs = require('fs');

// Read the dashboard
const dashboard = JSON.parse(fs.readFileSync('C:\\Users\\john.kelly\\Downloads\\Services Overview.json', 'utf8'));

// ============================================================
// MANUAL CLEANED QUERIES for tiles with $ variable references
// ============================================================

// Tile 15: "Service Details" - removed $LogsAppUrl, $LogQueryTimeFrame, $DynatraceTenant, $dt_timeframe_from, $dt_timeframe_to
const TILE_15_CLEAN = `timeseries {latency_p50 = median(dt.service.request.response_time),
           latency_p90 = percentile(dt.service.request.response_time, 90),
           latency_p99 = percentile(dt.service.request.response_time, 99),
           requests = sum(dt.service.request.count), 
           errors = sum(dt.service.request.failure_count)},
           from: @d-1d, to: @d,
           by:{dt.entity.service}

| lookup [ timeseries latency_avg = avg(dt.service.request.response_time),
           by:{dt.entity.service}],
            sourceField:dt.entity.service, lookupField:dt.entity.service,
            prefix: "latencyAvg."



| lookup [ timeseries http_5xx = sum(dt.service.request.count,default: 0.0),
           by:{dt.entity.service},
           filter: (http.response.status_code >= 500 and http.response.status_code <= 599)],
            sourceField:dt.entity.service, lookupField:dt.entity.service,
            prefix: "http5xx."

| lookup [ timeseries http_4xx = sum(dt.service.request.count,default: 0.0),
           by:{dt.entity.service},
           filter: (http.response.status_code >= 400 and http.response.status_code <= 499)],
            sourceField:dt.entity.service, lookupField:dt.entity.service,
            prefix: "http4xx."

| lookup [fetch dt.davis.problems, from:now()-7h, to:now()
         | filter event.status=="ACTIVE" and dt.davis.is_duplicate==false
         | expand affected_entity_ids
         | summarize {Problems = countDistinct(display_id),
               event.id = takeFirst(event.id),
               event.kind = takeFirst(event.kind)}, 
               by:{affected_entity_ids}],
  sourceField:dt.entity.service, lookupField:affected_entity_ids, 
  fields:{Problems, affected_entity_ids,event.id,event.kind}    

| fieldsAdd Latency_Avg = arrayAvg(latencyAvg.latency_avg),
            Latency_p50 = arrayAvg(latency_p50),
            Latency_p90 = arrayAvg(latency_p90),
            Latency_p99 = arrayAvg(latency_p99),
            Requests = arraySum(requests), 
            Failures = arraySum(errors),
           \`5xx\` = arraySum(http5xx.http_5xx),
           \`4xx\` = arraySum(http4xx.http_4xx) 
| fieldsAdd FailureRate = (Failures/Requests) *100
| fieldsAdd Service = entityName(dt.entity.service)
| fieldsAdd dt.entity.process_group = entityAttr(dt.entity.service, "runs_on")
| fieldsAdd dt.entity.process_group = dt.entity.process_group[dt.entity.process_group]
| fields Status = if(Problems >= 0 , "PROBLEM",  else: "HEALTHY"),
         Service,
         dt.entity.service,
         StatusSort = if(Problems > 0, 0, else: 1),
         Requests,
         Latency_Avg,
         Latency_p50,
         Latency_p90,
         Latency_p99,
         FailureRate,
         Failures,
        \`5xx\` = if(isNull(\`5xx\`), 0, else:\`5xx\`),
        \`4xx\` = if(isNull(\`4xx\`), 0, else:\`4xx\`),
         event.id,
         event.kind
| sort StatusSort asc
| fieldsRemove StatusSort
| limit 100`;

// Tile 22: "Problems List" - removed $DynatraceTenant from Description concat
const TILE_22_CLEAN = `fetch dt.davis.problems, from: @d-1d, to: @d
| filter \`dt.davis.is_duplicate\` == false
| sort timestamp desc
| expand affected_entity_ids
| lookup [fetch dt.entity.service], sourceField:affected_entity_ids, lookupField: id, prefix:"lookup.affected.entity.services"
| lookup [fetch dt.entity.process_group_instance], sourceField:affected_entity_ids, lookupField: id, prefix:"lookup.affected.entity.pgi"
| lookup [fetch dt.entity.application], sourceField:affected_entity_ids, lookupField: id, prefix:"lookup.affected.entity.applications"
| lookup [fetch dt.entity.mobile_application], sourceField:affected_entity_ids, lookupField: id, prefix:"lookup.affected.entity.mobile"
| lookup [fetch dt.entity.custom_application], sourceField:affected_entity_ids, lookupField: id, prefix:"lookup.affected.entity.customapplication"
| lookup [fetch dt.entity.cloud_application], sourceField:affected_entity_ids, lookupField: id, prefix:"lookup.affected.entity.cloudapplication"
| lookup [fetch dt.entity.synthetic_test], sourceField:affected_entity_ids, lookupField: id, prefix:"lookup.affected.entity.synthetictest"
| lookup [fetch dt.entity.http_check], sourceField:affected_entity_ids, lookupField: id, prefix:"lookup.affected.entity.httpcheck"
| lookup [fetch dt.entity.multiprotocol_monitor], sourceField:affected_entity_ids, lookupField: id, prefix:"lookup.affected.entity.multiprotocolmonitor"
| lookup [fetch dt.entity.kubernetes_cluster], sourceField:affected_entity_ids, lookupField: id, prefix:"lookup.affected.entity.kubernetescluster"
| lookup [fetch dt.entity.host], sourceField:affected_entity_ids, lookupField: id, prefix:"lookup.affected.entity.hosts"
| lookup [fetch dt.entity.custom_device], sourceField:affected_entity_ids, lookupField: id, prefix:"lookup.affected.entity.customdevices"
| lookup [fetch dt.entity.hypervisor], sourceField:affected_entity_ids, lookupField: id, prefix:"lookup.affected.entity.hypervisor"
| lookup [fetch dt.entity.environment], sourceField:affected_entity_ids, lookupField: id, prefix:"lookup.affected.entity.environment"
| summarize {startTime = takeFirst(event.start),
            endTime = takeFirst(event.end),
            problemClosedDuration = takeFirst(resolved_problem_duration),
            status = takeFirst(event.status),
            event.name = takeFirst(event.name),
            severityLevel = takeFirst(event.category),
            affected = takeFirst(affected_entity_ids),
            rootCause = takeFirst(root_cause_entity_name),
            dt.davis.is_duplicate = takeFirst(dt.davis.is_duplicate),
            affectedServices = collectDistinct(lookup.affected.entity.servicesentity.name),
            affectedPGI = collectDistinct(lookup.affected.entity.pgientity.name),
            affectedApplications = collectDistinct(lookup.affected.entity.applicationsentity.name),
            affectedMobile = collectDistinct(lookup.affected.entity.mobileentity.name),
            affectedCustomApplication = collectDistinct(lookup.affected.entity.customapplicationentity.name),
            affectedCloudApplication = collectDistinct(lookup.affected.entity.cloudapplicationentity.name),
            affectedSyntheticTest = collectDistinct(lookup.affected.entity.synthetictestentity.name),
            affectedHttpCheck = collectDistinct(lookup.affected.entity.httpcheckentity.name),
            affectedMultiprotocolMonitor = collectDistinct(lookup.affected.entity.multiprotocolmonitorentity.name),
            affectedKubernetesCluster = collectDistinct(lookup.affected.entity.kubernetesclusterentity.name),
            affectedHosts = collectDistinct(lookup.affected.entity.hostsentity.name),
            affectedCustomDevices = collectDistinct(lookup.affected.entity.customdevicesentity.name),
            affectedHypervisor = collectDistinct(lookup.affected.entity.hypervisorentity.name),
            affectedEnvironment = collectDistinct(lookup.affected.entity.environmententity.name),
            event.id = takeFirst(event.id)}, 
            by:{display_id, event.kind}
| fieldsAdd currentTime = toTimestamp(now())
| fieldsAdd Description = concat(display_id," - ",event.name)
| fields Status = status,       
         Description,
         Affected = arrayRemoveNulls(arrayConcat(affectedApplications,affectedMobile,affectedCustomApplication,affectedCloudApplication,affectedSyntheticTest,affectedHttpCheck,affectedServices,affectedPGI,affectedKubernetesCluster,affectedHosts,affectedHypervisor,affectedCustomDevices,affectedEnvironment,affectedMultiprotocolMonitor)),
         RootCause = if(isNotNull(rootCause), rootCause, else:""),
         StartTime = startTime,
         EndTime =  if((status == "ACTIVE"),"In Progress", 
                    else:if((status == "CLOSED"),endTime)),   
         Duration = if((status == "CLOSED"),problemClosedDuration,
                    else:if((status == "ACTIVE"), currentTime-startTime)),
         event.id,
         event.kind
| sort StartTime, direction:"descending"
| sort Status, direction:"ascending"
| limit 25`;

// Tile 24: "Request Details" - removed $DynatraceTenant, $dt_timeframe_from, $dt_timeframe_to
const TILE_24_CLEAN = `fetch spans, from: @d-1d, to: @d, samplingRatio: 1, scanLimitGBytes: 50
\t
| filter request.is_root_span == true AND isNotNull(endpoint.name) 
\t
\t| fieldsAdd sampling.probability = (power(2, 56) - coalesce(sampling.threshold, 0)) * power(2, -56), 
            sampling.multiplicity = 1/sampling.probability, 
            multiplicity = coalesce(sampling.multiplicity, 1) * coalesce(aggregation.count, 1) * dt.system.sampling_ratio
\t
\t| fieldsAdd request.status_code = if(request.is_failed, "Failure", else: "Success")
\t
| fieldsAdd aggregation.duration_avg = coalesce(aggregation.duration_sum/aggregation.count, duration)
\t| fieldsAdd dt.entity.service.entity.name = entityAttr(dt.entity.service, "entity.name")
| summarize {
\t    dt.entity.service = takeFirst(dt.entity.service),
\t    Latency_Avg = sum(aggregation.duration_avg*multiplicity)/sum(multiplicity),
\t    Latency_p50 = percentile(duration, 50),
\t    Latency_p90 = percentile(duration, 90),
\t    Latency_p99 = percentile(duration, 99),
\t    Requests = sum(\`multiplicity\`),
\t    Failures = sum(if(request.status_code == "Failure", \`multiplicity\`, else: 0)),
\t    FailureRate = round(toDouble(sum(if(request.status_code == "Failure", \`multiplicity\`, else: 0)) / sum(\`multiplicity\`)), decimals: 3),
        \`5xx\` = sum(if(http.response.status_code >= 500 and http.response.status_code <= 599, \`multiplicity\`, else: 0)),
        \`4xx\` = sum(if(http.response.status_code >= 400 and http.response.status_code <= 499, \`multiplicity\`, else: 0))
        }, by: {
\t    dt.entity.service.entity.name,
\t    endpoint.name,
\t    dt.system.sampling_ratio
\t  }
| fieldsAdd Service = entityName(dt.entity.service)
| filter isNotNull(endpoint.name)
| fields Service,
         Request = endpoint.name,
         Requests,         
         Latency_Avg,
         Latency_p50,
         Latency_p90,
         Latency_p99,
         FailureRate = FailureRate * 100,
         Failures,
         \`5xx\`,
         \`4xx\`
| sort Requests desc  
| limit 100`;

// Override map for manually cleaned tiles
const MANUAL_OVERRIDES = {
  '15': TILE_15_CLEAN,
  '22': TILE_22_CLEAN,
  '24': TILE_24_CLEAN
};

// Define tile processing - we need to handle each tile
const tileConfigs = [];

for (const [tileId, tile] of Object.entries(dashboard.tiles)) {
  if (tile.type !== 'data' || !tile.query) continue;

  // Derive a task name from the title or tile ID
  let taskName;
  let reportTitle;
  const title = tile.title || '';

  if (title === '' && tile.query.includes('"METRICS"')) {
    taskName = 'metrics_label';
    reportTitle = 'Metrics Label';
  } else if (title === '' && tile.query.includes('"SERVICE SUMMARY"')) {
    taskName = 'service_summary_label';
    reportTitle = 'Service Summary Label';
  } else if (title === '' && tile.query.includes('"REQUESTS SUMMARY"')) {
    taskName = 'requests_summary_label';
    reportTitle = 'Requests Summary Label';
  } else {
    taskName = title
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .toLowerCase();
    reportTitle = title;
  }

  // Avoid duplicates
  let uniqueName = taskName;
  let counter = 2;
  while (tileConfigs.some(t => t.taskName === uniqueName)) {
    uniqueName = `${taskName}_${counter}`;
    counter++;
  }
  taskName = uniqueName;

  tileConfigs.push({
    tileId,
    taskName,
    reportTitle,
    query: tile.query,
    title: tile.title || '',
    description: tile.description || ''
  });
}

// Process queries according to rules
function processQuery(tileId, query) {
  // Use manual override for tiles with $ variables
  if (MANUAL_OVERRIDES[tileId]) {
    return MANUAL_OVERRIDES[tileId];
  }

  let q = query;

  // Rule: If fetching from user events, use user.events not user_events
  q = q.replace(/\bfetch\s+user_events\b/g, 'fetch user.events');

  // Rule: Add timeframe for yesterday (if query doesn't start with 'data')
  if (!q.trimStart().startsWith('data ')) {
    q = addTimeframe(q);
  }

  // Rule: Add limit 25 if no limit exists
  if (!/\|\s*limit\s+\d+/i.test(q)) {
    q = q.trimEnd() + '\n| limit 25';
  }

  return q;
}

function addTimeframe(query) {
  const trimmed = query.trimStart();
  
  if (trimmed.startsWith('timeseries ')) {
    // For timeseries: find the last non-empty line before the first | pipe command
    // and insert from/to params there
    const lines = query.split('\n');
    let firstPipeIdx = -1;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trimStart().startsWith('|')) {
        firstPipeIdx = i;
        break;
      }
    }
    
    if (firstPipeIdx === -1) {
      // No pipe commands, just append
      return query.trimEnd() + ',\n           from: @d-1d, to: @d';
    }
    
    // Find the last non-empty timeseries param line before the first pipe
    let lastNonEmptyIdx = firstPipeIdx - 1;
    while (lastNonEmptyIdx > 0 && lines[lastNonEmptyIdx].trim() === '') {
      lastNonEmptyIdx--;
    }
    
    // Add comma if needed and insert timeframe
    let lastLine = lines[lastNonEmptyIdx].trimEnd();
    if (!lastLine.endsWith(',')) {
      lastLine += ',';
    }
    lines[lastNonEmptyIdx] = lastLine;
    
    // Insert the timeframe line right after the last non-empty timeseries line
    lines.splice(lastNonEmptyIdx + 1, 0, '           from: @d-1d, to: @d');
    
    return lines.join('\n');
    
  } else if (trimmed.startsWith('fetch ')) {
    // For fetch: add ", from: @d-1d, to: @d" after the source on the first line
    const lines = query.split('\n');
    const firstLine = lines[0];
    
    // Match "fetch <source>" possibly with params after
    const fetchMatch = firstLine.match(/^(\s*fetch\s+\S+)/);
    if (fetchMatch) {
      const afterSource = firstLine.substring(fetchMatch[0].length);
      if (afterSource.startsWith(',')) {
        // Already has params, insert after source before existing params
        lines[0] = fetchMatch[0] + ', from: @d-1d, to: @d' + afterSource;
      } else {
        lines[0] = fetchMatch[0] + ', from: @d-1d, to: @d' + afterSource;
      }
    }
    
    return lines.join('\n');
  }
  
  return query;
}

// Build the workflow
const tasks = {};
const dqlTaskNames = [];
const promptTaskNames = [];

// Position tracking
let xPos = -Math.floor(tileConfigs.length / 2);

for (const config of tileConfigs) {
  const processedQuery = processQuery(config.tileId, config.query);
  const promptName = config.taskName + '_prompt';
  
  // DQL task
  tasks[config.taskName] = {
    name: config.taskName,
    input: {
      query: processedQuery
    },
    action: "dynatrace.automations:execute-dql-query",
    position: { x: xPos, y: 1 },
    description: "Make use of Dynatrace Grail data in your workflow.",
    predecessors: []
  };
  
  // Prompt task
  const reportName = config.reportTitle || config.taskName.replace(/_/g, ' ');
  tasks[promptName] = {
    name: promptName,
    input: {
      config: "disabled",
      prompt: `Provide a report for the following use case:\n## ${reportName} Analysis Report\n`,
      autoTrim: true,
      instruction: "Provide a Summary, Insights, Observations and Recommendations.",
      supplementary: `Format examples in tables instead of bulleted lists.\nWhere applicable convert units for readability, e.g. 1000000000 bytes is 1 TiB.\nWhere applicable show relative percentages, e.g. 100 used and 1000 allocatable is 10% utilized.\nUse this analysis:\n{{result("${config.taskName}")["records"]}}\n`
    },
    action: "dynatrace.davis.copilot.workflow.actions:davis-copilot",
    position: { x: xPos, y: 2 },
    conditions: {
      states: {
        [config.taskName]: "OK"
      }
    },
    description: "Prompt the Dynatrace Intelligence generative AI",
    predecessors: [config.taskName]
  };
  
  dqlTaskNames.push(config.taskName);
  promptTaskNames.push(promptName);
  xPos++;
}

// Overall prompt task
const overallStates = {};
for (const pn of promptTaskNames) {
  overallStates[pn] = "OK";
}

const supplementaryParts = promptTaskNames.map(pn => `{{result("${pn}").text}}`).join('\n');

tasks['overall_prompt'] = {
  name: 'overall_prompt',
  input: {
    config: "disabled",
    prompt: "Provide a report for the following use case:\n## Services Overview Dashboard Executive Report",
    autoTrim: true,
    instruction: "Provide a Summary, Insights, Observations and Recommendations.",
    supplementary: `Format examples in tables instead of bulleted lists.\nUse this analysis:\n${supplementaryParts}\n\n`
  },
  action: "dynatrace.davis.copilot.workflow.actions:davis-copilot",
  position: { x: 0, y: 3 },
  conditions: {
    states: overallStates
  },
  description: "Prompt the Dynatrace Intelligence generative AI",
  predecessors: [...promptTaskNames]
};

// Email - Executive Summary Report
tasks['email_exec_report'] = {
  name: 'email_exec_report',
  input: {
    cc: [],
    to: ["john.kelly@dynatrace.com"],
    bcc: [],
    content: '#\n# Dashboard Overall Summary \n#\n{{result("overall_prompt").text}}\n',
    subject: "Dynatrace Services Overview Dashboard Executive Summary Report"
  },
  action: "dynatrace.email:send-email",
  position: { x: 1, y: 4 },
  conditions: {
    states: {
      overall_prompt: "OK"
    }
  },
  description: "Send email",
  predecessors: ["overall_prompt"]
};

// Email - Dashboard Tile Report (overall + individual prompts)
const detailParts = promptTaskNames.map(pn => `{{result("${pn}").text}}`).join('\n');
tasks['email_dashboard_report'] = {
  name: 'email_dashboard_report',
  input: {
    cc: [],
    to: ["john.kelly@dynatrace.com"],
    bcc: [],
    content: `#\n# Dashboard Overall Summary\n#\n{{result("overall_prompt").text}}\n#\n# Dashboard Tile Summary\n#\n${detailParts}\n`,
    subject: "Dynatrace Services Overview Dashboard Tile Report"
  },
  action: "dynatrace.email:send-email",
  position: { x: -1, y: 4 },
  conditions: {
    states: {
      overall_prompt: "OK"
    }
  },
  description: "Send email",
  predecessors: ["overall_prompt"]
};

const workflow = {
  title: "Services Overview",
  description: "This Workflow generates Services Overview reports and emails to the specified addresses.",
  ownerType: "USER",
  isPrivate: true,
  schemaVersion: 4,
  trigger: {},
  result: null,
  type: "STANDARD",
  input: {},
  hourlyExecutionLimit: 10,
  guide: "# Services Overview Report\nGet a comprehensive overview of your Services. This Workflow queries Grail and provides data to Dynatrace Intelligence to get recommendations. These recommendations are then sent to email(s) of your choice.\n\n# Setup\n1. Change emails (`to`, `cc`, `bcc`) to be an array of strings.\n2. Test with a manual Run, by clicking the `Run` button.\n3. If everything works as expected, change the [Trigger](?trigger=) to a schedule, e.g. Weekly, Daily, etc.",
  tasks
};

const outputPath = 'C:\\Users\\john.kelly\\Documents\\GitHub\\traffic-analyzer-for-infra\\services-overview-workflow.json';
fs.writeFileSync(outputPath, JSON.stringify(workflow, null, 2), 'utf8');

console.log(`Workflow generated with ${Object.keys(tasks).length} tasks:`);
console.log(`  - ${dqlTaskNames.length} DQL tasks`);
console.log(`  - ${promptTaskNames.length} prompt tasks`);
console.log(`  - 1 overall prompt`);
console.log(`  - 2 email tasks`);
console.log(`\nDQL tasks: ${dqlTaskNames.join(', ')}`);
console.log(`\nWritten to: ${outputPath}`);
