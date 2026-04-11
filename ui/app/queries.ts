/**
 * DQL query builders for the Traffic Analyzer dashboard (latest version).
 *
 * The dashboard uses a single "Metrics" variable query that computes all
 * aggregate metrics in one shot, returning an array of 19 values:
 *
 *  [0]  Traffic.Median
 *  [1]  Traffic.AvgLowerThanMedian
 *  [2]  Traffic.AvgHigherThanMedian
 *  [3]  Traffic.PercentChange
 *  [4]  CPU.Median
 *  [5]  CPU.AvgLowerThanMedian
 *  [6]  CPU.AvgHigherThanMedian
 *  [7]  CPU.PercentChange
 *  [8]  Memory.Median
 *  [9]  Memory.AvgLowerThanMedian
 *  [10] Memory.AvgHigherThanMedian
 *  [11] Memory.PercentChange
 *  [12] Disk.Median
 *  [13] Disk.AvgLowerThanMedian
 *  [14] Disk.AvgHigherThanMedian
 *  [15] Disk.PercentChange
 *  [16] CPU.PCC   (Pearson Correlation Coefficient vs Traffic)
 *  [17] Memory.PCC
 *  [18] Disk.PCC
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

export function hostGroupListQuery(): string {
  return `fetch dt.entity.host_group
| fields entity.name
| filterOut isNull(entity.name)
| sort entity.name asc
| summarize distinctGroupNames = collectDistinct(entity.name)`;
}

export function hostsForGroupQuery(groupNames: string[]): string {
  const patterns = groupNames.map((g) => `"${g}"`).join(", ");
  return `fetch dt.entity.host
| fieldsAdd hostGroupName = entityAttr(id, "hostGroupName", type:"dt.entity.host")
| filter matchesValue(hostGroupName, ${patterns})
| fields entity.name
| filterOut isNull(entity.name)
| sort entity.name asc
| summarize distinctHostNames = collectDistinct(entity.name)`;
}

/**
 * Single metrics query that computes all observed stats + PCC for each resource.
 * This replaces the separate cpuStats/memoryStats/diskStats queries.
 */
export function metricsQuery(hosts: string[], timeframeDays: number = 7): string {
  return `timeseries {
Traffic = avg(dt.host.cpu.system),
Metric1 = avg(dt.host.cpu.usage),
Metric2 = avg(dt.host.memory.usage),
Metric3 = avg(dt.host.disk.free),${hostFilter(hosts)}
},
from: -${timeframeDays}d,
interval: 5m
// Traffic
| fieldsAdd Traffic.Median = arrayAvg(Traffic)
| fieldsAdd Traffic.AvgLowerThanMedian = arrayAvg(iCollectArray(if(Traffic[] < Traffic.Median, Traffic[], else:null)))
| fieldsAdd Traffic.AvgHigherThanMedian = arrayAvg(iCollectArray(if(Traffic[] > Traffic.Median, Traffic[], else:null)))
| fieldsAdd Traffic.PercentChange = 100 * (Traffic.AvgHigherThanMedian - Traffic.AvgLowerThanMedian) / (Traffic.AvgLowerThanMedian)
// Metric1 (CPU)
| fieldsAdd Metric1.Median = arrayAvg(Metric1)
| fieldsAdd Metric1.AvgLowerThanMedian = arrayAvg(iCollectArray(if(Metric1[] < Metric1.Median, Metric1[], else:null)))
| fieldsAdd Metric1.AvgHigherThanMedian = arrayAvg(iCollectArray(if(Metric1[] > Metric1.Median, Metric1[], else:null)))
| fieldsAdd Metric1.PercentChange = 100 * (Metric1.AvgHigherThanMedian - Metric1.AvgLowerThanMedian) / (Metric1.AvgLowerThanMedian)
// Metric2 (Memory)
| fieldsAdd Metric2.Median = arrayAvg(Metric2)
| fieldsAdd Metric2.AvgLowerThanMedian = arrayAvg(iCollectArray(if(Metric2[] < Metric2.Median, Metric2[], else:null)))
| fieldsAdd Metric2.AvgHigherThanMedian = arrayAvg(iCollectArray(if(Metric2[] > Metric2.Median, Metric2[], else:null)))
| fieldsAdd Metric2.PercentChange = 100 * (Metric2.AvgHigherThanMedian - Metric2.AvgLowerThanMedian) / (Metric2.AvgLowerThanMedian)
// Metric3 (Disk)
| fieldsAdd Metric3.Median = arrayAvg(Metric3)
| fieldsAdd Metric3.AvgLowerThanMedian = arrayAvg(iCollectArray(if(Metric3[] < Metric3.Median, Metric3[], else:null)))
| fieldsAdd Metric3.AvgHigherThanMedian = arrayAvg(iCollectArray(if(Metric3[] > Metric3.Median, Metric3[], else:null)))
| fieldsAdd Metric3.PercentChange = 100 * (Metric3.AvgHigherThanMedian - Metric3.AvgLowerThanMedian) / (Metric3.AvgLowerThanMedian)
// Pearson Correlation Coefficient - Metric1 vs Traffic
| fieldsAdd pcc.n = toDouble(arraySize(arrayRemoveNulls(iCollectArray(if(isNotNull(Metric1[]) AND isNotNull(Traffic[]), 1, else:null)))))
| fieldsAdd pcc.sumXY = arraySum(iCollectArray(Metric1[] * Traffic[]))
| fieldsAdd pcc.sumX = arraySum(Metric1), pcc.sumY = arraySum(Traffic)
| fieldsAdd pcc.sumX2 = arraySum(iCollectArray(Metric1[] * Metric1[])), pcc.sumY2 = arraySum(iCollectArray(Traffic[] * Traffic[]))
| fieldsAdd Metric1.PCC = (pcc.n * pcc.sumXY - pcc.sumX * pcc.sumY) / sqrt((pcc.n * pcc.sumX2 - pcc.sumX * pcc.sumX) * (pcc.n * pcc.sumY2 - pcc.sumY * pcc.sumY))
| fieldsRemove pcc.n, pcc.sumXY, pcc.sumX, pcc.sumY, pcc.sumX2, pcc.sumY2
// Pearson Correlation Coefficient - Metric2 vs Traffic
| fieldsAdd pcc.n = toDouble(arraySize(arrayRemoveNulls(iCollectArray(if(isNotNull(Metric2[]) AND isNotNull(Traffic[]), 1, else:null)))))
| fieldsAdd pcc.sumXY = arraySum(iCollectArray(Metric2[] * Traffic[]))
| fieldsAdd pcc.sumX = arraySum(Metric2), pcc.sumY = arraySum(Traffic)
| fieldsAdd pcc.sumX2 = arraySum(iCollectArray(Metric2[] * Metric2[])), pcc.sumY2 = arraySum(iCollectArray(Traffic[] * Traffic[]))
| fieldsAdd Metric2.PCC = (pcc.n * pcc.sumXY - pcc.sumX * pcc.sumY) / sqrt((pcc.n * pcc.sumX2 - pcc.sumX * pcc.sumX) * (pcc.n * pcc.sumY2 - pcc.sumY * pcc.sumY))
| fieldsRemove pcc.n, pcc.sumXY, pcc.sumX, pcc.sumY, pcc.sumX2, pcc.sumY2
// Pearson Correlation Coefficient - Metric3 vs Traffic
| fieldsAdd pcc.n = toDouble(arraySize(arrayRemoveNulls(iCollectArray(if(isNotNull(Metric3[]) AND isNotNull(Traffic[]), 1, else:null)))))
| fieldsAdd pcc.sumXY = arraySum(iCollectArray(Metric3[] * Traffic[]))
| fieldsAdd pcc.sumX = arraySum(Metric3), pcc.sumY = arraySum(Traffic)
| fieldsAdd pcc.sumX2 = arraySum(iCollectArray(Metric3[] * Metric3[])), pcc.sumY2 = arraySum(iCollectArray(Traffic[] * Traffic[]))
| fieldsAdd Metric3.PCC = (pcc.n * pcc.sumXY - pcc.sumX * pcc.sumY) / sqrt((pcc.n * pcc.sumX2 - pcc.sumX * pcc.sumX) * (pcc.n * pcc.sumY2 - pcc.sumY * pcc.sumY))
| fieldsRemove pcc.n, pcc.sumXY, pcc.sumX, pcc.sumY, pcc.sumX2, pcc.sumY2
// Build output
| fields Traffic.Median, Traffic.AvgLowerThanMedian, Traffic.AvgHigherThanMedian, Traffic.PercentChange, Metric1.Median, Metric1.AvgLowerThanMedian, Metric1.AvgHigherThanMedian, Metric1.PercentChange, Metric2.Median, Metric2.AvgLowerThanMedian, Metric2.AvgHigherThanMedian, Metric2.PercentChange, Metric3.Median, Metric3.AvgLowerThanMedian, Metric3.AvgHigherThanMedian, Metric3.PercentChange, Metric1.PCC, Metric2.PCC, Metric3.PCC`;
}

/**
 * CPU by host query with per-host PCC computation.
 */
export function cpuByHostQuery(hosts: string[], topN: number, timeframeDays: number = 7): string {
  return `timeseries {
  cpuUsage = avg(dt.host.cpu.usage), Traffic = avg(dt.host.cpu.system),${hostFilter(hosts)}, by:{dt.entity.host}
},
union: TRUE,
from: -${timeframeDays}d,
interval: 5m
// Pearson Correlation Coefficient - cpuUsage vs Traffic
| fieldsAdd pcc.n = toDouble(arraySize(arrayRemoveNulls(iCollectArray(if(isNotNull(cpuUsage[]) AND isNotNull(Traffic[]), 1, else:null)))))
| fieldsAdd pcc.sumXY = arraySum(iCollectArray(cpuUsage[] * Traffic[]))
| fieldsAdd pcc.sumX = arraySum(cpuUsage), pcc.sumY = arraySum(Traffic)
| fieldsAdd pcc.sumX2 = arraySum(iCollectArray(cpuUsage[] * cpuUsage[])), pcc.sumY2 = arraySum(iCollectArray(Traffic[] * Traffic[]))
| fieldsAdd cpuUsage.PCC = (pcc.n * pcc.sumXY - pcc.sumX * pcc.sumY) / sqrt((pcc.n * pcc.sumX2 - pcc.sumX * pcc.sumX) * (pcc.n * pcc.sumY2 - pcc.sumY * pcc.sumY))
| fieldsRemove pcc.n, pcc.sumXY, pcc.sumX, pcc.sumY, pcc.sumX2, pcc.sumY2
| fieldsAdd cpuUsage.Median = arrayAvg(cpuUsage)
| fieldsAdd cpuUsage.AvgLowerThanMedian = arrayAvg(iCollectArray(if(cpuUsage[] < cpuUsage.Median, cpuUsage[], else: null)))
| fieldsAdd cpuUsage.AvgHigherThanMedian = arrayAvg(iCollectArray(if(cpuUsage[] > cpuUsage.Median, cpuUsage[], else: null)))
| fieldsAdd cpuUsage.PercentChange = 100 * (cpuUsage.AvgHigherThanMedian - cpuUsage.AvgLowerThanMedian) / (cpuUsage.AvgLowerThanMedian)
| fields dt.entity.host, \`Host Name\` = entityName(dt.entity.host), \`Pearson Correlation Coefficient\` = cpuUsage.PCC, \`Observed CPU Low\` = cpuUsage.AvgLowerThanMedian, \`Observed CPU Avg\` = cpuUsage.Median, \`Observed CPU High\` = cpuUsage.AvgHigherThanMedian, cpuUsage.PercentChange
| sort \`Pearson Correlation Coefficient\` desc
| filterOut isNull(\`Pearson Correlation Coefficient\`)
| limit ${topN}`;
}

/**
 * Memory by host query with per-host PCC computation.
 */
export function memoryByHostQuery(hosts: string[], topN: number, timeframeDays: number = 7): string {
  return `timeseries {
  memUsage = avg(dt.host.memory.usage), Traffic = avg(dt.host.cpu.system),${hostFilter(hosts)}, by:{dt.entity.host}
},
union: TRUE,
from: -${timeframeDays}d,
interval: 5m
// Pearson Correlation Coefficient - memUsage vs Traffic
| fieldsAdd pcc.n = toDouble(arraySize(arrayRemoveNulls(iCollectArray(if(isNotNull(memUsage[]) AND isNotNull(Traffic[]), 1, else:null)))))
| fieldsAdd pcc.sumXY = arraySum(iCollectArray(memUsage[] * Traffic[]))
| fieldsAdd pcc.sumX = arraySum(memUsage), pcc.sumY = arraySum(Traffic)
| fieldsAdd pcc.sumX2 = arraySum(iCollectArray(memUsage[] * memUsage[])), pcc.sumY2 = arraySum(iCollectArray(Traffic[] * Traffic[]))
| fieldsAdd memUsage.PCC = (pcc.n * pcc.sumXY - pcc.sumX * pcc.sumY) / sqrt((pcc.n * pcc.sumX2 - pcc.sumX * pcc.sumX) * (pcc.n * pcc.sumY2 - pcc.sumY * pcc.sumY))
| fieldsRemove pcc.n, pcc.sumXY, pcc.sumX, pcc.sumY, pcc.sumX2, pcc.sumY2
| fieldsAdd memUsage.Median = arrayAvg(memUsage)
| fieldsAdd memUsage.AvgLowerThanMedian = arrayAvg(iCollectArray(if(memUsage[] < memUsage.Median, memUsage[], else: null)))
| fieldsAdd memUsage.AvgHigherThanMedian = arrayAvg(iCollectArray(if(memUsage[] > memUsage.Median, memUsage[], else: null)))
| fieldsAdd memUsage.PercentChange = 100 * (memUsage.AvgHigherThanMedian - memUsage.AvgLowerThanMedian) / (memUsage.AvgLowerThanMedian)
| fields dt.entity.host, \`Host Name\` = entityName(dt.entity.host), \`Pearson Correlation Coefficient\` = memUsage.PCC, \`Observed MEM Low\` = memUsage.AvgLowerThanMedian, \`Observed MEM Avg\` = memUsage.Median, \`Observed MEM High\` = memUsage.AvgHigherThanMedian, memUsage.PercentChange
| sort \`Pearson Correlation Coefficient\` desc
| filterOut isNull(\`Pearson Correlation Coefficient\`)
| limit ${topN}`;
}

/**
 * Disk by host query with per-host PCC computation.
 */
export function diskByHostQuery(hosts: string[], topN: number, timeframeDays: number = 7): string {
  return `timeseries {
  diskFree = avg(dt.host.disk.used.percent), Traffic = avg(dt.host.cpu.system),${hostFilter(hosts)}, by:{dt.entity.host}
},
union: TRUE,
from: -${timeframeDays}d,
interval: 5m
// Pearson Correlation Coefficient - diskFree vs Traffic
| fieldsAdd pcc.n = toDouble(arraySize(arrayRemoveNulls(iCollectArray(if(isNotNull(diskFree[]) AND isNotNull(Traffic[]), 1, else:null)))))
| fieldsAdd pcc.sumXY = arraySum(iCollectArray(diskFree[] * Traffic[]))
| fieldsAdd pcc.sumX = arraySum(diskFree), pcc.sumY = arraySum(Traffic)
| fieldsAdd pcc.sumX2 = arraySum(iCollectArray(diskFree[] * diskFree[])), pcc.sumY2 = arraySum(iCollectArray(Traffic[] * Traffic[]))
| fieldsAdd diskFree.PCC = (pcc.n * pcc.sumXY - pcc.sumX * pcc.sumY) / sqrt((pcc.n * pcc.sumX2 - pcc.sumX * pcc.sumX) * (pcc.n * pcc.sumY2 - pcc.sumY * pcc.sumY))
| fieldsRemove pcc.n, pcc.sumXY, pcc.sumX, pcc.sumY, pcc.sumX2, pcc.sumY2
| fieldsAdd diskFree.Median = arrayAvg(diskFree)
| fieldsAdd diskFree.AvgLowerThanMedian = arrayAvg(iCollectArray(if(diskFree[] < diskFree.Median, diskFree[], else: null)))
| fieldsAdd diskFree.AvgHigherThanMedian = arrayAvg(iCollectArray(if(diskFree[] > diskFree.Median, diskFree[], else: null)))
| fieldsAdd diskFree.PercentChange = 100 * (diskFree.AvgHigherThanMedian - diskFree.AvgLowerThanMedian) / (diskFree.AvgLowerThanMedian)
| fields dt.entity.host, \`Host Name\` = entityName(dt.entity.host), \`Pearson Correlation Coefficient\` = diskFree.PCC, \`Observed Disk Free Low\` = diskFree.AvgLowerThanMedian, \`Observed Disk Free Avg\` = diskFree.Median, \`Observed Disk Free High\` = diskFree.AvgHigherThanMedian, diskFree.PercentChange
| sort \`Pearson Correlation Coefficient\` desc
| filterOut isNull(\`Pearson Correlation Coefficient\`)
| limit ${topN}`;
}

/** Metrics array indices */
export const M = {
  TRAFFIC_MEDIAN: 0,
  TRAFFIC_LOW: 1,
  TRAFFIC_HIGH: 2,
  TRAFFIC_CHANGE: 3,
  CPU_MEDIAN: 4,
  CPU_LOW: 5,
  CPU_HIGH: 6,
  CPU_CHANGE: 7,
  MEM_MEDIAN: 8,
  MEM_LOW: 9,
  MEM_HIGH: 10,
  MEM_CHANGE: 11,
  DISK_MEDIAN: 12,
  DISK_LOW: 13,
  DISK_HIGH: 14,
  DISK_CHANGE: 15,
  CPU_PCC: 16,
  MEM_PCC: 17,
  DISK_PCC: 18,
} as const;

export interface MetricsData {
  trafficMedian: number;
  trafficLow: number;
  trafficHigh: number;
  trafficChange: number;
  cpuMedian: number;
  cpuLow: number;
  cpuHigh: number;
  cpuChange: number;
  cpuPCC: number;
  memMedian: number;
  memLow: number;
  memHigh: number;
  memChange: number;
  memPCC: number;
  diskMedian: number;
  diskLow: number;
  diskHigh: number;
  diskChange: number;
  diskPCC: number;
}

export function parseMetrics(records: Array<Record<string, unknown>> | null | undefined): MetricsData | null {
  if (!records || records.length === 0) return null;
  const rec = records[0];
  // The query returns named fields; extract them
  const num = (key: string) => {
    const v = rec[key];
    return typeof v === "number" ? v : 0;
  };
  return {
    trafficMedian: num("Traffic.Median"),
    trafficLow: num("Traffic.AvgLowerThanMedian"),
    trafficHigh: num("Traffic.AvgHigherThanMedian"),
    trafficChange: num("Traffic.PercentChange"),
    cpuMedian: num("Metric1.Median"),
    cpuLow: num("Metric1.AvgLowerThanMedian"),
    cpuHigh: num("Metric1.AvgHigherThanMedian"),
    cpuChange: num("Metric1.PercentChange"),
    cpuPCC: num("Metric1.PCC"),
    memMedian: num("Metric2.Median"),
    memLow: num("Metric2.AvgLowerThanMedian"),
    memHigh: num("Metric2.AvgHigherThanMedian"),
    memChange: num("Metric2.PercentChange"),
    memPCC: num("Metric2.PCC"),
    diskMedian: num("Metric3.Median"),
    diskLow: num("Metric3.AvgLowerThanMedian"),
    diskHigh: num("Metric3.AvgHigherThanMedian"),
    diskChange: num("Metric3.PercentChange"),
    diskPCC: num("Metric3.PCC"),
  };
}

/**
 * Forecast calculation matching the latest dashboard formulas.
 * Now incorporates PCC as a scaling factor.
 *
 * Dashboard formula for forecast:
 *   ForecastHigh = observedHigh * (1 + TrafficChange% * PCC * (metricChange / trafficChange) / 100)
 */
export function forecast(
  observed: { low: number; avg: number; high: number; change: number },
  trafficChangePercent: number,
  trafficPercentChange: number,
  pcc: number
): { low: number; avg: number; high: number; percentChange: number } {
  if (!trafficPercentChange || trafficPercentChange === 0) {
    return { low: observed.low, avg: observed.avg, high: observed.high, percentChange: 0 };
  }
  const ratio = observed.change / trafficPercentChange;
  const factorWithPCC = 1 + (trafficChangePercent * pcc * ratio) / 100;
  const low = observed.low * factorWithPCC;
  const avg = observed.avg * factorWithPCC;
  const high = observed.high * factorWithPCC;
  const percentChange = observed.high !== 0
    ? (100 * (high - observed.high) / observed.high) * pcc
    : 0;
  return { low, avg, high, percentChange };
}

/**
 * Forecast for per-host table rows (same PCC-based formula).
 */
export function forecastForHost(
  observed: { low: number; avg: number; high: number; change: number },
  trafficChangePercent: number,
  trafficPercentChange: number,
  pcc: number
): { low: number; avg: number; high: number } {
  if (!trafficPercentChange || trafficPercentChange === 0) {
    return { low: observed.low, avg: observed.avg, high: observed.high };
  }
  const ratio = observed.change / trafficPercentChange;
  const factorWithPCC = 1 + (trafficChangePercent * pcc * ratio) / 100;
  const low = observed.low * factorWithPCC;
  const avg = observed.avg * factorWithPCC;
  const high = observed.high * factorWithPCC;
  return { low, avg, high };
}

/**
 * Analytics query — returns raw timeseries arrays plus basic stats.
 * PCC, lag correlation, skewness, and CV are computed client-side.
 */
export function analyticsQuery(hosts: string[], timeframeDays: number = 7): string {
  return `timeseries {
Traffic = avg(dt.host.cpu.system),
Metric1 = avg(dt.host.cpu.usage),
Metric2 = avg(dt.host.memory.usage),
Metric3 = avg(dt.host.disk.free),${hostFilter(hosts)}
},
from: -${timeframeDays}d,
interval: 5m
| fieldsAdd Traffic.P95 = arrayPercentile(Traffic, 95)
| fieldsAdd Traffic.P99 = arrayPercentile(Traffic, 99)
| fieldsAdd Traffic.Min = arrayMin(Traffic), Traffic.Max = arrayMax(Traffic), Traffic.Mean = arrayAvg(Traffic)
| fieldsAdd Metric1.P95 = arrayPercentile(Metric1, 95)
| fieldsAdd Metric1.P99 = arrayPercentile(Metric1, 99)
| fieldsAdd Metric1.Min = arrayMin(Metric1), Metric1.Max = arrayMax(Metric1), Metric1.Mean = arrayAvg(Metric1)
| fieldsAdd Metric2.P95 = arrayPercentile(Metric2, 95)
| fieldsAdd Metric2.P99 = arrayPercentile(Metric2, 99)
| fieldsAdd Metric2.Min = arrayMin(Metric2), Metric2.Max = arrayMax(Metric2), Metric2.Mean = arrayAvg(Metric2)
| fieldsAdd Metric3.P95 = arrayPercentile(Metric3, 95)
| fieldsAdd Metric3.P99 = arrayPercentile(Metric3, 99)
| fieldsAdd Metric3.Min = arrayMin(Metric3), Metric3.Max = arrayMax(Metric3), Metric3.Mean = arrayAvg(Metric3)
| fields Traffic, Metric1, Metric2, Metric3, Traffic.P95, Traffic.P99, Traffic.Min, Traffic.Max, Traffic.Mean, Metric1.P95, Metric1.P99, Metric1.Min, Metric1.Max, Metric1.Mean, Metric2.P95, Metric2.P99, Metric2.Min, Metric2.Max, Metric2.Mean, Metric3.P95, Metric3.P99, Metric3.Min, Metric3.Max, Metric3.Mean`;
}

/** Client-side stats helpers */
function computeStdDev(arr: number[], mean: number): number {
  if (arr.length === 0) return 0;
  const variance = arr.reduce((sum, v) => sum + (v - mean) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

function computeSkewness(arr: number[], mean: number, stdDev: number): number {
  if (arr.length === 0 || stdDev === 0) return 0;
  return arr.reduce((sum, v) => sum + ((v - mean) / stdDev) ** 3, 0) / arr.length;
}

export function computePCC(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n === 0) return 0;
  let sumXY = 0, sumX = 0, sumY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    sumXY += x[i] * y[i];
    sumX += x[i]; sumY += y[i];
    sumX2 += x[i] * x[i]; sumY2 += y[i] * y[i];
  }
  const denom = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  return denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
}

/** Analytics data shape */
export interface AnalyticsData {
  traffic: { p95: number; p99: number; min: number; max: number; mean: number; stdDev: number; skew: number };
  cpu: { p95: number; p99: number; min: number; max: number; mean: number; stdDev: number; skew: number; pcc: number; lagPCC15m: number; lagPCC30m: number; lagPCC1h: number };
  mem: { p95: number; p99: number; min: number; max: number; mean: number; stdDev: number; skew: number; pcc: number; lagPCC15m: number; lagPCC30m: number; lagPCC1h: number };
  disk: { p95: number; p99: number; min: number; max: number; mean: number; stdDev: number; skew: number; pcc: number; lagPCC15m: number; lagPCC30m: number; lagPCC1h: number };
  trafficArr: number[];
  cpuArr: number[];
  memArr: number[];
  diskArr: number[];
}

export function parseAnalytics(records: Array<Record<string, unknown>> | null | undefined): AnalyticsData | null {
  if (!records || records.length === 0) return null;
  const rec = records[0];
  const n = (key: string) => { const v = rec[key]; return typeof v === "number" ? v : 0; };
  const toArr = (key: string): number[] => {
    const v = rec[key];
    return Array.isArray(v) ? v.filter((x): x is number => typeof x === "number") : [];
  };

  const trafficArr = toArr("Traffic");
  const cpuArr = toArr("Metric1");
  const memArr = toArr("Metric2");
  const diskArr = toArr("Metric3");

  const trafficMean = n("Traffic.Mean");
  const cpuMean = n("Metric1.Mean");
  const memMean = n("Metric2.Mean");
  const diskMean = n("Metric3.Mean");

  const trafficStd = computeStdDev(trafficArr, trafficMean);
  const cpuStd = computeStdDev(cpuArr, cpuMean);
  const memStd = computeStdDev(memArr, memMean);
  const diskStd = computeStdDev(diskArr, diskMean);

  // PCC at lag 0
  const cpuPCC = computePCC(cpuArr, trafficArr);
  const memPCC = computePCC(memArr, trafficArr);
  const diskPCC = computePCC(diskArr, trafficArr);

  // Lag PCC: shift traffic by offset, trim metric to same length
  const lagPCC = (metricArr: number[], lag: number) => {
    const tLagged = trafficArr.slice(lag);
    const mTrimmed = metricArr.slice(0, tLagged.length);
    return computePCC(mTrimmed, tLagged);
  };

  return {
    traffic: { p95: n("Traffic.P95"), p99: n("Traffic.P99"), min: n("Traffic.Min"), max: n("Traffic.Max"), mean: trafficMean, stdDev: trafficStd, skew: computeSkewness(trafficArr, trafficMean, trafficStd) },
    cpu: { p95: n("Metric1.P95"), p99: n("Metric1.P99"), min: n("Metric1.Min"), max: n("Metric1.Max"), mean: cpuMean, stdDev: cpuStd, skew: computeSkewness(cpuArr, cpuMean, cpuStd), pcc: cpuPCC, lagPCC15m: lagPCC(cpuArr, 3), lagPCC30m: lagPCC(cpuArr, 6), lagPCC1h: lagPCC(cpuArr, 12) },
    mem: { p95: n("Metric2.P95"), p99: n("Metric2.P99"), min: n("Metric2.Min"), max: n("Metric2.Max"), mean: memMean, stdDev: memStd, skew: computeSkewness(memArr, memMean, memStd), pcc: memPCC, lagPCC15m: lagPCC(memArr, 3), lagPCC30m: lagPCC(memArr, 6), lagPCC1h: lagPCC(memArr, 12) },
    disk: { p95: n("Metric3.P95"), p99: n("Metric3.P99"), min: n("Metric3.Min"), max: n("Metric3.Max"), mean: diskMean, stdDev: diskStd, skew: computeSkewness(diskArr, diskMean, diskStd), pcc: diskPCC, lagPCC15m: lagPCC(diskArr, 3), lagPCC30m: lagPCC(diskArr, 6), lagPCC1h: lagPCC(diskArr, 12) },
    trafficArr,
    cpuArr,
    memArr,
    diskArr,
  };
}
