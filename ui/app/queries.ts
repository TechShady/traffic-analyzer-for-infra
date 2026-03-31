/**
 * DQL query builders for the Traffic Analyzer dashboard.
 * All queries accept host filter and traffic change parameters.
 */

function hostFilter(hosts: string[]): string {
  if (hosts.length === 0) return "";
  const patterns = hosts.map((h) => `"${h}"`).join(", ");
  return `
    filter:{
      dt.entity.host in [
        fetch dt.entity.host
        | filter matchesValue(entity.name, ${patterns})
        | fields id
      ]
    }`;
}

export function hostListQuery(): string {
  return `fetch dt.entity.host
| fields entity.name
| filterOut isNull(entity.name)
| sort entity.name asc
| summarize distinctHostNames = collectDistinct(entity.name)`;
}

export function trafficLoadQuery(hosts: string[]): string {
  return `timeseries {
Traffic = avg(dt.host.cpu.system),${hostFilter(hosts)}
},
interval: 5m
| fieldsAdd Traffic.Median = arrayAvg(Traffic)
| fieldsAdd Traffic.AvgLowerThanMedian = arrayAvg(iCollectArray(if(Traffic[] < Traffic.Median, Traffic[], else:null)))
| fieldsAdd Traffic.AvgHigherThanMedian = arrayAvg(iCollectArray(if(Traffic[] > Traffic.Median, Traffic[], else:null)))
| fieldsAdd Traffic.PercentChange = 100 * (Traffic.AvgHigherThanMedian - Traffic.AvgLowerThanMedian) / (Traffic.AvgLowerThanMedian)
| fields Traffic.Median, Traffic.AvgLowerThanMedian, Traffic.AvgHigherThanMedian, Traffic.PercentChange`;
}

export function cpuStatsQuery(hosts: string[]): string {
  return `timeseries {
  cpuUsage = avg(dt.host.cpu.usage),${hostFilter(hosts)}
},
union: TRUE,
interval: 5m
| fieldsAdd cpuUsage.Median = arrayAvg(cpuUsage)
| fieldsAdd cpuUsage.AvgLowerThanMedian = arrayAvg(iCollectArray(if(cpuUsage[] < cpuUsage.Median, cpuUsage[], else: null)))
| fieldsAdd cpuUsage.AvgHigherThanMedian = arrayAvg(iCollectArray(if(cpuUsage[] > cpuUsage.Median, cpuUsage[], else: null)))
| fieldsAdd cpuUsage.PercentChange = 100 * (cpuUsage.AvgHigherThanMedian - cpuUsage.AvgLowerThanMedian) / (cpuUsage.AvgLowerThanMedian)
| fields cpuUsage.Median, cpuUsage.AvgLowerThanMedian, cpuUsage.AvgHigherThanMedian, cpuUsage.PercentChange`;
}

export function memoryStatsQuery(hosts: string[]): string {
  return `timeseries {
  memoryUsage = avg(dt.host.memory.usage),${hostFilter(hosts)}
},
union: TRUE,
interval: 5m
| fieldsAdd memoryUsage.Median = arrayAvg(memoryUsage)
| fieldsAdd memoryUsage.AvgLowerThanMedian = arrayAvg(iCollectArray(if(memoryUsage[] < memoryUsage.Median, memoryUsage[], else: null)))
| fieldsAdd memoryUsage.AvgHigherThanMedian = arrayAvg(iCollectArray(if(memoryUsage[] > memoryUsage.Median, memoryUsage[], else: null)))
| fieldsAdd memoryUsage.PercentChange = 100 * (memoryUsage.AvgHigherThanMedian - memoryUsage.AvgLowerThanMedian) / (memoryUsage.AvgLowerThanMedian)
| fields memoryUsage.Median, memoryUsage.AvgLowerThanMedian, memoryUsage.AvgHigherThanMedian, memoryUsage.PercentChange`;
}

export function diskStatsQuery(hosts: string[]): string {
  return `timeseries {
  diskUsage = avg(dt.host.disk.free),${hostFilter(hosts)}
},
union: TRUE,
interval: 5m
| fieldsAdd diskUsage.Median = arrayAvg(diskUsage)
| fieldsAdd diskUsage.AvgLowerThanMedian = arrayAvg(iCollectArray(if(diskUsage[] < diskUsage.Median, diskUsage[], else: null)))
| fieldsAdd diskUsage.AvgHigherThanMedian = arrayAvg(iCollectArray(if(diskUsage[] > diskUsage.Median, diskUsage[], else: null)))
| fieldsAdd diskUsage.PercentChange = 100 * (diskUsage.AvgHigherThanMedian - diskUsage.AvgLowerThanMedian) / (diskUsage.AvgLowerThanMedian)
| fields diskUsage.Median, diskUsage.AvgLowerThanMedian, diskUsage.AvgHigherThanMedian, diskUsage.PercentChange`;
}

export function cpuByHostQuery(hosts: string[], topN: number): string {
  return `timeseries {
  cpuUsage = avg(dt.host.cpu.usage),${hostFilter(hosts)}, by:{dt.entity.host}
},
union: TRUE,
interval: 5m
| fieldsAdd cpuUsage.Median = arrayAvg(cpuUsage)
| fieldsAdd cpuUsage.AvgLowerThanMedian = arrayAvg(iCollectArray(if(cpuUsage[] < cpuUsage.Median, cpuUsage[], else: null)))
| fieldsAdd cpuUsage.AvgHigherThanMedian = arrayAvg(iCollectArray(if(cpuUsage[] > cpuUsage.Median, cpuUsage[], else: null)))
| fieldsAdd cpuUsage.PercentChange = 100 * (cpuUsage.AvgHigherThanMedian - cpuUsage.AvgLowerThanMedian) / (cpuUsage.AvgLowerThanMedian)
| fields dt.entity.host, \`Host Name\` = entityName(dt.entity.host), \`Observed CPU Low\` = cpuUsage.AvgLowerThanMedian, \`Observed CPU Avg\` = cpuUsage.Median, \`Observed CPU High\` = cpuUsage.AvgHigherThanMedian, cpuUsage.PercentChange
| sort \`Observed CPU High\` desc
| limit ${topN}`;
}

export function memoryByHostQuery(hosts: string[], topN: number): string {
  return `timeseries {
  memUsage = avg(dt.host.memory.usage),${hostFilter(hosts)}, by:{dt.entity.host}
},
union: TRUE,
interval: 5m
| fieldsAdd memUsage.Median = arrayAvg(memUsage)
| fieldsAdd memUsage.AvgLowerThanMedian = arrayAvg(iCollectArray(if(memUsage[] < memUsage.Median, memUsage[], else: null)))
| fieldsAdd memUsage.AvgHigherThanMedian = arrayAvg(iCollectArray(if(memUsage[] > memUsage.Median, memUsage[], else: null)))
| fieldsAdd memUsage.PercentChange = 100 * (memUsage.AvgHigherThanMedian - memUsage.AvgLowerThanMedian) / (memUsage.AvgLowerThanMedian)
| fields dt.entity.host, \`Host Name\` = entityName(dt.entity.host), \`Observed MEM Low\` = memUsage.AvgLowerThanMedian, \`Observed MEM Avg\` = memUsage.Median, \`Observed MEM High\` = memUsage.AvgHigherThanMedian, memUsage.PercentChange
| sort \`Observed MEM High\` desc
| limit ${topN}`;
}

export function diskByHostQuery(hosts: string[], topN: number): string {
  return `timeseries {
  diskFree = avg(dt.host.disk.used.percent),${hostFilter(hosts)}, by:{dt.entity.host}
},
union: TRUE,
interval: 5m
| fieldsAdd diskFree.Median = arrayAvg(diskFree)
| fieldsAdd diskFree.AvgLowerThanMedian = arrayAvg(iCollectArray(if(diskFree[] < diskFree.Median, diskFree[], else: null)))
| fieldsAdd diskFree.AvgHigherThanMedian = arrayAvg(iCollectArray(if(diskFree[] > diskFree.Median, diskFree[], else: null)))
| fieldsAdd diskFree.PercentChange = 100 * (diskFree.AvgHigherThanMedian - diskFree.AvgLowerThanMedian) / (diskFree.AvgLowerThanMedian)
| fields dt.entity.host, \`Host Name\` = entityName(dt.entity.host), \`Observed Disk Free Low\` = diskFree.AvgLowerThanMedian, \`Observed Disk Free Avg\` = diskFree.Median, \`Observed Disk Free High\` = diskFree.AvgHigherThanMedian, diskFree.PercentChange
| sort \`Observed Disk Free High\` desc
| limit ${topN}`;
}

/** Calculate forecasted values from observed stats */
export function forecast(
  observed: { low: number; avg: number; high: number; change: number },
  trafficChangePercent: number,
  trafficPercentChange: number
): { low: number; avg: number; high: number; percentChange: number } {
  if (!trafficPercentChange || trafficPercentChange === 0) {
    return { low: observed.low, avg: observed.avg, high: observed.high, percentChange: 0 };
  }
  const factor = 1 + (trafficChangePercent * (observed.change / trafficPercentChange)) / 100;
  const low = observed.low * factor;
  const avg = observed.avg * factor;
  const high = observed.high * factor;
  const percentChange = observed.high !== 0 ? 100 * (high - observed.high) / observed.high : 0;
  return { low, avg, high, percentChange };
}
