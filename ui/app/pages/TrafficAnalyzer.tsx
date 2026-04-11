import React, { useState, useMemo, useCallback } from "react";
import "./TrafficAnalyzer.css";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Strong, Paragraph } from "@dynatrace/strato-components/typography";
import { SingleValue } from "@dynatrace/strato-components/charts";
import { HoneycombChart } from "@dynatrace/strato-components/charts";
import type { HoneycombTileNumericData } from "@dynatrace/strato-components/charts";
import { CategoricalBarChart } from "@dynatrace/strato-components-preview/charts";
import { GaugeChart } from "@dynatrace/strato-components-preview/charts";
import { Select } from "@dynatrace/strato-components-preview/forms";
import { NumberInput } from "@dynatrace/strato-components/forms";
import { DataTable } from "@dynatrace/strato-components-preview/tables";
import { ProgressCircle } from "@dynatrace/strato-components/content";
import { Tabs, Tab } from "@dynatrace/strato-components/navigation";
import { Modal } from "@dynatrace/strato-components/overlays";
import { Button } from "@dynatrace/strato-components/buttons";
import { SettingIcon, HelpIcon } from "@dynatrace/strato-icons";
import { useDql } from "@dynatrace-sdk/react-hooks";
import {
  hostListQuery,
  hostGroupListQuery,
  hostsForGroupQuery,
  metricsQuery,
  cpuByHostQuery,
  memoryByHostQuery,
  diskByHostQuery,
  analyticsQuery,
  parseMetrics,
  parseAnalytics,
  forecast,
  forecastForHost,
  computePCC,
} from "../queries";
import type { MetricsData, AnalyticsData } from "../queries";

const TRAFFIC_CHANGE_OPTIONS = [
  0, 1, 2, 3, 4, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75,
  80, 85, 90, 95, 100, 110, 120, 130, 140, 147, 150, 200, 250, 300, 350, 400,
  450, 500, 600, 700, 800, 900, 1000, 2000, 3000, 4000, 5000,
];

const DEFAULT_PROVISION_GOAL = 80;
const DEFAULT_TOP_N = 100;

const TIMEFRAME_OPTIONS = [
  { label: "1 day", value: 1 },
  { label: "2 days", value: 2 },
  { label: "3 days", value: 3 },
  { label: "5 days", value: 5 },
  { label: "7 days", value: 7 },
  { label: "14 days", value: 14 },
  { label: "30 days", value: 30 },
  { label: "60 days", value: 60 },
  { label: "90 days", value: 90 },
  { label: "180 days", value: 180 },
  { label: "365 days", value: 365 },
];

function getResourceColor(value: number): string {
  if (value >= 90) return "#F8312F";
  if (value >= 80) return "#FCD53F";
  return "#00D26A";
}

function getChangeColor(value: number): string {
  if (value <= 0) return "#00D26A";
  if (value >= 5) return "#F8312F";
  return "#FCD53F";
}

function getProvisioningColor(value: number): string {
  if (value < -5 || value >= 5) return "#F8312F";
  return "#00D26A";
}

function getPccColor(value: number): string {
  if (value >= 0.5) return "#00D26A";
  if (value >= 0.3) return "#FCD53F";
  return "#F8312F";
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function num(v: unknown): number {
  return typeof v === "number" ? v : 0;
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div style={{ padding: "10px 20px", background: "linear-gradient(135deg, #0d3fb8 0%, #134fc9 50%, #1a6bef 100%)", borderRadius: 8, boxShadow: "0 2px 12px rgba(19, 79, 201, 0.35)" }}>
      <Heading level={5} style={{ color: "#fff", margin: 0, letterSpacing: 0.5 }}>{title}</Heading>
    </div>
  );
}

function SubHeader({ title }: { title: string }) {
  return (
    <div style={{ padding: "6px 14px", background: "linear-gradient(135deg, #0d3fb8 0%, #134fc9 100%)", borderRadius: 6, boxShadow: "0 1px 8px rgba(19, 79, 201, 0.25)" }}>
      <Strong style={{ color: "#fff", letterSpacing: 0.3 }}>{title}</Strong>
    </div>
  );
}

const GREEN = "#00D26A";
const YELLOW = "#FCD53F";
const RED = "#F8312F";
const BLUE = "#134FC9";

function InsightBox({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <div style={{ padding: "12px 16px", background: "linear-gradient(135deg, rgba(30, 35, 55, 0.7) 0%, rgba(22, 26, 42, 0.9) 100%)", border: `1px solid ${color ?? "rgba(69, 137, 255, 0.3)"}`, borderLeft: `4px solid ${color ?? "#4589FF"}`, borderRadius: 8, fontSize: 13, lineHeight: 1.7, color: "#d0d4e0" }}>
      {children}
    </div>
  );
}

interface AlertRule {
  id: number;
  metric: string;
  comparator: string;
  threshold: number;
  host?: string;
}

interface Scenario {
  id: number;
  name: string;
  trafficPercent: number;
}

interface Baseline {
  id: number;
  name: string;
  timestamp: string;
  cpuHigh: number;
  memHigh: number;
  diskHigh: number;
  cpuPCC: number;
  memPCC: number;
  diskPCC: number;
}

const TILE_BORDER = "1px solid rgba(99, 130, 191, 0.25)";
const TILE_SHADOW = "0 2px 8px rgba(0, 0, 0, 0.2), 0 0 1px rgba(99, 130, 191, 0.2)";
const TILE_BG = "linear-gradient(145deg, rgba(30, 35, 55, 0.6) 0%, rgba(22, 26, 42, 0.8) 100%)";

function MetricCard({ label, value, unit, color, bordered, style: extraStyle }: { label: string; value: number; unit?: string; color: string; bordered?: boolean; style?: React.CSSProperties }) {
  return (
    <div style={{ flex: "1 1 180px", minWidth: 160, maxWidth: 280, width: 200, height: 80, textAlign: "center", ...(bordered ? { border: TILE_BORDER, borderRadius: 10, padding: 4, background: TILE_BG, boxShadow: TILE_SHADOW, transition: "box-shadow 0.2s ease, transform 0.2s ease" } : {}), ...extraStyle }}>
      <SingleValue data={round(value)} label={label} unit={unit} color={color} />
    </div>
  );
}

function ArrowRight() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minWidth: 120, flex: "0 0 120px" }}>
      <svg width="120" height="80" viewBox="0 0 120 80" fill="none" style={{ filter: "drop-shadow(0 0 6px rgba(19, 79, 201, 0.5))" }}>
        <defs>
          <linearGradient id="arrowGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#4589FF" />
            <stop offset="100%" stopColor="#134FC9" />
          </linearGradient>
        </defs>
        <path d="M5 40h90M80 10l30 30-30 30" stroke="url(#arrowGrad)" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

// Threshold factory functions - use custom comparator for yellow ranges
function resourceThresholds(key: string): any[] {
  return [
    { comparator: "greater-than-or-equal-to" as const, value: 90, backgroundColor: "#F8312F", color: "#000" },
    { comparator: ((row: any) => { const v = row[key]; return v >= 80 && v < 90; }), backgroundColor: "#FCD53F", color: "#000" },
    { comparator: "less-than" as const, value: 80, backgroundColor: "#00D26A", color: "#000" },
  ];
}

const PROVISIONING_THRESHOLDS = [
  { comparator: "less-than" as const, value: 0, backgroundColor: "#F8312F", color: "#000" },
  { comparator: "greater-than-or-equal-to" as const, value: 0, backgroundColor: "#00D26A", color: "#000" },
];

function pccThresholds(key: string): any[] {
  return [
    { comparator: "greater-than-or-equal-to" as const, value: 0.5, backgroundColor: "#00D26A", color: "#000" },
    { comparator: ((row: any) => { const v = row[key]; return v >= 0.3 && v < 0.5; }), backgroundColor: "#FCD53F", color: "#000" },
    { comparator: "less-than" as const, value: 0.3, backgroundColor: "#F8312F", color: "#000" },
  ];
}

function LoadingState() {
  return (
    <Flex justifyContent="center" padding={32}>
      <ProgressCircle />
    </Flex>
  );
}

export const TrafficAnalyzer = () => {
  const [selectedHosts, setSelectedHosts] = useState<string[]>([]);
  const [selectedHostGroups, setSelectedHostGroups] = useState<string[]>([]);
  const [trafficChangePercent, setTrafficChangePercent] = useState<number>(0);
  const [topN, setTopN] = useState<number>(DEFAULT_TOP_N);
  const [timeframeDays, setTimeframeDays] = useState<number>(7);
  const [provisionGoal, setProvisionGoal] = useState<number>(DEFAULT_PROVISION_GOAL);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [tempTopN, setTempTopN] = useState<number>(DEFAULT_TOP_N);
  const [tempProvisionGoal, setTempProvisionGoal] = useState<number>(DEFAULT_PROVISION_GOAL);
  const [cpuColSizing, setCpuColSizing] = useState<Record<string, number>>({});
  const [memColSizing, setMemColSizing] = useState<Record<string, number>>({});
  const [diskColSizing, setDiskColSizing] = useState<Record<string, number>>({});

  // What-If Scenarios state
  const [scenarios, setScenarios] = useState<Scenario[]>([
    { id: 1, name: "Low", trafficPercent: 50 },
    { id: 2, name: "Expected", trafficPercent: 100 },
    { id: 3, name: "Peak", trafficPercent: 200 },
  ]);
  const [newScenarioName, setNewScenarioName] = useState("");
  const [newScenarioPercent, setNewScenarioPercent] = useState<number>(100);

  // Alert Rules state
  const [alertRules, setAlertRules] = useState<AlertRule[]>([]);
  const [newAlertMetric, setNewAlertMetric] = useState("Forecast CPU High");
  const [newAlertComparator, setNewAlertComparator] = useState(">");
  const [newAlertThreshold, setNewAlertThreshold] = useState<number>(90);

  // Baselines state
  const [baselines, setBaselines] = useState<Baseline[]>([]);
  const [baselineName, setBaselineName] = useState("");

  // Fetch host group list
  const hostGroupList = useDql({ query: hostGroupListQuery() });
  const hostGroupOptions: string[] = useMemo(() => {
    if (!hostGroupList.data?.records) return [];
    const rec = hostGroupList.data.records[0];
    if (!rec) return [];
    const arr = rec["distinctGroupNames"];
    return Array.isArray(arr) ? arr.filter((g): g is string => typeof g === "string") : [];
  }, [hostGroupList.data]);

  // Fetch host list - filtered by host group if selected
  const hostList = useDql({ query: selectedHostGroups.length > 0 ? hostsForGroupQuery(selectedHostGroups) : hostListQuery() });
  const hostOptions: string[] = useMemo(() => {
    if (!hostList.data?.records) return [];
    const rec = hostList.data.records[0];
    if (!rec) return [];
    const arr = rec["distinctHostNames"];
    return Array.isArray(arr) ? arr.filter((h): h is string => typeof h === "string") : [];
  }, [hostList.data]);

  // Clear selected hosts that are no longer in the filtered list
  const validSelectedHosts = useMemo(() => {
    if (selectedHosts.length === 0) return [];
    return selectedHosts.filter((h) => hostOptions.includes(h));
  }, [selectedHosts, hostOptions]);

  const activeHosts = validSelectedHosts.length > 0 ? validSelectedHosts : hostOptions;

  // Single metrics query (replaces separate CPU/Memory/Disk queries)
  const metricsResult = useDql({ query: metricsQuery(activeHosts, timeframeDays) });

  // Table queries with per-host PCC
  const cpuByHost = useDql({ query: cpuByHostQuery(activeHosts, topN, timeframeDays) });
  const memByHost = useDql({ query: memoryByHostQuery(activeHosts, topN, timeframeDays) });
  const diskByHost = useDql({ query: diskByHostQuery(activeHosts, topN, timeframeDays) });

  // Analytics query
  const analyticsResult = useDql({ query: analyticsQuery(activeHosts, timeframeDays) });

  const isLoading = metricsResult.isLoading;

  // Parse the metrics array
  const metrics: MetricsData | null = useMemo(() => parseMetrics(metricsResult.data?.records), [metricsResult.data]);

  // Derived observed values
  const cpu = useMemo(() => metrics ? { low: metrics.cpuLow, avg: metrics.cpuMedian, high: metrics.cpuHigh, change: metrics.cpuChange } : { low: 0, avg: 0, high: 0, change: 0 }, [metrics]);
  const memory = useMemo(() => metrics ? { low: metrics.memLow, avg: metrics.memMedian, high: metrics.memHigh, change: metrics.memChange } : { low: 0, avg: 0, high: 0, change: 0 }, [metrics]);
  const disk = useMemo(() => metrics ? { low: metrics.diskLow, avg: metrics.diskMedian, high: metrics.diskHigh, change: metrics.diskChange } : { low: 0, avg: 0, high: 0, change: 0 }, [metrics]);
  const traffic = useMemo(() => metrics ? { median: metrics.trafficMedian, low: metrics.trafficLow, high: metrics.trafficHigh, change: metrics.trafficChange } : { median: 0, low: 0, high: 0, change: 0 }, [metrics]);

  const cpuPCC = metrics?.cpuPCC ?? 0;
  const memPCC = metrics?.memPCC ?? 0;
  const diskPCC = metrics?.diskPCC ?? 0;

  // Parse analytics data
  const analytics: AnalyticsData | null = useMemo(() => parseAnalytics(analyticsResult.data?.records), [analyticsResult.data]);

  // Derived analytics: R², CV, Elasticity
  const analyticsExtras = useMemo(() => {
    if (!analytics || !metrics) return null;
    const safeDiv = (a: number, b: number) => b !== 0 ? a / b : 0;
    return {
      cpu: {
        rSquared: analytics.cpu.pcc * analytics.cpu.pcc,
        cv: safeDiv(analytics.cpu.stdDev, analytics.cpu.mean),
        elasticity: safeDiv(metrics.cpuChange, metrics.trafficChange),
      },
      mem: {
        rSquared: analytics.mem.pcc * analytics.mem.pcc,
        cv: safeDiv(analytics.mem.stdDev, analytics.mem.mean),
        elasticity: safeDiv(metrics.memChange, metrics.trafficChange),
      },
      disk: {
        rSquared: analytics.disk.pcc * analytics.disk.pcc,
        cv: safeDiv(analytics.disk.stdDev, analytics.disk.mean),
        elasticity: safeDiv(metrics.diskChange, metrics.trafficChange),
      },
      traffic: {
        cv: safeDiv(analytics.traffic.stdDev, analytics.traffic.mean),
      },
    };
  }, [analytics, metrics]);

  // Forecasted values (with PCC)
  const cpuForecast = useMemo(() => forecast(cpu, trafficChangePercent, traffic.change, cpuPCC), [cpu, trafficChangePercent, traffic.change, cpuPCC]);
  const memForecast = useMemo(() => forecast(memory, trafficChangePercent, traffic.change, memPCC), [memory, trafficChangePercent, traffic.change, memPCC]);
  const diskForecast = useMemo(() => forecast(disk, trafficChangePercent, traffic.change, diskPCC), [disk, trafficChangePercent, traffic.change, diskPCC]);

  // Provisioning (PCC-weighted)
  const cpuProvisioning = provisionGoal - cpuForecast.high * cpuPCC;
  const memProvisioning = provisionGoal - memForecast.high * memPCC;
  const diskProvisioning = provisionGoal - diskForecast.high * diskPCC;



  // Bar chart data
  const cpuBarData = useMemo(() => [
    { category: "Observed Low", value: round(cpu.low), color: "#134FC9" },
    { category: "Observed Average", value: round(cpu.avg), color: "#134FC9" },
    { category: "Observed High", value: round(cpu.high), color: "#134FC9" },
    { category: "Forecast Low", value: round(cpuForecast.low), color: getResourceColor(cpuForecast.low) },
    { category: "Forecast Average", value: round(cpuForecast.avg), color: getResourceColor(cpuForecast.avg) },
    { category: "Forecast High", value: round(cpuForecast.high), color: getResourceColor(cpuForecast.high) },
  ], [cpu, cpuForecast]);

  const memBarData = useMemo(() => [
    { category: "Observed Low", value: round(memory.low), color: "#134FC9" },
    { category: "Observed Average", value: round(memory.avg), color: "#134FC9" },
    { category: "Observed High", value: round(memory.high), color: "#134FC9" },
    { category: "Forecast Low", value: round(memForecast.low), color: getResourceColor(memForecast.low) },
    { category: "Forecast Average", value: round(memForecast.avg), color: getResourceColor(memForecast.avg) },
    { category: "Forecast High", value: round(memForecast.high), color: getResourceColor(memForecast.high) },
  ], [memory, memForecast]);

  const diskBarData = useMemo(() => [
    { category: "Observed Low", value: round(disk.low), color: "#134FC9" },
    { category: "Observed Average", value: round(disk.avg), color: "#134FC9" },
    { category: "Observed High", value: round(disk.high), color: "#134FC9" },
    { category: "Forecast Low", value: round(diskForecast.low), color: getResourceColor(diskForecast.low) },
    { category: "Forecast Average", value: round(diskForecast.avg), color: getResourceColor(diskForecast.avg) },
    { category: "Forecast High", value: round(diskForecast.high), color: getResourceColor(diskForecast.high) },
  ], [disk, diskForecast]);

  // Table data with PCC-based forecasted columns
  const cpuTableData = useMemo(() => {
    if (!cpuByHost.data?.records || !metrics) return [];
    return cpuByHost.data.records.map((r) => {
      const pcc = num(r["Pearson Correlation Coefficient"]);
      const obs = { low: num(r["Observed CPU Low"]), avg: num(r["Observed CPU Avg"]), high: num(r["Observed CPU High"]), change: num(r["cpuUsage.PercentChange"]) };
      const fc = forecastForHost(obs, trafficChangePercent, traffic.change, pcc);
      return { "Host Name": r["Host Name"] as string, "PCC": round(pcc), "Observed CPU Low": round(obs.low), "Observed CPU Avg": round(obs.avg), "Observed CPU High": round(obs.high), "Forecast CPU Low": round(fc.low), "Forecast CPU Avg": round(fc.avg), "Forecast CPU High": round(fc.high), Provisioning: round(provisionGoal - fc.high) };
    });
  }, [cpuByHost.data, trafficChangePercent, traffic.change, metrics, provisionGoal]);

  const memTableData = useMemo(() => {
    if (!memByHost.data?.records || !metrics) return [];
    return memByHost.data.records.map((r) => {
      const pcc = num(r["Pearson Correlation Coefficient"]);
      const obs = { low: num(r["Observed MEM Low"]), avg: num(r["Observed MEM Avg"]), high: num(r["Observed MEM High"]), change: num(r["memUsage.PercentChange"]) };
      const fc = forecastForHost(obs, trafficChangePercent, traffic.change, pcc);
      return { "Host Name": r["Host Name"] as string, "PCC": round(pcc), "Observed MEM Low": round(obs.low), "Observed MEM Avg": round(obs.avg), "Observed MEM High": round(obs.high), "Forecast MEM Low": round(fc.low), "Forecast MEM Avg": round(fc.avg), "Forecast MEM High": round(fc.high), Provisioning: round(provisionGoal - fc.high) };
    });
  }, [memByHost.data, trafficChangePercent, traffic.change, metrics, provisionGoal]);

  const diskTableData = useMemo(() => {
    if (!diskByHost.data?.records || !metrics) return [];
    return diskByHost.data.records.map((r) => {
      const pcc = num(r["Pearson Correlation Coefficient"]);
      const obs = { low: num(r["Observed Disk Free Low"]), avg: num(r["Observed Disk Free Avg"]), high: num(r["Observed Disk Free High"]), change: num(r["diskFree.PercentChange"]) };
      const fc = forecastForHost(obs, trafficChangePercent, traffic.change, pcc);
      return { "Host Name": r["Host Name"] as string, "PCC": round(pcc), "Observed Disk Free Low": round(obs.low), "Observed Disk Free Avg": round(obs.avg), "Observed Disk Free High": round(obs.high), "Forecast Disk Free Low": round(fc.low), "Forecast Disk Free Avg": round(fc.avg), "Forecast Disk Free High": round(fc.high), Provisioning: round(provisionGoal - fc.high) };
    });
  }, [diskByHost.data, trafficChangePercent, traffic.change, metrics, provisionGoal]);

  const handleSaveSettings = () => {
    setTopN(tempTopN);
    setProvisionGoal(tempProvisionGoal);
    setSettingsOpen(false);
  };

  // ═══════════════════════ NEW FEATURES — Computed Data ═══════════════════════

  // --- Saturation Countdown (linear regression → days to provision goal) ---
  const saturationData = useMemo(() => {
    if (!cpuTableData.length) return [];
    const cpuMap = new Map(cpuTableData.map((r) => [r["Host Name"], r]));
    const memMap = new Map(memTableData.map((r) => [r["Host Name"], r]));
    const diskMap = new Map(diskTableData.map((r) => [r["Host Name"], r]));
    const hosts = Array.from(new Set([...cpuMap.keys(), ...memMap.keys(), ...diskMap.keys()]));
    return hosts.map((h) => {
      const c = cpuMap.get(h);
      const m = memMap.get(h);
      const d = diskMap.get(h);
      const cpuCurrent = c ? c["Observed CPU High"] : 0;
      const cpuFc = c ? c["Forecast CPU High"] : 0;
      const memCurrent = m ? m["Observed MEM High"] : 0;
      const memFc = m ? m["Forecast MEM High"] : 0;
      const diskCurrent = d ? d["Observed Disk Free High"] : 0;
      const diskFc = d ? d["Forecast Disk Free High"] : 0;
      const daysToSat = (current: number, fc: number) => {
        if (fc <= current || fc <= 0) return Infinity;
        const ratePerDay = (fc - current) / (timeframeDays || 7);
        const gap = provisionGoal - current;
        return ratePerDay > 0 && gap > 0 ? Math.round(gap / ratePerDay) : Infinity;
      };
      const cpuDays = daysToSat(cpuCurrent, cpuFc);
      const memDays = daysToSat(memCurrent, memFc);
      const diskDays = daysToSat(diskCurrent, diskFc);
      const minDays = Math.min(cpuDays, memDays, diskDays);
      return {
        "Host Name": h,
        "CPU Current (%)": cpuCurrent,
        "CPU Days to Saturation": cpuDays === Infinity ? "—" : cpuDays,
        "MEM Current (%)": memCurrent,
        "MEM Days to Saturation": memDays === Infinity ? "—" : memDays,
        "Disk Current (%)": diskCurrent,
        "Disk Days to Saturation": diskDays === Infinity ? "—" : diskDays,
        "Earliest Saturation": minDays === Infinity ? "—" : `${minDays}d`,
        _minDays: minDays,
      };
    }).sort((a, b) => (a._minDays === Infinity ? 999999 : a._minDays) - (b._minDays === Infinity ? 999999 : b._minDays));
  }, [cpuTableData, memTableData, diskTableData, provisionGoal, timeframeDays]);

  // --- What-If Scenarios ---
  const scenarioResults = useMemo(() => {
    if (!metrics) return [];
    return scenarios.map((s) => {
      const cf = forecast(cpu, s.trafficPercent, traffic.change, cpuPCC);
      const mf = forecast(memory, s.trafficPercent, traffic.change, memPCC);
      const df = forecast(disk, s.trafficPercent, traffic.change, diskPCC);
      return {
        Scenario: s.name,
        "Traffic %": s.trafficPercent,
        "CPU High": round(cf.high),
        "CPU Prov.": round(provisionGoal - cf.high * cpuPCC),
        "MEM High": round(mf.high),
        "MEM Prov.": round(provisionGoal - mf.high * memPCC),
        "Disk High": round(df.high),
        "Disk Prov.": round(provisionGoal - df.high * diskPCC),
      };
    });
  }, [scenarios, metrics, cpu, memory, disk, traffic.change, cpuPCC, memPCC, diskPCC, provisionGoal]);

  const addScenario = useCallback(() => {
    if (!newScenarioName.trim()) return;
    setScenarios((prev) => [...prev, { id: Date.now(), name: newScenarioName.trim(), trafficPercent: newScenarioPercent }]);
    setNewScenarioName("");
  }, [newScenarioName, newScenarioPercent]);

  // --- Right-Sizing Recommendations ---
  const rightSizingData = useMemo(() => {
    if (!cpuTableData.length) return [];
    const cpuMap = new Map(cpuTableData.map((r) => [r["Host Name"], r]));
    const memMap = new Map(memTableData.map((r) => [r["Host Name"], r]));
    const hosts = Array.from(cpuMap.keys());
    return hosts.map((h) => {
      const c = cpuMap.get(h)!;
      const m = memMap.get(h);
      const cpuFcHigh = c["Forecast CPU High"];
      const memFcHigh = m ? m["Forecast MEM High"] : 0;
      const cpuHeadroom = provisionGoal - cpuFcHigh;
      const memHeadroom = provisionGoal - (memFcHigh);
      let status = "Optimal";
      let statusColor = GREEN;
      if (cpuHeadroom < 0 || memHeadroom < 0) { status = "Under-Provisioned"; statusColor = RED; }
      else if (cpuHeadroom > 40 && memHeadroom > 40) { status = "Over-Provisioned"; statusColor = YELLOW; }
      return {
        "Host Name": h,
        "CPU Forecast High": round(cpuFcHigh),
        "CPU Headroom": round(cpuHeadroom),
        "MEM Forecast High": round(memFcHigh),
        "MEM Headroom": round(memHeadroom),
        Status: status,
        _statusColor: statusColor,
      };
    }).sort((a, b) => a["CPU Headroom"] - b["CPU Headroom"]);
  }, [cpuTableData, memTableData, provisionGoal]);

  // --- Host Group Heatmap ---
  const heatmapData: HoneycombTileNumericData[] = useMemo(() => {
    if (!cpuTableData.length) return [];
    return cpuTableData.map((r) => ({
      name: r["Host Name"],
      value: round(r["Forecast CPU High"]),
    }));
  }, [cpuTableData]);

  // --- Correlation Matrix (cross-resource) ---
  const correlationMatrix = useMemo(() => {
    if (!analytics) return null;
    const cpuMem = computePCC(analytics.cpuArr, analytics.memArr);
    const cpuDisk = computePCC(analytics.cpuArr, analytics.diskArr);
    const memDisk = computePCC(analytics.memArr, analytics.diskArr);
    return {
      trafficCpu: analytics.cpu.pcc,
      trafficMem: analytics.mem.pcc,
      trafficDisk: analytics.disk.pcc,
      cpuMem,
      cpuDisk,
      memDisk,
    };
  }, [analytics]);

  // --- Trend Decomposition (simple moving average decomposition) ---
  const trendData = useMemo(() => {
    if (!analytics) return null;
    const windowSize = 12;// 1 hour window at 5min intervals
    const movingAvg = (arr: number[]) => {
      const result: number[] = [];
      for (let i = 0; i < arr.length; i++) {
        const start = Math.max(0, i - Math.floor(windowSize / 2));
        const end = Math.min(arr.length, i + Math.ceil(windowSize / 2));
        const slice = arr.slice(start, end);
        result.push(slice.reduce((a, b) => a + b, 0) / slice.length);
      }
      return result;
    };
    const decompose = (arr: number[]) => {
      const trend = movingAvg(arr);
      const residual = arr.map((v, i) => v - trend[i]);
      const trendSlope = arr.length > 1 ? (trend[trend.length - 1] - trend[0]) / arr.length : 0;
      const residualStd = Math.sqrt(residual.reduce((s, v) => s + v * v, 0) / residual.length);
      return { trendSlope: round(trendSlope * 100), residualStd: round(residualStd), trendStart: round(trend[0]), trendEnd: round(trend[trend.length - 1]) };
    };
    return {
      cpu: decompose(analytics.cpuArr),
      mem: decompose(analytics.memArr),
      disk: decompose(analytics.diskArr),
      traffic: decompose(analytics.trafficArr),
    };
  }, [analytics]);

  // --- Alert Rules ---
  const addAlertRule = useCallback(() => {
    setAlertRules((prev) => [...prev, { id: Date.now(), metric: newAlertMetric, comparator: newAlertComparator, threshold: newAlertThreshold }]);
  }, [newAlertMetric, newAlertComparator, newAlertThreshold]);

  const alertViolations = useMemo(() => {
    if (!alertRules.length || !cpuTableData.length) return [];
    const violations: { rule: string; host: string; actual: number }[] = [];
    const allHosts = cpuTableData.map((r) => r["Host Name"]);
    const cpuMap = new Map(cpuTableData.map((r) => [r["Host Name"], r]));
    const memMap = new Map(memTableData.map((r) => [r["Host Name"], r]));
    const diskMap = new Map(diskTableData.map((r) => [r["Host Name"], r]));
    for (const rule of alertRules) {
      for (const host of allHosts) {
        const c = cpuMap.get(host);
        const m = memMap.get(host);
        const d = diskMap.get(host);
        let value = 0;
        if (rule.metric === "Forecast CPU High") value = c ? c["Forecast CPU High"] : 0;
        else if (rule.metric === "Forecast MEM High") value = m ? m["Forecast MEM High"] : 0;
        else if (rule.metric === "Forecast Disk High") value = d ? d["Forecast Disk Free High"] : 0;
        else if (rule.metric === "Observed CPU High") value = c ? c["Observed CPU High"] : 0;
        else if (rule.metric === "Observed MEM High") value = m ? m["Observed MEM High"] : 0;
        let triggered = false;
        if (rule.comparator === ">" && value > rule.threshold) triggered = true;
        else if (rule.comparator === ">=" && value >= rule.threshold) triggered = true;
        else if (rule.comparator === "<" && value < rule.threshold) triggered = true;
        if (triggered) violations.push({ rule: `${rule.metric} ${rule.comparator} ${rule.threshold}%`, host, actual: round(value) });
      }
    }
    return violations;
  }, [alertRules, cpuTableData, memTableData, diskTableData]);

  // --- Baselines ---
  const saveBaseline = useCallback(() => {
    if (!metrics || !baselineName.trim()) return;
    setBaselines((prev) => [...prev, {
      id: Date.now(), name: baselineName.trim(), timestamp: new Date().toLocaleString(),
      cpuHigh: round(cpu.high), memHigh: round(memory.high), diskHigh: round(disk.high),
      cpuPCC: round(cpuPCC), memPCC: round(memPCC), diskPCC: round(diskPCC),
    }]);
    setBaselineName("");
  }, [baselineName, metrics, cpu.high, memory.high, disk.high, cpuPCC, memPCC, diskPCC]);

  // --- Analytics Exec Summaries ---
  const execSummaries = useMemo(() => {
    if (!analytics || !analyticsExtras || !metrics) return null;
    const pccDesc = (pcc: number, name: string) => {
      if (pcc >= 0.7) return `${name} is strongly driven by traffic — when traffic increases, ${name.toLowerCase()} increases proportionally.`;
      if (pcc >= 0.5) return `${name} has a meaningful relationship with traffic. Traffic is one of the main factors driving ${name.toLowerCase()}.`;
      if (pcc >= 0.3) return `${name} has a moderate link to traffic. Other factors beyond traffic are also influencing ${name.toLowerCase()}.`;
      return `${name} shows little connection to traffic. It is likely driven by factors other than traffic volume.`;
    };
    const r2Desc = (r2: number, name: string) => {
      const pct = Math.round(r2 * 100);
      if (r2 >= 0.5) return `Traffic explains ${pct}% of ${name.toLowerCase()} variability — it is the dominant factor.`;
      if (r2 >= 0.25) return `Traffic explains ${pct}% of ${name.toLowerCase()} variability — a noticeable but not dominant factor.`;
      return `Traffic only explains ${pct}% of ${name.toLowerCase()} variability — other factors are more important.`;
    };
    const elastDesc = (e: number, name: string) => {
      if (Math.abs(e) > 2) return `${name} is highly sensitive — it changes ${round(Math.abs(e))}x faster than traffic. This is a potential bottleneck that needs attention.`;
      if (Math.abs(e) > 1) return `${name} is amplifying traffic changes — a ${round(Math.abs(e))}x multiplier. Worth monitoring closely during traffic spikes.`;
      if (Math.abs(e) > 0.5) return `${name} grows at roughly the same rate as traffic — this is normal and manageable.`;
      return `${name} is relatively insensitive to traffic changes — it stays stable even when traffic fluctuates.`;
    };
    const lagDesc = (pcc0: number, pcc15: number, pcc30: number, pcc1h: number, name: string) => {
      const max = Math.max(pcc0, pcc15, pcc30, pcc1h);
      if (max === pcc0) return `${name} responds to traffic changes immediately — no significant delay.`;
      if (max === pcc15) return `${name} reacts to traffic changes with a ~15 minute delay. Plan capacity actions accordingly.`;
      if (max === pcc30) return `${name} has a ~30 minute lag behind traffic. Impact from traffic spikes won't show for about half an hour.`;
      return `${name} has a ~1 hour lag behind traffic. There's a significant delay before traffic changes impact ${name.toLowerCase()}.`;
    };
    const distDesc = (stat: typeof analytics.cpu, cv: number, name: string) => {
      const parts: string[] = [];
      if (cv > 0.3) parts.push(`${name} usage is highly variable (volatile)`);
      else parts.push(`${name} usage is relatively stable`);
      if (Math.abs(stat.skew) > 1) parts.push(`with frequent extreme spikes`);
      else if (Math.abs(stat.skew) > 0.5) parts.push(`with occasional spikes above average`);
      if (stat.p99 >= 90) parts.push(`. ⚠️ The top 1% of readings hit ${round(stat.p99)}% — dangerously close to full capacity`);
      else if (stat.p95 >= 80) parts.push(`. The top 5% of readings reach ${round(stat.p95)}% — approaching the warning zone`);
      return parts.join("") + ".";
    };
    return {
      correlation: {
        cpu: pccDesc(analytics.cpu.pcc, "CPU"),
        mem: pccDesc(analytics.mem.pcc, "Memory"),
        disk: pccDesc(analytics.disk.pcc, "Disk"),
      },
      rSquared: {
        cpu: r2Desc(analyticsExtras.cpu.rSquared, "CPU"),
        mem: r2Desc(analyticsExtras.mem.rSquared, "Memory"),
        disk: r2Desc(analyticsExtras.disk.rSquared, "Disk"),
      },
      elasticity: {
        cpu: elastDesc(analyticsExtras.cpu.elasticity, "CPU"),
        mem: elastDesc(analyticsExtras.mem.elasticity, "Memory"),
        disk: elastDesc(analyticsExtras.disk.elasticity, "Disk"),
      },
      lag: {
        cpu: lagDesc(analytics.cpu.pcc, analytics.cpu.lagPCC15m, analytics.cpu.lagPCC30m, analytics.cpu.lagPCC1h, "CPU"),
        mem: lagDesc(analytics.mem.pcc, analytics.mem.lagPCC15m, analytics.mem.lagPCC30m, analytics.mem.lagPCC1h, "Memory"),
        disk: lagDesc(analytics.disk.pcc, analytics.disk.lagPCC15m, analytics.disk.lagPCC30m, analytics.disk.lagPCC1h, "Disk"),
      },
      distribution: {
        traffic: distDesc(analytics.traffic as any, analyticsExtras.traffic.cv, "Traffic"),
        cpu: distDesc(analytics.cpu, analyticsExtras.cpu.cv, "CPU"),
        mem: distDesc(analytics.mem, analyticsExtras.mem.cv, "Memory"),
        disk: distDesc(analytics.disk, analyticsExtras.disk.cv, "Disk"),
      },
    };
  }, [analytics, analyticsExtras, metrics]);

  const cpuColumns = useMemo(() => [
    { id: "hostName", header: "Host Name", accessor: "Host Name" },
    { id: "pcc", header: "PCC", accessor: "PCC", columnType: "number" as const, thresholds: pccThresholds("PCC") },
    { id: "obsLow", header: "Observed CPU Low", accessor: "Observed CPU Low", columnType: "number" as const, thresholds: resourceThresholds("Observed CPU Low") },
    { id: "obsAvg", header: "Observed CPU Avg", accessor: "Observed CPU Avg", columnType: "number" as const, thresholds: resourceThresholds("Observed CPU Avg") },
    { id: "obsHigh", header: "Observed CPU High", accessor: "Observed CPU High", columnType: "number" as const, thresholds: resourceThresholds("Observed CPU High") },
    { id: "fcLow", header: "Forecast CPU Low", accessor: "Forecast CPU Low", columnType: "number" as const, thresholds: resourceThresholds("Forecast CPU Low") },
    { id: "fcAvg", header: "Forecast CPU Avg", accessor: "Forecast CPU Avg", columnType: "number" as const, thresholds: resourceThresholds("Forecast CPU Avg") },
    { id: "fcHigh", header: "Forecast CPU High", accessor: "Forecast CPU High", columnType: "number" as const, thresholds: resourceThresholds("Forecast CPU High") },
    { id: "prov", header: "Provisioning", accessor: "Provisioning", columnType: "number" as const, thresholds: PROVISIONING_THRESHOLDS },
  ], []);

  const memColumns = useMemo(() => [
    { id: "hostName", header: "Host Name", accessor: "Host Name" },
    { id: "pcc", header: "PCC", accessor: "PCC", columnType: "number" as const, thresholds: pccThresholds("PCC") },
    { id: "obsLow", header: "Observed MEM Low", accessor: "Observed MEM Low", columnType: "number" as const, thresholds: resourceThresholds("Observed MEM Low") },
    { id: "obsAvg", header: "Observed MEM Avg", accessor: "Observed MEM Avg", columnType: "number" as const, thresholds: resourceThresholds("Observed MEM Avg") },
    { id: "obsHigh", header: "Observed MEM High", accessor: "Observed MEM High", columnType: "number" as const, thresholds: resourceThresholds("Observed MEM High") },
    { id: "fcLow", header: "Forecast MEM Low", accessor: "Forecast MEM Low", columnType: "number" as const, thresholds: resourceThresholds("Forecast MEM Low") },
    { id: "fcAvg", header: "Forecast MEM Avg", accessor: "Forecast MEM Avg", columnType: "number" as const, thresholds: resourceThresholds("Forecast MEM Avg") },
    { id: "fcHigh", header: "Forecast MEM High", accessor: "Forecast MEM High", columnType: "number" as const, thresholds: resourceThresholds("Forecast MEM High") },
    { id: "prov", header: "Provisioning", accessor: "Provisioning", columnType: "number" as const, thresholds: PROVISIONING_THRESHOLDS },
  ], []);

  const diskColumns = useMemo(() => [
    { id: "hostName", header: "Host Name", accessor: "Host Name" },
    { id: "pcc", header: "PCC", accessor: "PCC", columnType: "number" as const, thresholds: pccThresholds("PCC") },
    { id: "obsLow", header: "Observed Disk Free Low", accessor: "Observed Disk Free Low", columnType: "number" as const, thresholds: resourceThresholds("Observed Disk Free Low") },
    { id: "obsAvg", header: "Observed Disk Free Avg", accessor: "Observed Disk Free Avg", columnType: "number" as const, thresholds: resourceThresholds("Observed Disk Free Avg") },
    { id: "obsHigh", header: "Observed Disk Free High", accessor: "Observed Disk Free High", columnType: "number" as const, thresholds: resourceThresholds("Observed Disk Free High") },
    { id: "fcLow", header: "Forecast Disk Free Low", accessor: "Forecast Disk Free Low", columnType: "number" as const, thresholds: resourceThresholds("Forecast Disk Free Low") },
    { id: "fcAvg", header: "Forecast Disk Free Avg", accessor: "Forecast Disk Free Avg", columnType: "number" as const, thresholds: resourceThresholds("Forecast Disk Free Avg") },
    { id: "fcHigh", header: "Forecast Disk Free High", accessor: "Forecast Disk Free High", columnType: "number" as const, thresholds: resourceThresholds("Forecast Disk Free High") },
    { id: "prov", header: "Provisioning", accessor: "Provisioning", columnType: "number" as const, thresholds: PROVISIONING_THRESHOLDS },
  ], []);

  return (
    <Flex flexDirection="column" gap={0}>
      {/* Filters - sticky at top */}
      <div style={{ position: "sticky", top: 0, zIndex: 10, background: "linear-gradient(180deg, rgba(20, 22, 38, 0.97) 0%, rgba(26, 26, 46, 0.95) 100%)", backdropFilter: "blur(12px)", padding: "12px 20px 10px 20px", borderBottom: "1px solid rgba(99, 130, 191, 0.15)", boxShadow: "0 4px 20px rgba(0, 0, 0, 0.3)" }}>
        <Flex flexDirection="column" gap={4} style={{ width: "100%" }}>
          <Strong style={{ textAlign: "center", letterSpacing: 0.5 }}>Traffic Percentage: {trafficChangePercent}</Strong>
        <input
          type="range"
          min={0}
          max={TRAFFIC_CHANGE_OPTIONS.length - 1}
          value={TRAFFIC_CHANGE_OPTIONS.indexOf(trafficChangePercent)}
          onChange={(e) => setTrafficChangePercent(TRAFFIC_CHANGE_OPTIONS[Number(e.target.value)])}
          style={{ width: "100%", cursor: "pointer" }}
        />
        <div style={{ position: "relative", width: "100%", height: 16 }}>
          {TRAFFIC_CHANGE_OPTIONS.map((v, i) => (
            <span key={v} style={{ position: "absolute", left: `${(i / (TRAFFIC_CHANGE_OPTIONS.length - 1)) * 100}%`, transform: "translateX(-50%)", fontSize: 10, color: v === trafficChangePercent ? "#4589ff" : "#aaa", fontWeight: v === trafficChangePercent ? 700 : 400, whiteSpace: "nowrap" }}>{v}</span>
          ))}
        </div>
        </Flex>
        <Flex gap={16} alignItems="flex-end" flexWrap="wrap" style={{ paddingTop: 8 }}>
        <Flex flexDirection="column" gap={4} style={{ width: 400, minWidth: 0, maxWidth: 400, flex: "0 0 400px" }}>
          <Strong>Host Group</Strong>
          <div style={{ maxWidth: 400, overflow: "hidden" }}>
            <Select<string, true>
              multiple
              value={selectedHostGroups}
              onChange={(val) => { setSelectedHostGroups(val ?? []); setSelectedHosts([]); }}
            >
              <Select.Filter />
              <Select.Content>
                {hostGroupOptions.map((g) => (
                  <Select.Option key={g} value={g}>{g}</Select.Option>
                ))}
              </Select.Content>
            </Select>
          </div>
        </Flex>
        <Flex flexDirection="column" gap={4} style={{ width: 600, minWidth: 0, maxWidth: 600, flex: "0 0 600px" }}>
          <Strong>Host</Strong>
          <div style={{ maxWidth: 600, overflow: "hidden" }}>
            <Select<string, true>
              multiple
              value={selectedHosts}
              onChange={(val) => setSelectedHosts(val ?? [])}
            >
              <Select.Filter />
              <Select.Content>
                {hostOptions.map((h) => (
                  <Select.Option key={h} value={h}>{h}</Select.Option>
                ))}
              </Select.Content>
            </Select>
          </div>
        </Flex>
        <div style={{ marginLeft: "auto", display: "flex", gap: 4, alignItems: "flex-end" }}>
          <Flex flexDirection="column" gap={4} style={{ minWidth: 140 }}>
            <Strong>Timeframe</Strong>
            <Select
              value={timeframeDays}
              onChange={(val) => { if (val != null) setTimeframeDays(val as number); }}
            >
              <Select.Content>
                {TIMEFRAME_OPTIONS.map((opt) => (
                  <Select.Option key={opt.value} value={opt.value}>{opt.label}</Select.Option>
                ))}
              </Select.Content>
            </Select>
          </Flex>
          <Button variant="default" onClick={() => setHelpOpen(true)}>
            <Button.Prefix><HelpIcon /></Button.Prefix>
          </Button>
          <Button variant="default" onClick={() => { setTempTopN(topN); setTempProvisionGoal(provisionGoal); setSettingsOpen(true); }}>
            <Button.Prefix><SettingIcon /></Button.Prefix>
          </Button>
        </div>
        </Flex>
      </div>

      <Flex flexDirection="column" padding={16} gap={16}>

      {/* Help Modal */}
      <Modal title="Traffic Analyzer — Help & Formulas" show={helpOpen} onDismiss={() => setHelpOpen(false)} size="large">
        <div style={{ padding: 16, maxHeight: "70vh", overflowY: "auto", fontSize: 13, lineHeight: 1.6 }}>
          <h3 style={{ marginTop: 0 }}>Overview</h3>
          <p>
            The Traffic Analyzer for Infrastructure correlates <strong>network traffic</strong> (measured via <code>dt.host.cpu.system</code>) with <strong>CPU</strong>, <strong>Memory</strong>, and <strong>Disk</strong> resource usage to forecast how infrastructure will respond to future traffic changes. Use the <strong>Traffic Percentage slider</strong> to simulate a traffic increase (e.g., +50%) and see how each resource is projected to respond.
          </p>

          <h3>Filters</h3>
          <ul>
            <li><strong>Traffic Percentage Slider</strong> — Simulates a traffic increase/decrease. All forecast values update dynamically.</li>
            <li><strong>Host Group</strong> — Filter hosts by host group. Selecting a group restricts the Host dropdown to hosts in that group.</li>
            <li><strong>Host</strong> — Select specific hosts to analyze. If none selected, all hosts (or hosts in the selected group) are included.</li>
            <li><strong>Timeframe</strong> — Analysis window (1–365 days). All metrics and tables use this time range.</li>
            <li><strong>Settings (⚙)</strong> — Configure Provisioning Goal (default {DEFAULT_PROVISION_GOAL}%) and Top N (max entities per table).</li>
          </ul>

          <h3>Key Concepts</h3>

          <h4>Observed Metrics</h4>
          <p>For each resource, the timeseries data is split at the median to compute:</p>
          <ul>
            <li><strong>Median (Average)</strong> = mean of all data points</li>
            <li><strong>Low Average</strong> = mean of data points below the median</li>
            <li><strong>High Average</strong> = mean of data points above the median</li>
            <li><strong>% Change</strong> = <code>100 × (HighAvg − LowAvg) / LowAvg</code></li>
          </ul>

          <h4>Pearson Correlation Coefficient (PCC)</h4>
          <p>Measures the linear relationship between Traffic and each resource (−1 to +1):</p>
          <p style={{ fontFamily: "monospace", background: "var(--dt-colors-background-surface-default)", padding: 8, borderRadius: 4 }}>
            PCC = (n·ΣXY − ΣX·ΣY) / √[(n·ΣX² − (ΣX)²) × (n·ΣY² − (ΣY)²)]
          </p>
          <p>Where X = resource values, Y = traffic values, n = number of data points.</p>
          <ul>
            <li><span style={{ color: "#00D26A" }}>■</span> PCC ≥ 0.5 — Strong correlation (green)</li>
            <li><span style={{ color: "#FCD53F" }}>■</span> 0.3 ≤ PCC &lt; 0.5 — Moderate correlation (yellow)</li>
            <li><span style={{ color: "#F8312F" }}>■</span> PCC &lt; 0.3 — Weak correlation (red)</li>
          </ul>

          <h4>Forecast Formula</h4>
          <p>Forecasts project resource usage at a given traffic increase, weighted by PCC:</p>
          <p style={{ fontFamily: "monospace", background: "var(--dt-colors-background-surface-default)", padding: 8, borderRadius: 4 }}>
            Ratio = Resource % Change / Traffic % Change<br/>
            Factor = 1 + (Traffic Slider % × PCC × Ratio) / 100<br/>
            Forecast Value = Observed Value × Factor
          </p>
          <p>The PCC weighting ensures resources with low traffic correlation are not over-projected.</p>

          <h4>Forecast % Change</h4>
          <p style={{ fontFamily: "monospace", background: "var(--dt-colors-background-surface-default)", padding: 8, borderRadius: 4 }}>
            Forecast % Change = 100 × (ForecastHigh − ObservedHigh) / ObservedHigh × PCC
          </p>

          <h4>Provisioning</h4>
          <p>How much headroom remains before the resource hits the {provisionGoal}% capacity goal (configurable in Settings):</p>
          <p style={{ fontFamily: "monospace", background: "var(--dt-colors-background-surface-default)", padding: 8, borderRadius: 4 }}>
            Provisioning = {provisionGoal}% − (Forecast High × PCC)
          </p>
          <ul>
            <li><span style={{ color: "#00D26A" }}>■</span> Provisioning ≥ 0 — Capacity available (green)</li>
            <li><span style={{ color: "#F8312F" }}>■</span> Provisioning &lt; 0 — Over capacity (red)</li>
          </ul>

          <h3>Tab Descriptions</h3>

          <h4>Overview</h4>
          <p><strong>Forecast High</strong> — Gauge charts showing forecasted high resource usage with provisioning headroom. <strong>Observed Traffic Analysis</strong> — Shows how observed traffic changes cascade to CPU, Memory, and Disk (weighted by PCC).</p>

          <h4>Forecast Breakdown</h4>
          <p>Horizontal bar charts comparing observed (blue) vs. forecasted (green) values for each resource. Threshold bands: green (0–80%), yellow (80–90%), red (90–100%).</p>

          <h4>Metrics — Observed / Forecast</h4>
          <p>Single-value tiles for all raw metrics: Low, Average, High, and % Change for Traffic, CPU, Memory, and Disk.</p>

          <h4>Top Impacted Entities (CPU / Memory / Disk)</h4>
          <p>Per-host tables sorted by PCC showing the most traffic-correlated hosts. Each row includes observed values, PCC, forecasted values, and provisioning headroom. Column colors use the same threshold rules.</p>

          <h3>Analytics Tab — Statistical Metrics</h3>

          <h4>R² (R-Squared)</h4>
          <p>The proportion of resource variance explained by traffic:</p>
          <p style={{ fontFamily: "monospace", background: "var(--dt-colors-background-surface-default)", padding: 8, borderRadius: 4 }}>
            R² = PCC²
          </p>
          <p>Example: PCC = 0.7 → R² = 0.49, meaning traffic explains 49% of the resource's variation.</p>

          <h4>Elasticity</h4>
          <p>How sensitive a resource is to traffic changes:</p>
          <p style={{ fontFamily: "monospace", background: "var(--dt-colors-background-surface-default)", padding: 8, borderRadius: 4 }}>
            Elasticity = Resource % Change / Traffic % Change
          </p>
          <ul>
            <li><span style={{ color: "#F8312F" }}>■</span> |Elasticity| &gt; 1 — Resource scales faster than traffic (bottleneck risk)</li>
            <li><span style={{ color: "#00D26A" }}>■</span> |Elasticity| ≤ 1 — Resource scales at or below traffic rate</li>
          </ul>

          <h4>Lag Correlation</h4>
          <p>PCC computed at time offsets (0, +15min, +30min, +1h) to detect delayed traffic impact. If lag PCC &gt; instant PCC, the resource responds to traffic with a delay.</p>
          <p style={{ fontFamily: "monospace", background: "var(--dt-colors-background-surface-default)", padding: 8, borderRadius: 4 }}>
            Lag PCC(offset) = PCC( resource[0..n-offset], traffic[offset..n] )
          </p>

          <h4>Percentiles (P95, P99)</h4>
          <p>The value below which 95% or 99% of data points fall. Better than averages for capacity planning because they capture peak behavior.</p>

          <h4>Standard Deviation (StdDev)</h4>
          <p>Measures the spread/volatility of values around the mean:</p>
          <p style={{ fontFamily: "monospace", background: "var(--dt-colors-background-surface-default)", padding: 8, borderRadius: 4 }}>
            σ = √[ Σ(xᵢ − μ)² / n ]
          </p>

          <h4>Coefficient of Variation (CV)</h4>
          <p>Normalized volatility — allows comparison across different scales:</p>
          <p style={{ fontFamily: "monospace", background: "var(--dt-colors-background-surface-default)", padding: 8, borderRadius: 4 }}>
            CV = StdDev / Mean
          </p>
          <ul>
            <li><span style={{ color: "#F8312F" }}>■</span> CV &gt; 0.3 — High variability (unstable, red)</li>
            <li><span style={{ color: "#00D26A" }}>■</span> CV ≤ 0.3 — Stable (green)</li>
          </ul>

          <h4>Skewness</h4>
          <p>Measures asymmetry of the distribution:</p>
          <p style={{ fontFamily: "monospace", background: "var(--dt-colors-background-surface-default)", padding: 8, borderRadius: 4 }}>
            Skew = Σ[(xᵢ − μ) / σ]³ / n
          </p>
          <ul>
            <li>Skew &gt; 0 — Right-skewed (occasional high spikes)</li>
            <li>Skew &lt; 0 — Left-skewed (occasional low dips)</li>
            <li><span style={{ color: "#F8312F" }}>■</span> |Skew| &gt; 1 — Highly skewed (red)</li>
            <li><span style={{ color: "#FCD53F" }}>■</span> 0.5 &lt; |Skew| ≤ 1 — Moderately skewed (yellow)</li>
            <li><span style={{ color: "#00D26A" }}>■</span> |Skew| ≤ 0.5 — Approximately symmetric (green)</li>
          </ul>

          <h3>Color Thresholds</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #555" }}>
                <th style={{ textAlign: "left", padding: 4 }}>Metric</th>
                <th style={{ textAlign: "left", padding: 4 }}><span style={{ color: "#00D26A" }}>Green</span></th>
                <th style={{ textAlign: "left", padding: 4 }}><span style={{ color: "#FCD53F" }}>Yellow</span></th>
                <th style={{ textAlign: "left", padding: 4 }}><span style={{ color: "#F8312F" }}>Red</span></th>
              </tr>
            </thead>
            <tbody>
              <tr><td style={{ padding: 4 }}>Resource Usage</td><td style={{ padding: 4 }}>&lt; 80%</td><td style={{ padding: 4 }}>80–90%</td><td style={{ padding: 4 }}>≥ 90%</td></tr>
              <tr><td style={{ padding: 4 }}>PCC</td><td style={{ padding: 4 }}>≥ 0.5</td><td style={{ padding: 4 }}>0.3–0.5</td><td style={{ padding: 4 }}>&lt; 0.3</td></tr>
              <tr><td style={{ padding: 4 }}>% Change</td><td style={{ padding: 4 }}>≤ 0%</td><td style={{ padding: 4 }}>0–5%</td><td style={{ padding: 4 }}>≥ 5%</td></tr>
              <tr><td style={{ padding: 4 }}>Provisioning</td><td style={{ padding: 4 }}>≥ 0</td><td style={{ padding: 4 }}>—</td><td style={{ padding: 4 }}>&lt; 0</td></tr>
            </tbody>
          </table>

          <h3>Data Sources</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #555" }}>
                <th style={{ textAlign: "left", padding: 4 }}>Label</th>
                <th style={{ textAlign: "left", padding: 4 }}>Metric Key</th>
              </tr>
            </thead>
            <tbody>
              <tr><td style={{ padding: 4 }}>Traffic</td><td style={{ padding: 4 }}><code>dt.host.cpu.system</code></td></tr>
              <tr><td style={{ padding: 4 }}>CPU</td><td style={{ padding: 4 }}><code>dt.host.cpu.usage</code></td></tr>
              <tr><td style={{ padding: 4 }}>Memory</td><td style={{ padding: 4 }}><code>dt.host.memory.usage</code></td></tr>
              <tr><td style={{ padding: 4 }}>Disk</td><td style={{ padding: 4 }}><code>dt.host.disk.free</code></td></tr>
            </tbody>
          </table>
        </div>
      </Modal>

      {/* Settings Modal */}
      <Modal title="Settings" show={settingsOpen} onDismiss={() => setSettingsOpen(false)} size="small"
        footer={
          <Flex justifyContent="flex-end" gap={8}>
            <Button variant="emphasized" onClick={handleSaveSettings}>Save</Button>
          </Flex>
        }
      >
        <Flex flexDirection="column" gap={16} padding={16}>
          <Flex flexDirection="column" gap={4}>
            <Strong>Provisioning Goal (%)</Strong>
            <NumberInput value={tempProvisionGoal} onChange={(val) => setTempProvisionGoal(val ?? DEFAULT_PROVISION_GOAL)} min={1} max={100} />
          </Flex>
          <Flex flexDirection="column" gap={4}>
            <Strong>Top N (entities per table)</Strong>
            <NumberInput value={tempTopN} onChange={(val) => setTempTopN(val ?? DEFAULT_TOP_N)} min={1} max={10000} />
          </Flex>
        </Flex>
      </Modal>

      {isLoading && <LoadingState />}

      <Tabs>
        {/* Tab 1: Overview */}
        <Tab title="Overview">
          <Flex flexDirection="column" gap={16} paddingTop={16}>
            <SectionHeader title="Forecast High" />
            <Flex gap={16} flexWrap="wrap">
              <Flex flexDirection="column" gap={8} style={{ flex: "1 1 300px", minWidth: 280 }}>
                <Heading level={6}>CPU</Heading>
                <Flex gap={8}>
                  <MetricCard label="% Change" value={cpuForecast.percentChange} unit="%" color={getChangeColor(cpuForecast.percentChange)} bordered style={{ flex: 1, maxWidth: "none", width: "auto" }} />
                  <MetricCard label="PCC" value={cpuPCC} color={getPccColor(cpuPCC)} bordered style={{ flex: 1, maxWidth: "none", width: "auto" }} />
                </Flex>
                <Flex gap={8} alignItems="stretch">
                  <div style={{ flex: 1, border: TILE_BORDER, borderRadius: 10, padding: 8, background: TILE_BG, boxShadow: TILE_SHADOW }}>
                    <GaugeChart value={round(cpuForecast.high)} max={100} unit="percent" height={180}>
                      <GaugeChart.Label>CPU</GaugeChart.Label>
                      <GaugeChart.ColorRule comparator="greater-or-equal" matchValue={0} color="#00D26A" />
                      <GaugeChart.ColorRule comparator="greater-or-equal" matchValue={80} color="#FCD53F" />
                      <GaugeChart.ColorRule comparator="greater-or-equal" matchValue={90} color="#F8312F" />
                      <GaugeChart.ThresholdIndicator value={80} showIndicator color="#FCD53F" />
                      <GaugeChart.ThresholdIndicator value={90} showIndicator color="#F8312F" />
                    </GaugeChart>
                  </div>
                  <div style={{ flex: 1, border: TILE_BORDER, borderRadius: 10, padding: 8, display: "flex", alignItems: "center", textAlign: "center", background: TILE_BG, boxShadow: TILE_SHADOW }}>
                    <div style={{ width: "100%", height: 80 }}>
                      <SingleValue data={round(cpuProvisioning)} label="CPU Provisioning" unit="%" color={getProvisioningColor(cpuProvisioning)} />
                    </div>
                  </div>
                </Flex>
              </Flex>
              <Flex flexDirection="column" gap={8} style={{ flex: "1 1 300px", minWidth: 280 }}>
                <Heading level={6}>Memory</Heading>
                <Flex gap={8}>
                  <MetricCard label="% Change" value={memForecast.percentChange} unit="%" color={getChangeColor(memForecast.percentChange)} bordered style={{ flex: 1, maxWidth: "none", width: "auto" }} />
                  <MetricCard label="PCC" value={memPCC} color={getPccColor(memPCC)} bordered style={{ flex: 1, maxWidth: "none", width: "auto" }} />
                </Flex>
                <Flex gap={8} alignItems="stretch">
                  <div style={{ flex: 1, border: TILE_BORDER, borderRadius: 10, padding: 8, background: TILE_BG, boxShadow: TILE_SHADOW }}>
                    <GaugeChart value={round(memForecast.high * memPCC)} max={100} unit="percent" height={180}>
                      <GaugeChart.Label>Memory</GaugeChart.Label>
                      <GaugeChart.ColorRule comparator="greater-or-equal" matchValue={0} color="#00D26A" />
                      <GaugeChart.ColorRule comparator="greater-or-equal" matchValue={80} color="#FCD53F" />
                      <GaugeChart.ColorRule comparator="greater-or-equal" matchValue={90} color="#F8312F" />
                      <GaugeChart.ThresholdIndicator value={80} showIndicator color="#FCD53F" />
                      <GaugeChart.ThresholdIndicator value={90} showIndicator color="#F8312F" />
                    </GaugeChart>
                  </div>
                  <div style={{ flex: 1, border: TILE_BORDER, borderRadius: 10, padding: 8, display: "flex", alignItems: "center", textAlign: "center", background: TILE_BG, boxShadow: TILE_SHADOW }}>
                    <div style={{ width: "100%", height: 80 }}>
                      <SingleValue data={round(memProvisioning)} label="Memory Provisioning" unit="%" color={getProvisioningColor(memProvisioning)} />
                    </div>
                  </div>
                </Flex>
              </Flex>
              <Flex flexDirection="column" gap={8} style={{ flex: "1 1 300px", minWidth: 280 }}>
                <Heading level={6}>Disk Free</Heading>
                <Flex gap={8}>
                  <MetricCard label="% Change" value={diskForecast.percentChange} unit="%" color={getChangeColor(diskForecast.percentChange)} bordered style={{ flex: 1, maxWidth: "none", width: "auto" }} />
                  <MetricCard label="PCC" value={diskPCC} color={getPccColor(diskPCC)} bordered style={{ flex: 1, maxWidth: "none", width: "auto" }} />
                </Flex>
                <Flex gap={8} alignItems="stretch">
                  <div style={{ flex: 1, border: TILE_BORDER, borderRadius: 10, padding: 8, background: TILE_BG, boxShadow: TILE_SHADOW }}>
                    <GaugeChart value={round(diskForecast.high * diskPCC)} max={100} unit="percent" height={180}>
                      <GaugeChart.Label>Disk Free</GaugeChart.Label>
                      <GaugeChart.ColorRule comparator="greater-or-equal" matchValue={0} color="#00D26A" />
                      <GaugeChart.ColorRule comparator="greater-or-equal" matchValue={80} color="#FCD53F" />
                      <GaugeChart.ColorRule comparator="greater-or-equal" matchValue={90} color="#F8312F" />
                      <GaugeChart.ThresholdIndicator value={80} showIndicator color="#FCD53F" />
                      <GaugeChart.ThresholdIndicator value={90} showIndicator color="#F8312F" />
                    </GaugeChart>
                  </div>
                  <div style={{ flex: 1, border: TILE_BORDER, borderRadius: 10, padding: 8, display: "flex", alignItems: "center", textAlign: "center", background: TILE_BG, boxShadow: TILE_SHADOW }}>
                    <div style={{ width: "100%", height: 80 }}>
                      <SingleValue data={round(diskProvisioning)} label="Disk Provisioning" unit="%" color={getProvisioningColor(diskProvisioning)} />
                    </div>
                  </div>
                </Flex>
              </Flex>
            </Flex>

            <SectionHeader title="Observed Traffic Analysis" />
            <Flex gap={8} alignItems="center" style={{ width: "100%" }}>
              <MetricCard label="Traffic Change" value={traffic.change} unit="%" color={getChangeColor(traffic.change)} bordered style={{ flex: 1, maxWidth: "none" }} />
              <ArrowRight />
              <MetricCard label="CPU Change" value={cpu.change * cpuPCC} unit="%" color={getChangeColor(cpu.change * cpuPCC)} bordered style={{ flex: 1, maxWidth: "none" }} />
              <MetricCard label="Memory Change" value={memory.change * memPCC} unit="%" color={getChangeColor(memory.change * memPCC)} bordered style={{ flex: 1, maxWidth: "none" }} />
              <MetricCard label="Disk Free Change" value={disk.change * diskPCC} unit="%" color={getChangeColor(disk.change * diskPCC)} bordered style={{ flex: 1, maxWidth: "none" }} />
            </Flex>
            <SectionHeader title={"\u00A0"} />
          </Flex>
        </Tab>

        {/* Tab 2: Forecast Breakdown */}
        <Tab title="Forecast Breakdown">
          <Flex flexDirection="column" gap={16} paddingTop={16}>
            <Heading level={6}>CPU Observed (Blue) vs Forecast (Green)</Heading>
            <CategoricalBarChart data={cpuBarData} height={250} layout="horizontal">
              <CategoricalBarChart.Legend hidden />
              <CategoricalBarChart.ValueAxis label="%" max={100} />
              <CategoricalBarChart.ThresholdIndicator data={{ min: 0, max: 80 }} color="#00D26A" />
              <CategoricalBarChart.ThresholdIndicator data={{ min: 80, max: 90 }} color="#FCD53F" />
              <CategoricalBarChart.ThresholdIndicator data={{ min: 90, max: 100 }} color="#F8312F" />
            </CategoricalBarChart>

            <Heading level={6}>Memory Observed (Blue) vs Forecast (Green)</Heading>
            <CategoricalBarChart data={memBarData} height={250} layout="horizontal">
              <CategoricalBarChart.Legend hidden />
              <CategoricalBarChart.ValueAxis label="%" max={100} />
              <CategoricalBarChart.ThresholdIndicator data={{ min: 0, max: 80 }} color="#00D26A" />
              <CategoricalBarChart.ThresholdIndicator data={{ min: 80, max: 90 }} color="#FCD53F" />
              <CategoricalBarChart.ThresholdIndicator data={{ min: 90, max: 100 }} color="#F8312F" />
            </CategoricalBarChart>

            <Heading level={6}>Disk Free Observed (Blue) vs Forecast (Green)</Heading>
            <CategoricalBarChart data={diskBarData} height={250} layout="horizontal">
              <CategoricalBarChart.Legend hidden />
              <CategoricalBarChart.ValueAxis label="%" max={100} />
              <CategoricalBarChart.ThresholdIndicator data={{ min: 0, max: 80 }} color="#00D26A" />
              <CategoricalBarChart.ThresholdIndicator data={{ min: 80, max: 90 }} color="#FCD53F" />
              <CategoricalBarChart.ThresholdIndicator data={{ min: 90, max: 100 }} color="#F8312F" />
            </CategoricalBarChart>
          </Flex>
        </Tab>

        {/* Tab 3: Metrics - Observed */}
        <Tab title="Metrics - Observed">
          <Flex flexDirection="column" gap={16} paddingTop={16}>
            <Heading level={6}>Traffic</Heading>
            <Flex gap={8} flexWrap="wrap">
              <MetricCard label="Low Traffic Average" value={traffic.low} color="#134FC9" bordered style={{ flex: 1, maxWidth: "none" }} />
              <MetricCard label="Traffic Average" value={traffic.median} color="#134FC9" bordered style={{ flex: 1, maxWidth: "none" }} />
              <MetricCard label="High Traffic Average" value={traffic.high} color="#134FC9" bordered style={{ flex: 1, maxWidth: "none" }} />
              <MetricCard label="Traffic Change" value={traffic.change} unit="%" color={getChangeColor(traffic.change)} bordered style={{ flex: 1, maxWidth: "none" }} />
            </Flex>
            <Heading level={6}>CPU</Heading>
            <Flex gap={8} flexWrap="wrap">
              <MetricCard label="CPU Low" value={cpu.low} unit="%" color={getResourceColor(cpu.low)} bordered style={{ flex: 1, maxWidth: "none" }} />
              <MetricCard label="CPU Avg" value={cpu.avg} unit="%" color={getResourceColor(cpu.avg)} bordered style={{ flex: 1, maxWidth: "none" }} />
              <MetricCard label="CPU High" value={cpu.high} unit="%" color={getResourceColor(cpu.high)} bordered style={{ flex: 1, maxWidth: "none" }} />
              <MetricCard label="CPU Change" value={cpu.change} unit="%" color={getChangeColor(cpu.change)} bordered style={{ flex: 1, maxWidth: "none" }} />
            </Flex>
            <Heading level={6}>Memory</Heading>
            <Flex gap={8} flexWrap="wrap">
              <MetricCard label="Memory Low" value={memory.low} unit="%" color={getResourceColor(memory.low)} bordered style={{ flex: 1, maxWidth: "none" }} />
              <MetricCard label="Memory Avg" value={memory.avg} unit="%" color={getResourceColor(memory.avg)} bordered style={{ flex: 1, maxWidth: "none" }} />
              <MetricCard label="Memory High" value={memory.high} unit="%" color={getResourceColor(memory.high)} bordered style={{ flex: 1, maxWidth: "none" }} />
              <MetricCard label="Memory Change" value={memory.change} unit="%" color={getChangeColor(memory.change)} bordered style={{ flex: 1, maxWidth: "none" }} />
            </Flex>
            <Heading level={6}>Disk Free</Heading>
            <Flex gap={8} flexWrap="wrap">
              <MetricCard label="Disk Free Low" value={disk.low} unit="%" color={getResourceColor(disk.low)} bordered style={{ flex: 1, maxWidth: "none" }} />
              <MetricCard label="Disk Free Avg" value={disk.avg} unit="%" color={getResourceColor(disk.avg)} bordered style={{ flex: 1, maxWidth: "none" }} />
              <MetricCard label="Disk Free High" value={disk.high} unit="%" color={getResourceColor(disk.high)} bordered style={{ flex: 1, maxWidth: "none" }} />
              <MetricCard label="Disk Free Change" value={disk.change} unit="%" color={getChangeColor(disk.change)} bordered style={{ flex: 1, maxWidth: "none" }} />
            </Flex>
          </Flex>
        </Tab>

        {/* Tab 4: Metrics - Forecast */}
        <Tab title="Metrics - Forecast">
          <Flex flexDirection="column" gap={16} paddingTop={16}>
            <Heading level={6}>Traffic</Heading>
            <Flex gap={8} flexWrap="wrap">
              <MetricCard label="Traffic Average" value={traffic.median + traffic.median * (trafficChangePercent / 100)} color="#134FC9" bordered style={{ flex: 1, maxWidth: "none" }} />
              <MetricCard label="Traffic Change" value={traffic.median * (trafficChangePercent / 100)} color="#134FC9" bordered style={{ flex: 1, maxWidth: "none" }} />
              <MetricCard label="Traffic Change %" value={trafficChangePercent} unit="%" color="#134FC9" bordered style={{ flex: 1, maxWidth: "none" }} />
            </Flex>
            <Heading level={6}>CPU</Heading>
            <Flex gap={8} flexWrap="wrap">
              <MetricCard label="CPU Low" value={cpuForecast.low} unit="%" color={getResourceColor(cpuForecast.low)} bordered style={{ flex: 1, maxWidth: "none" }} />
              <MetricCard label="CPU Avg" value={cpuForecast.avg} unit="%" color={getResourceColor(cpuForecast.avg)} bordered style={{ flex: 1, maxWidth: "none" }} />
              <MetricCard label="CPU High" value={cpuForecast.high} unit="%" color={getResourceColor(cpuForecast.high)} bordered style={{ flex: 1, maxWidth: "none" }} />
              <MetricCard label="% Change (High)" value={cpuForecast.percentChange} unit="%" color={getChangeColor(cpuForecast.percentChange)} bordered style={{ flex: 1, maxWidth: "none" }} />
            </Flex>
            <Heading level={6}>Memory</Heading>
            <Flex gap={8} flexWrap="wrap">
              <MetricCard label="Memory Low" value={memForecast.low} unit="%" color={getResourceColor(memForecast.low)} bordered style={{ flex: 1, maxWidth: "none" }} />
              <MetricCard label="Memory Avg" value={memForecast.avg} unit="%" color={getResourceColor(memForecast.avg)} bordered style={{ flex: 1, maxWidth: "none" }} />
              <MetricCard label="Memory High" value={memForecast.high} unit="%" color={getResourceColor(memForecast.high)} bordered style={{ flex: 1, maxWidth: "none" }} />
              <MetricCard label="% Change (High)" value={memForecast.percentChange} unit="%" color={getChangeColor(memForecast.percentChange)} bordered style={{ flex: 1, maxWidth: "none" }} />
            </Flex>
            <Heading level={6}>Disk Free</Heading>
            <Flex gap={8} flexWrap="wrap">
              <MetricCard label="Disk Free Low" value={diskForecast.low} unit="%" color={getResourceColor(diskForecast.low)} bordered style={{ flex: 1, maxWidth: "none" }} />
              <MetricCard label="Disk Free Avg" value={diskForecast.avg} unit="%" color={getResourceColor(diskForecast.avg)} bordered style={{ flex: 1, maxWidth: "none" }} />
              <MetricCard label="Disk Free High" value={diskForecast.high} unit="%" color={getResourceColor(diskForecast.high)} bordered style={{ flex: 1, maxWidth: "none" }} />
              <MetricCard label="% Change (High)" value={diskForecast.percentChange} unit="%" color={getChangeColor(diskForecast.percentChange)} bordered style={{ flex: 1, maxWidth: "none" }} />
            </Flex>
          </Flex>
        </Tab>

        {/* Tab 4: Top Impacted Entities - CPU */}
        <Tab title="Top Impacted Entities - CPU">
          <Flex flexDirection="column" gap={16} paddingTop={16}>
            <Heading level={6}>CPU % by Host - Top {topN} (sorted by Pearson Correlation)</Heading>
            {cpuByHost.isLoading ? <LoadingState /> : (
              <DataTable data={cpuTableData} columns={cpuColumns} sortable resizable columnSizing={cpuColSizing} onColumnSizingChange={setCpuColSizing}>
                <DataTable.Pagination defaultPageSize={10} />
              </DataTable>
            )}
          </Flex>
        </Tab>

        {/* Tab 5: Top Impacted Entities - Memory */}
        <Tab title="Top Impacted Entities - Memory">
          <Flex flexDirection="column" gap={16} paddingTop={16}>
            <Heading level={6}>Memory % by Host - Top {topN} (sorted by Pearson Correlation)</Heading>
            {memByHost.isLoading ? <LoadingState /> : (
              <DataTable data={memTableData} columns={memColumns} sortable resizable columnSizing={memColSizing} onColumnSizingChange={setMemColSizing}>
                <DataTable.Pagination defaultPageSize={10} />
              </DataTable>
            )}
          </Flex>
        </Tab>

        {/* Tab 6: Top Impacted Entities - Disk */}
        <Tab title="Top Impacted Entities - Disk">
          <Flex flexDirection="column" gap={16} paddingTop={16}>
            <Heading level={6}>Disk Free % by Host - Top {topN} (sorted by Pearson Correlation)</Heading>
            {diskByHost.isLoading ? <LoadingState /> : (
              <DataTable data={diskTableData} columns={diskColumns} sortable resizable columnSizing={diskColSizing} onColumnSizingChange={setDiskColSizing}>
                <DataTable.Pagination defaultPageSize={10} />
              </DataTable>
            )}
          </Flex>
        </Tab>

        {/* Tab 7: Analytics */}
        <Tab title="Analytics">
          <Flex flexDirection="column" gap={16} paddingTop={16}>
            {analyticsResult.isLoading ? <LoadingState /> : !analytics || !analyticsExtras ? (
              <Flex justifyContent="center" padding={32}><Strong>No analytics data available</Strong></Flex>
            ) : (
              <>
                {/* Correlation Analysis */}
                <SectionHeader title="Correlation Analysis — Traffic vs Resources" />
                <Heading level={6}>Pearson Correlation Coefficient (PCC)</Heading>
                <Flex gap={8} flexWrap="wrap">
                  <MetricCard label="CPU PCC" value={analytics.cpu.pcc} color={analytics.cpu.pcc >= 0.5 ? GREEN : analytics.cpu.pcc >= 0.3 ? YELLOW : RED} bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="Memory PCC" value={analytics.mem.pcc} color={analytics.mem.pcc >= 0.5 ? GREEN : analytics.mem.pcc >= 0.3 ? YELLOW : RED} bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="Disk PCC" value={analytics.disk.pcc} color={analytics.disk.pcc >= 0.5 ? GREEN : analytics.disk.pcc >= 0.3 ? YELLOW : RED} bordered style={{ flex: 1, maxWidth: "none" }} />
                </Flex>
                {execSummaries && (
                  <InsightBox>
                    <strong>What this means:</strong> PCC measures how closely each resource moves with traffic (0 = no relationship, 1 = moves in lockstep).
                    <ul style={{ margin: "6px 0 0 0", paddingLeft: 20 }}>
                      <li>{execSummaries.correlation.cpu}</li>
                      <li>{execSummaries.correlation.mem}</li>
                      <li>{execSummaries.correlation.disk}</li>
                    </ul>
                  </InsightBox>
                )}

                <Heading level={6}>R² — Variance Explained by Traffic</Heading>
                <Flex gap={8} flexWrap="wrap">
                  <MetricCard label="CPU R²" value={analyticsExtras.cpu.rSquared} color={analyticsExtras.cpu.rSquared >= 0.5 ? GREEN : analyticsExtras.cpu.rSquared >= 0.25 ? YELLOW : RED} bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="Memory R²" value={analyticsExtras.mem.rSquared} color={analyticsExtras.mem.rSquared >= 0.5 ? GREEN : analyticsExtras.mem.rSquared >= 0.25 ? YELLOW : RED} bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="Disk R²" value={analyticsExtras.disk.rSquared} color={analyticsExtras.disk.rSquared >= 0.5 ? GREEN : analyticsExtras.disk.rSquared >= 0.25 ? YELLOW : RED} bordered style={{ flex: 1, maxWidth: "none" }} />
                </Flex>
                {execSummaries && (
                  <InsightBox>
                    <strong>What this means:</strong> R² tells you what percentage of a resource's ups and downs can be attributed to traffic.
                    <ul style={{ margin: "6px 0 0 0", paddingLeft: 20 }}>
                      <li>{execSummaries.rSquared.cpu}</li>
                      <li>{execSummaries.rSquared.mem}</li>
                      <li>{execSummaries.rSquared.disk}</li>
                    </ul>
                  </InsightBox>
                )}

                <Heading level={6}>Elasticity — Resource Sensitivity to Traffic</Heading>
                <Flex gap={8} flexWrap="wrap">
                  <MetricCard label="CPU Elasticity" value={analyticsExtras.cpu.elasticity} color={Math.abs(analyticsExtras.cpu.elasticity) > 1 ? RED : GREEN} bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="Memory Elasticity" value={analyticsExtras.mem.elasticity} color={Math.abs(analyticsExtras.mem.elasticity) > 1 ? RED : GREEN} bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="Disk Elasticity" value={analyticsExtras.disk.elasticity} color={Math.abs(analyticsExtras.disk.elasticity) > 1 ? RED : GREEN} bordered style={{ flex: 1, maxWidth: "none" }} />
                </Flex>
                {execSummaries && (
                  <InsightBox>
                    <strong>What this means:</strong> Elasticity shows how much a resource amplifies traffic changes. A value of 2× means the resource grows twice as fast as traffic.
                    <ul style={{ margin: "6px 0 0 0", paddingLeft: 20 }}>
                      <li>{execSummaries.elasticity.cpu}</li>
                      <li>{execSummaries.elasticity.mem}</li>
                      <li>{execSummaries.elasticity.disk}</li>
                    </ul>
                  </InsightBox>
                )}

                {/* Lag Correlation */}
                <SectionHeader title="Lag Correlation — Delayed Traffic Impact" />
                <Heading level={6}>CPU — PCC at Time Offsets</Heading>
                <Flex gap={8} flexWrap="wrap">
                  <MetricCard label="No Lag (0m)" value={analytics.cpu.pcc} color={BLUE} bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="Lag +15min" value={analytics.cpu.lagPCC15m} color="#4589FF" bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="Lag +30min" value={analytics.cpu.lagPCC30m} color="#78A9FF" bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="Lag +1h" value={analytics.cpu.lagPCC1h} color="#A6C8FF" bordered style={{ flex: 1, maxWidth: "none" }} />
                </Flex>
                <Heading level={6}>Memory — PCC at Time Offsets</Heading>
                <Flex gap={8} flexWrap="wrap">
                  <MetricCard label="No Lag (0m)" value={analytics.mem.pcc} color={BLUE} bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="Lag +15min" value={analytics.mem.lagPCC15m} color="#4589FF" bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="Lag +30min" value={analytics.mem.lagPCC30m} color="#78A9FF" bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="Lag +1h" value={analytics.mem.lagPCC1h} color="#A6C8FF" bordered style={{ flex: 1, maxWidth: "none" }} />
                </Flex>
                <Heading level={6}>Disk — PCC at Time Offsets</Heading>
                <Flex gap={8} flexWrap="wrap">
                  <MetricCard label="No Lag (0m)" value={analytics.disk.pcc} color={BLUE} bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="Lag +15min" value={analytics.disk.lagPCC15m} color="#4589FF" bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="Lag +30min" value={analytics.disk.lagPCC30m} color="#78A9FF" bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="Lag +1h" value={analytics.disk.lagPCC1h} color="#A6C8FF" bordered style={{ flex: 1, maxWidth: "none" }} />
                </Flex>
                {execSummaries && (
                  <InsightBox>
                    <strong>What this means:</strong> Lag correlation tells you how quickly each resource reacts to traffic changes. Sometimes impact isn't immediate — it shows up minutes or hours later.
                    <ul style={{ margin: "6px 0 0 0", paddingLeft: 20 }}>
                      <li>{execSummaries.lag.cpu}</li>
                      <li>{execSummaries.lag.mem}</li>
                      <li>{execSummaries.lag.disk}</li>
                    </ul>
                  </InsightBox>
                )}

                {/* Distribution */}
                <SectionHeader title="Distribution — Percentiles & Variability" />
                <Heading level={6}>Traffic</Heading>
                <Flex gap={8} flexWrap="wrap">
                  <MetricCard label="Min" value={analytics.traffic.min} color={BLUE} bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="P95" value={analytics.traffic.p95} color={BLUE} bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="P99" value={analytics.traffic.p99} color={BLUE} bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="Max" value={analytics.traffic.max} color={BLUE} bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="Std Dev" value={analytics.traffic.stdDev} color={BLUE} bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="CV" value={analyticsExtras.traffic.cv} color={analyticsExtras.traffic.cv > 0.3 ? RED : GREEN} bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="Skewness" value={analytics.traffic.skew} color={Math.abs(analytics.traffic.skew) > 1 ? RED : Math.abs(analytics.traffic.skew) > 0.5 ? YELLOW : GREEN} bordered style={{ flex: 1, maxWidth: "none" }} />
                </Flex>
                {execSummaries && <InsightBox>{execSummaries.distribution.traffic}</InsightBox>}
                <Heading level={6}>CPU</Heading>
                <Flex gap={8} flexWrap="wrap">
                  <MetricCard label="Min" value={analytics.cpu.min} unit="%" color={BLUE} bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="P95" value={analytics.cpu.p95} unit="%" color={analytics.cpu.p95 >= 90 ? RED : analytics.cpu.p95 >= 80 ? YELLOW : GREEN} bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="P99" value={analytics.cpu.p99} unit="%" color={analytics.cpu.p99 >= 90 ? RED : analytics.cpu.p99 >= 80 ? YELLOW : GREEN} bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="Max" value={analytics.cpu.max} unit="%" color={analytics.cpu.max >= 90 ? RED : analytics.cpu.max >= 80 ? YELLOW : GREEN} bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="Std Dev" value={analytics.cpu.stdDev} color={BLUE} bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="CV" value={analyticsExtras.cpu.cv} color={analyticsExtras.cpu.cv > 0.3 ? RED : GREEN} bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="Skewness" value={analytics.cpu.skew} color={Math.abs(analytics.cpu.skew) > 1 ? RED : Math.abs(analytics.cpu.skew) > 0.5 ? YELLOW : GREEN} bordered style={{ flex: 1, maxWidth: "none" }} />
                </Flex>
                {execSummaries && <InsightBox>{execSummaries.distribution.cpu}</InsightBox>}
                <Heading level={6}>Memory</Heading>
                <Flex gap={8} flexWrap="wrap">
                  <MetricCard label="Min" value={analytics.mem.min} unit="%" color={BLUE} bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="P95" value={analytics.mem.p95} unit="%" color={analytics.mem.p95 >= 90 ? RED : analytics.mem.p95 >= 80 ? YELLOW : GREEN} bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="P99" value={analytics.mem.p99} unit="%" color={analytics.mem.p99 >= 90 ? RED : analytics.mem.p99 >= 80 ? YELLOW : GREEN} bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="Max" value={analytics.mem.max} unit="%" color={analytics.mem.max >= 90 ? RED : analytics.mem.max >= 80 ? YELLOW : GREEN} bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="Std Dev" value={analytics.mem.stdDev} color={BLUE} bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="CV" value={analyticsExtras.mem.cv} color={analyticsExtras.mem.cv > 0.3 ? RED : GREEN} bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="Skewness" value={analytics.mem.skew} color={Math.abs(analytics.mem.skew) > 1 ? RED : Math.abs(analytics.mem.skew) > 0.5 ? YELLOW : GREEN} bordered style={{ flex: 1, maxWidth: "none" }} />
                </Flex>
                {execSummaries && <InsightBox>{execSummaries.distribution.mem}</InsightBox>}
                <Heading level={6}>Disk Free</Heading>
                <Flex gap={8} flexWrap="wrap">
                  <MetricCard label="Min" value={analytics.disk.min} unit="%" color={BLUE} bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="P95" value={analytics.disk.p95} unit="%" color={analytics.disk.p95 >= 90 ? RED : analytics.disk.p95 >= 80 ? YELLOW : GREEN} bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="P99" value={analytics.disk.p99} unit="%" color={analytics.disk.p99 >= 90 ? RED : analytics.disk.p99 >= 80 ? YELLOW : GREEN} bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="Max" value={analytics.disk.max} unit="%" color={analytics.disk.max >= 90 ? RED : analytics.disk.max >= 80 ? YELLOW : GREEN} bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="Std Dev" value={analytics.disk.stdDev} color={BLUE} bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="CV" value={analyticsExtras.disk.cv} color={analyticsExtras.disk.cv > 0.3 ? RED : GREEN} bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="Skewness" value={analytics.disk.skew} color={Math.abs(analytics.disk.skew) > 1 ? RED : Math.abs(analytics.disk.skew) > 0.5 ? YELLOW : GREEN} bordered style={{ flex: 1, maxWidth: "none" }} />
                </Flex>
                {execSummaries && <InsightBox>{execSummaries.distribution.disk}</InsightBox>}
                <SectionHeader title={"\u00A0"} />
              </>
            )}
          </Flex>
        </Tab>

        {/* ═══════════════════════ SATURATION COUNTDOWN ═══════════════════════ */}
        <Tab title="Saturation Countdown">
          <Flex flexDirection="column" gap={16} paddingTop={16}>
            <SectionHeader title={`Days Until Resources Hit ${provisionGoal}% Capacity`} />
            <InsightBox>
              <strong>How to read this:</strong> Based on the current growth trend over the last {timeframeDays} days, this estimates how many days until each resource reaches your {provisionGoal}% provisioning goal. Hosts appearing at the top with low day counts need attention soonest. "—" means the resource is not trending toward saturation.
            </InsightBox>
            {!saturationData.length ? (
              <Flex justifyContent="center" padding={32}><Strong>No host data available</Strong></Flex>
            ) : (
              <>
                <Flex gap={16} flexWrap="wrap">
                  <div style={{ flex: "1 1 200px", border: TILE_BORDER, borderRadius: 10, padding: 16, background: TILE_BG, boxShadow: TILE_SHADOW, textAlign: "center" }}>
                    <div style={{ fontSize: 12, color: "#8899bb" }}>Hosts At Risk (≤30d)</div>
                    <div style={{ fontSize: 32, fontWeight: 700, color: RED }}>{saturationData.filter((r) => typeof r._minDays === "number" && r._minDays <= 30).length}</div>
                  </div>
                  <div style={{ flex: "1 1 200px", border: TILE_BORDER, borderRadius: 10, padding: 16, background: TILE_BG, boxShadow: TILE_SHADOW, textAlign: "center" }}>
                    <div style={{ fontSize: 12, color: "#8899bb" }}>Warning (31–90d)</div>
                    <div style={{ fontSize: 32, fontWeight: 700, color: YELLOW }}>{saturationData.filter((r) => typeof r._minDays === "number" && r._minDays > 30 && r._minDays <= 90).length}</div>
                  </div>
                  <div style={{ flex: "1 1 200px", border: TILE_BORDER, borderRadius: 10, padding: 16, background: TILE_BG, boxShadow: TILE_SHADOW, textAlign: "center" }}>
                    <div style={{ fontSize: 12, color: "#8899bb" }}>Healthy (90+d or Stable)</div>
                    <div style={{ fontSize: 32, fontWeight: 700, color: GREEN }}>{saturationData.filter((r) => r._minDays === Infinity || (typeof r._minDays === "number" && r._minDays > 90)).length}</div>
                  </div>
                </Flex>
                <DataTable
                  data={saturationData.map(({ _minDays, ...rest }) => rest)}
                  columns={[
                    { id: "host", header: "Host Name", accessor: "Host Name" },
                    { id: "cpuCurr", header: "CPU Current (%)", accessor: "CPU Current (%)", columnType: "number" as const, thresholds: resourceThresholds("CPU Current (%)") },
                    { id: "cpuDays", header: "CPU Days to Sat.", accessor: "CPU Days to Saturation" },
                    { id: "memCurr", header: "MEM Current (%)", accessor: "MEM Current (%)", columnType: "number" as const, thresholds: resourceThresholds("MEM Current (%)") },
                    { id: "memDays", header: "MEM Days to Sat.", accessor: "MEM Days to Saturation" },
                    { id: "diskCurr", header: "Disk Current (%)", accessor: "Disk Current (%)", columnType: "number" as const, thresholds: resourceThresholds("Disk Current (%)") },
                    { id: "diskDays", header: "Disk Days to Sat.", accessor: "Disk Days to Saturation" },
                    { id: "earliest", header: "Earliest Saturation", accessor: "Earliest Saturation" },
                  ]}
                  sortable resizable
                >
                  <DataTable.Pagination defaultPageSize={15} />
                </DataTable>
              </>
            )}
          </Flex>
        </Tab>

        {/* ═══════════════════════ WHAT-IF SCENARIOS ═══════════════════════ */}
        <Tab title="What-If Scenarios">
          <Flex flexDirection="column" gap={16} paddingTop={16}>
            <SectionHeader title="Compare Multiple Traffic Scenarios Side-by-Side" />
            <InsightBox>
              <strong>How to use:</strong> Define different traffic growth scenarios (e.g., "Holiday Peak" at 300%, "Normal Growth" at 110%) and compare their impact on all resources simultaneously. This helps you plan for best-case, expected, and worst-case outcomes.
            </InsightBox>
            <Flex gap={8} alignItems="flex-end" flexWrap="wrap">
              <Flex flexDirection="column" gap={4} style={{ flex: "1 1 200px" }}>
                <Strong>Scenario Name</Strong>
                <input value={newScenarioName} onChange={(e) => setNewScenarioName(e.target.value)} placeholder="e.g. Holiday Peak" style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid rgba(99,130,191,0.3)", background: "rgba(30,35,55,0.7)", color: "#d0d4e0", fontSize: 13 }} />
              </Flex>
              <Flex flexDirection="column" gap={4} style={{ flex: "0 0 160px" }}>
                <Strong>Traffic %</Strong>
                <NumberInput value={newScenarioPercent} onChange={(val) => setNewScenarioPercent(val ?? 100)} min={0} max={5000} />
              </Flex>
              <Button variant="emphasized" onClick={addScenario}>Add Scenario</Button>
            </Flex>
            {scenarioResults.length > 0 && (
              <DataTable
                data={scenarioResults}
                columns={[
                  { id: "name", header: "Scenario", accessor: "Scenario" },
                  { id: "traffic", header: "Traffic %", accessor: "Traffic %", columnType: "number" as const },
                  { id: "cpuH", header: "CPU High", accessor: "CPU High", columnType: "number" as const, thresholds: resourceThresholds("CPU High") },
                  { id: "cpuP", header: "CPU Prov.", accessor: "CPU Prov.", columnType: "number" as const, thresholds: PROVISIONING_THRESHOLDS },
                  { id: "memH", header: "MEM High", accessor: "MEM High", columnType: "number" as const, thresholds: resourceThresholds("MEM High") },
                  { id: "memP", header: "MEM Prov.", accessor: "MEM Prov.", columnType: "number" as const, thresholds: PROVISIONING_THRESHOLDS },
                  { id: "diskH", header: "Disk High", accessor: "Disk High", columnType: "number" as const, thresholds: resourceThresholds("Disk High") },
                  { id: "diskP", header: "Disk Prov.", accessor: "Disk Prov.", columnType: "number" as const, thresholds: PROVISIONING_THRESHOLDS },
                ]}
                sortable resizable
              />
            )}
            <Flex gap={8} flexWrap="wrap">
              {scenarios.map((s) => (
                <Button key={s.id} variant="default" onClick={() => setScenarios((prev) => prev.filter((p) => p.id !== s.id))}>
                  Remove "{s.name}"
                </Button>
              ))}
            </Flex>
          </Flex>
        </Tab>

        {/* ═══════════════════════ RIGHT-SIZING ═══════════════════════ */}
        <Tab title="Right-Sizing">
          <Flex flexDirection="column" gap={16} paddingTop={16}>
            <SectionHeader title="Right-Sizing Recommendations" />
            <InsightBox>
              <strong>How to read this:</strong> Compares each host's forecasted peak usage against your {provisionGoal}% provisioning goal.
              <ul style={{ margin: "6px 0 0 0", paddingLeft: 20 }}>
                <li><span style={{ color: RED }}>■ Under-Provisioned</span> — Forecasted usage exceeds the goal. Needs more resources or load balancing.</li>
                <li><span style={{ color: YELLOW }}>■ Over-Provisioned</span> — Headroom of 40%+ on both CPU & Memory. Consider downsizing to save costs.</li>
                <li><span style={{ color: GREEN }}>■ Optimal</span> — Headroom is within a healthy range.</li>
              </ul>
            </InsightBox>
            {!rightSizingData.length ? (
              <Flex justifyContent="center" padding={32}><Strong>No host data available</Strong></Flex>
            ) : (
              <>
                <Flex gap={16} flexWrap="wrap">
                  <div style={{ flex: "1 1 200px", border: TILE_BORDER, borderRadius: 10, padding: 16, background: TILE_BG, boxShadow: TILE_SHADOW, textAlign: "center" }}>
                    <div style={{ fontSize: 12, color: "#8899bb" }}>Under-Provisioned</div>
                    <div style={{ fontSize: 32, fontWeight: 700, color: RED }}>{rightSizingData.filter((r) => r.Status === "Under-Provisioned").length}</div>
                  </div>
                  <div style={{ flex: "1 1 200px", border: TILE_BORDER, borderRadius: 10, padding: 16, background: TILE_BG, boxShadow: TILE_SHADOW, textAlign: "center" }}>
                    <div style={{ fontSize: 12, color: "#8899bb" }}>Over-Provisioned</div>
                    <div style={{ fontSize: 32, fontWeight: 700, color: YELLOW }}>{rightSizingData.filter((r) => r.Status === "Over-Provisioned").length}</div>
                  </div>
                  <div style={{ flex: "1 1 200px", border: TILE_BORDER, borderRadius: 10, padding: 16, background: TILE_BG, boxShadow: TILE_SHADOW, textAlign: "center" }}>
                    <div style={{ fontSize: 12, color: "#8899bb" }}>Optimal</div>
                    <div style={{ fontSize: 32, fontWeight: 700, color: GREEN }}>{rightSizingData.filter((r) => r.Status === "Optimal").length}</div>
                  </div>
                </Flex>
                <DataTable
                  data={rightSizingData.map(({ _statusColor, ...rest }) => rest)}
                  columns={[
                    { id: "host", header: "Host Name", accessor: "Host Name" },
                    { id: "cpuFc", header: "CPU Forecast High", accessor: "CPU Forecast High", columnType: "number" as const, thresholds: resourceThresholds("CPU Forecast High") },
                    { id: "cpuH", header: "CPU Headroom", accessor: "CPU Headroom", columnType: "number" as const, thresholds: PROVISIONING_THRESHOLDS },
                    { id: "memFc", header: "MEM Forecast High", accessor: "MEM Forecast High", columnType: "number" as const, thresholds: resourceThresholds("MEM Forecast High") },
                    { id: "memH", header: "MEM Headroom", accessor: "MEM Headroom", columnType: "number" as const, thresholds: PROVISIONING_THRESHOLDS },
                    { id: "status", header: "Status", accessor: "Status",
                      cell: ({ value }: { value: string }) => (
                        <span style={{ fontWeight: 700, color: value === "Under-Provisioned" ? RED : value === "Over-Provisioned" ? YELLOW : GREEN }}>{value}</span>
                      ) },
                  ]}
                  sortable resizable
                >
                  <DataTable.Pagination defaultPageSize={15} />
                </DataTable>
              </>
            )}
          </Flex>
        </Tab>

        {/* ═══════════════════════ HOST GROUP HEATMAP ═══════════════════════ */}
        <Tab title="Host Heatmap">
          <Flex flexDirection="column" gap={16} paddingTop={16}>
            <SectionHeader title="Host Capacity Heatmap — Forecasted CPU High" />
            <InsightBox>
              <strong>How to read this:</strong> Each hexagon represents one host. The color shows forecasted peak CPU usage:
              <span style={{ color: GREEN }}> ■ &lt;80%</span> (healthy),
              <span style={{ color: YELLOW }}> ■ 80–90%</span> (warning),
              <span style={{ color: RED }}> ■ &gt;90%</span> (critical). Larger values fill more of the color scale. Quickly spot which hosts are at risk.
            </InsightBox>
            {!heatmapData.length ? (
              <Flex justifyContent="center" padding={32}><Strong>No host data available</Strong></Flex>
            ) : (
              <div style={{ border: TILE_BORDER, borderRadius: 10, padding: 16, background: TILE_BG, boxShadow: TILE_SHADOW }}>
                <HoneycombChart
                  data={heatmapData}
                  colorScheme={[
                    { from: 0, to: 80, color: GREEN },
                    { from: 80, to: 90, color: YELLOW },
                    { from: 90, to: 200, color: RED },
                  ]}
                  showLabels
                >
                  <HoneycombChart.Legend />
                </HoneycombChart>
              </div>
            )}
          </Flex>
        </Tab>

        {/* ═══════════════════════ CORRELATION MATRIX ═══════════════════════ */}
        <Tab title="Correlation Matrix">
          <Flex flexDirection="column" gap={16} paddingTop={16}>
            <SectionHeader title="Cross-Resource Correlation Matrix" />
            <InsightBox>
              <strong>How to read this:</strong> This shows how each pair of resources moves together. Values close to 1 mean they increase and decrease in lockstep. If CPU and Memory are highly correlated, a traffic spike will stress both simultaneously — compounding the risk. Use this to identify which resources need to be scaled together.
            </InsightBox>
            {!correlationMatrix ? (
              <Flex justifyContent="center" padding={32}><Strong>No analytics data available</Strong></Flex>
            ) : (
              <div style={{ border: TILE_BORDER, borderRadius: 10, padding: 24, background: TILE_BG, boxShadow: TILE_SHADOW }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, textAlign: "center" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(99,130,191,0.3)" }}>
                      <th style={{ padding: 12, textAlign: "left" }}></th>
                      <th style={{ padding: 12 }}>Traffic</th>
                      <th style={{ padding: 12 }}>CPU</th>
                      <th style={{ padding: 12 }}>Memory</th>
                      <th style={{ padding: 12 }}>Disk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: "Traffic", values: [1, correlationMatrix.trafficCpu, correlationMatrix.trafficMem, correlationMatrix.trafficDisk] },
                      { label: "CPU", values: [correlationMatrix.trafficCpu, 1, correlationMatrix.cpuMem, correlationMatrix.cpuDisk] },
                      { label: "Memory", values: [correlationMatrix.trafficMem, correlationMatrix.cpuMem, 1, correlationMatrix.memDisk] },
                      { label: "Disk", values: [correlationMatrix.trafficDisk, correlationMatrix.cpuDisk, correlationMatrix.memDisk, 1] },
                    ].map((row) => (
                      <tr key={row.label} style={{ borderBottom: "1px solid rgba(99,130,191,0.15)" }}>
                        <td style={{ padding: 12, textAlign: "left", fontWeight: 700 }}>{row.label}</td>
                        {row.values.map((v, i) => (
                          <td key={i} style={{ padding: 12, fontWeight: v === 1 ? 400 : 700, color: v === 1 ? "#666" : v >= 0.5 ? GREEN : v >= 0.3 ? YELLOW : RED, background: v === 1 ? "transparent" : `rgba(${v >= 0.5 ? "0,210,106" : v >= 0.3 ? "252,213,63" : "248,49,47"}, 0.1)` }}>
                            {v === 1 ? "—" : round(v)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Flex>
        </Tab>

        {/* ═══════════════════════ TREND DECOMPOSITION ═══════════════════════ */}
        <Tab title="Trend Analysis">
          <Flex flexDirection="column" gap={16} paddingTop={16}>
            <SectionHeader title="Trend Decomposition — Growth Direction & Volatility" />
            <InsightBox>
              <strong>How to read this:</strong> This breaks each resource's timeseries into two components:
              <ul style={{ margin: "6px 0 0 0", paddingLeft: 20 }}>
                <li><strong>Trend Slope</strong> — Is the resource trending up or down? A positive slope means it's growing over time. Larger values = faster growth.</li>
                <li><strong>Residual Volatility</strong> — How "noisy" is the data after removing the trend? High volatility means unpredictable spikes that make capacity planning harder.</li>
                <li><strong>Trend Start → End</strong> — The smoothed value at the beginning vs end of your timeframe, showing the overall trajectory.</li>
              </ul>
            </InsightBox>
            {!trendData ? (
              <Flex justifyContent="center" padding={32}><Strong>No analytics data available</Strong></Flex>
            ) : (
              <>
                {(["cpu", "mem", "disk", "traffic"] as const).map((key) => {
                  const data = trendData[key];
                  const label = key === "cpu" ? "CPU" : key === "mem" ? "Memory" : key === "disk" ? "Disk" : "Traffic";
                  const slopeColor = data.trendSlope > 0.5 ? RED : data.trendSlope > 0.1 ? YELLOW : GREEN;
                  return (
                    <div key={key}>
                      <Heading level={6}>{label}</Heading>
                      <Flex gap={8} flexWrap="wrap">
                        <MetricCard label="Trend Slope (/interval)" value={data.trendSlope} color={slopeColor} bordered style={{ flex: 1, maxWidth: "none" }} />
                        <MetricCard label="Residual Volatility" value={data.residualStd} color={data.residualStd > 5 ? RED : GREEN} bordered style={{ flex: 1, maxWidth: "none" }} />
                        <MetricCard label="Trend Start" value={data.trendStart} unit="%" color={BLUE} bordered style={{ flex: 1, maxWidth: "none" }} />
                        <MetricCard label="Trend End" value={data.trendEnd} unit="%" color={BLUE} bordered style={{ flex: 1, maxWidth: "none" }} />
                      </Flex>
                      <InsightBox color={slopeColor}>
                        {data.trendSlope > 0.5
                          ? `⚠️ ${label} is growing rapidly. At this rate, capacity action is needed soon.`
                          : data.trendSlope > 0.1
                          ? `${label} is gradually increasing. Keep monitoring — it's trending upward but not yet urgent.`
                          : data.trendSlope > -0.1
                          ? `${label} is relatively flat — no significant growth trend. Current capacity should hold.`
                          : `${label} is trending downward — usage is decreasing over time, which is favorable.`
                        }
                        {data.residualStd > 5 ? ` Note: High volatility (${data.residualStd}) means spikes are common — plan for peak capacity, not averages.` : ""}
                      </InsightBox>
                    </div>
                  );
                })}
              </>
            )}
          </Flex>
        </Tab>

        {/* ═══════════════════════ CAPACITY REPORT ═══════════════════════ */}
        <Tab title="Capacity Report">
          <Flex flexDirection="column" gap={16} paddingTop={16}>
            <SectionHeader title="Executive Capacity Summary" />
            <InsightBox>
              <strong>How to use:</strong> This is a one-page summary of your infrastructure capacity posture. Use the "Copy to Clipboard" button to share with stakeholders.
            </InsightBox>
            {metrics && (
              <>
                <Button variant="emphasized" onClick={() => {
                  const lines = [
                    `CAPACITY REPORT — ${new Date().toLocaleDateString()}`,
                    `Timeframe: ${timeframeDays} days | Traffic Scenario: +${trafficChangePercent}% | Provision Goal: ${provisionGoal}%`,
                    `Hosts Analyzed: ${activeHosts.length}`,
                    "",
                    "RESOURCE SUMMARY",
                    `  CPU:    Observed High=${round(cpu.high)}%  Forecast High=${round(cpuForecast.high)}%  PCC=${round(cpuPCC)}  Provisioning=${round(cpuProvisioning)}%`,
                    `  Memory: Observed High=${round(memory.high)}%  Forecast High=${round(memForecast.high)}%  PCC=${round(memPCC)}  Provisioning=${round(memProvisioning)}%`,
                    `  Disk:   Observed High=${round(disk.high)}%  Forecast High=${round(diskForecast.high)}%  PCC=${round(diskPCC)}  Provisioning=${round(diskProvisioning)}%`,
                    "",
                    "RIGHT-SIZING",
                    `  Under-Provisioned: ${rightSizingData.filter((r) => r.Status === "Under-Provisioned").length}`,
                    `  Over-Provisioned: ${rightSizingData.filter((r) => r.Status === "Over-Provisioned").length}`,
                    `  Optimal: ${rightSizingData.filter((r) => r.Status === "Optimal").length}`,
                    "",
                    "SATURATION COUNTDOWN",
                    `  At Risk (≤30 days): ${saturationData.filter((r) => typeof r._minDays === "number" && r._minDays <= 30).length}`,
                    `  Warning (31–90 days): ${saturationData.filter((r) => typeof r._minDays === "number" && r._minDays > 30 && r._minDays <= 90).length}`,
                    "",
                    alertViolations.length > 0 ? `ALERT VIOLATIONS: ${alertViolations.length}` : "NO ALERT VIOLATIONS",
                  ];
                  navigator.clipboard.writeText(lines.join("\n"));
                }}>
                  Copy Report to Clipboard
                </Button>
                <div style={{ border: TILE_BORDER, borderRadius: 10, padding: 24, background: TILE_BG, boxShadow: TILE_SHADOW, fontFamily: "monospace", fontSize: 13, lineHeight: 1.8, whiteSpace: "pre-wrap", color: "#d0d4e0" }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#4589FF", marginBottom: 12 }}>CAPACITY REPORT — {new Date().toLocaleDateString()}</div>
                  <div>Timeframe: <strong>{timeframeDays} days</strong> | Traffic Scenario: <strong>+{trafficChangePercent}%</strong> | Provision Goal: <strong>{provisionGoal}%</strong></div>
                  <div>Hosts Analyzed: <strong>{activeHosts.length}</strong></div>
                  <div style={{ marginTop: 16, fontWeight: 700, color: "#4589FF" }}>RESOURCE FORECASTS</div>
                  <div>CPU:    Observed High=<span style={{ color: getResourceColor(cpu.high) }}>{round(cpu.high)}%</span>  →  Forecast High=<span style={{ color: getResourceColor(cpuForecast.high) }}>{round(cpuForecast.high)}%</span>  |  Headroom=<span style={{ color: getProvisioningColor(cpuProvisioning) }}>{round(cpuProvisioning)}%</span></div>
                  <div>Memory: Observed High=<span style={{ color: getResourceColor(memory.high) }}>{round(memory.high)}%</span>  →  Forecast High=<span style={{ color: getResourceColor(memForecast.high) }}>{round(memForecast.high)}%</span>  |  Headroom=<span style={{ color: getProvisioningColor(memProvisioning) }}>{round(memProvisioning)}%</span></div>
                  <div>Disk:   Observed High=<span style={{ color: getResourceColor(disk.high) }}>{round(disk.high)}%</span>  →  Forecast High=<span style={{ color: getResourceColor(diskForecast.high) }}>{round(diskForecast.high)}%</span>  |  Headroom=<span style={{ color: getProvisioningColor(diskProvisioning) }}>{round(diskProvisioning)}%</span></div>
                  <div style={{ marginTop: 16, fontWeight: 700, color: "#4589FF" }}>RIGHT-SIZING SUMMARY</div>
                  <div><span style={{ color: RED }}>Under-Provisioned: {rightSizingData.filter((r) => r.Status === "Under-Provisioned").length}</span> | <span style={{ color: YELLOW }}>Over-Provisioned: {rightSizingData.filter((r) => r.Status === "Over-Provisioned").length}</span> | <span style={{ color: GREEN }}>Optimal: {rightSizingData.filter((r) => r.Status === "Optimal").length}</span></div>
                  <div style={{ marginTop: 16, fontWeight: 700, color: "#4589FF" }}>SATURATION RISK</div>
                  <div><span style={{ color: RED }}>At Risk (≤30d): {saturationData.filter((r) => typeof r._minDays === "number" && r._minDays <= 30).length}</span> | <span style={{ color: YELLOW }}>Warning (31–90d): {saturationData.filter((r) => typeof r._minDays === "number" && r._minDays > 30 && r._minDays <= 90).length}</span></div>
                  {alertViolations.length > 0 && (
                    <>
                      <div style={{ marginTop: 16, fontWeight: 700, color: RED }}>ALERT VIOLATIONS ({alertViolations.length})</div>
                      {alertViolations.slice(0, 10).map((v, i) => (
                        <div key={i}>{v.host}: {v.rule} (actual: {v.actual}%)</div>
                      ))}
                    </>
                  )}
                </div>
              </>
            )}
          </Flex>
        </Tab>

        {/* ═══════════════════════ BASELINE SNAPSHOTS ═══════════════════════ */}
        <Tab title="Baselines">
          <Flex flexDirection="column" gap={16} paddingTop={16}>
            <SectionHeader title="Baseline Snapshots — Track Capacity Over Time" />
            <InsightBox>
              <strong>How to use:</strong> Save a snapshot of today's metrics as a named baseline (e.g., "Before migration", "Post scale-out"). Compare future data against these baselines to verify that capacity actions had the expected effect.
            </InsightBox>
            <Flex gap={8} alignItems="flex-end" flexWrap="wrap">
              <Flex flexDirection="column" gap={4} style={{ flex: "1 1 200px" }}>
                <Strong>Baseline Name</Strong>
                <input value={baselineName} onChange={(e) => setBaselineName(e.target.value)} placeholder="e.g. Pre-migration baseline" style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid rgba(99,130,191,0.3)", background: "rgba(30,35,55,0.7)", color: "#d0d4e0", fontSize: 13 }} />
              </Flex>
              <Button variant="emphasized" onClick={saveBaseline} disabled={!metrics || !baselineName.trim()}>Save Current as Baseline</Button>
            </Flex>
            {baselines.length > 0 && (
              <>
                <Heading level={6}>Saved Baselines vs Current</Heading>
                <DataTable
                  data={baselines.map((b) => ({
                    Name: b.name,
                    "Saved At": b.timestamp,
                    "CPU High (then)": b.cpuHigh,
                    "CPU High (now)": round(cpu.high),
                    "CPU Δ": round(cpu.high - b.cpuHigh),
                    "MEM High (then)": b.memHigh,
                    "MEM High (now)": round(memory.high),
                    "MEM Δ": round(memory.high - b.memHigh),
                    "Disk High (then)": b.diskHigh,
                    "Disk High (now)": round(disk.high),
                    "Disk Δ": round(disk.high - b.diskHigh),
                  }))}
                  columns={[
                    { id: "name", header: "Baseline", accessor: "Name" },
                    { id: "saved", header: "Saved At", accessor: "Saved At" },
                    { id: "cpuThen", header: "CPU (then)", accessor: "CPU High (then)", columnType: "number" as const },
                    { id: "cpuNow", header: "CPU (now)", accessor: "CPU High (now)", columnType: "number" as const },
                    { id: "cpuD", header: "CPU Δ", accessor: "CPU Δ", columnType: "number" as const, thresholds: [{ comparator: "greater-than" as const, value: 0, backgroundColor: RED, color: "#000" }, { comparator: "less-than-or-equal-to" as const, value: 0, backgroundColor: GREEN, color: "#000" }] },
                    { id: "memThen", header: "MEM (then)", accessor: "MEM High (then)", columnType: "number" as const },
                    { id: "memNow", header: "MEM (now)", accessor: "MEM High (now)", columnType: "number" as const },
                    { id: "memD", header: "MEM Δ", accessor: "MEM Δ", columnType: "number" as const, thresholds: [{ comparator: "greater-than" as const, value: 0, backgroundColor: RED, color: "#000" }, { comparator: "less-than-or-equal-to" as const, value: 0, backgroundColor: GREEN, color: "#000" }] },
                    { id: "diskThen", header: "Disk (then)", accessor: "Disk High (then)", columnType: "number" as const },
                    { id: "diskNow", header: "Disk (now)", accessor: "Disk High (now)", columnType: "number" as const },
                    { id: "diskD", header: "Disk Δ", accessor: "Disk Δ", columnType: "number" as const, thresholds: [{ comparator: "greater-than" as const, value: 0, backgroundColor: RED, color: "#000" }, { comparator: "less-than-or-equal-to" as const, value: 0, backgroundColor: GREEN, color: "#000" }] },
                  ]}
                  sortable resizable
                />
                <Flex gap={8} flexWrap="wrap">
                  {baselines.map((b) => (
                    <Button key={b.id} variant="default" onClick={() => setBaselines((prev) => prev.filter((p) => p.id !== b.id))}>
                      Remove "{b.name}"
                    </Button>
                  ))}
                </Flex>
              </>
            )}
          </Flex>
        </Tab>

        {/* ═══════════════════════ ALERT THRESHOLDS ═══════════════════════ */}
        <Tab title="Alert Rules">
          <Flex flexDirection="column" gap={16} paddingTop={16}>
            <SectionHeader title="Custom Capacity Alert Rules" />
            <InsightBox>
              <strong>How to use:</strong> Define threshold rules to flag hosts that breach your capacity criteria. For example, "Flag any host where Forecast CPU High &gt; 90%". Rules are evaluated against the current per-host data and violations appear below in real-time.
            </InsightBox>
            <Flex gap={8} alignItems="flex-end" flexWrap="wrap">
              <Flex flexDirection="column" gap={4} style={{ flex: "1 1 180px" }}>
                <Strong>Metric</Strong>
                <Select value={newAlertMetric} onChange={(val) => { if (val) setNewAlertMetric(val as string); }}>
                  <Select.Content>
                    {["Forecast CPU High", "Forecast MEM High", "Forecast Disk High", "Observed CPU High", "Observed MEM High"].map((m) => (
                      <Select.Option key={m} value={m}>{m}</Select.Option>
                    ))}
                  </Select.Content>
                </Select>
              </Flex>
              <Flex flexDirection="column" gap={4} style={{ flex: "0 0 100px" }}>
                <Strong>Operator</Strong>
                <Select value={newAlertComparator} onChange={(val) => { if (val) setNewAlertComparator(val as string); }}>
                  <Select.Content>
                    <Select.Option value=">">&gt;</Select.Option>
                    <Select.Option value=">=">&gt;=</Select.Option>
                    <Select.Option value="<">&lt;</Select.Option>
                  </Select.Content>
                </Select>
              </Flex>
              <Flex flexDirection="column" gap={4} style={{ flex: "0 0 120px" }}>
                <Strong>Threshold (%)</Strong>
                <NumberInput value={newAlertThreshold} onChange={(val) => setNewAlertThreshold(val ?? 90)} min={0} max={100} />
              </Flex>
              <Button variant="emphasized" onClick={addAlertRule}>Add Rule</Button>
            </Flex>
            {alertRules.length > 0 && (
              <>
                <Heading level={6}>Active Rules</Heading>
                <Flex gap={8} flexWrap="wrap">
                  {alertRules.map((rule) => (
                    <div key={rule.id} style={{ padding: "8px 16px", border: TILE_BORDER, borderRadius: 8, background: TILE_BG, display: "flex", alignItems: "center", gap: 8 }}>
                      <Strong>{rule.metric} {rule.comparator} {rule.threshold}%</Strong>
                      <Button variant="default" onClick={() => setAlertRules((prev) => prev.filter((r) => r.id !== rule.id))}>✕</Button>
                    </div>
                  ))}
                </Flex>
              </>
            )}
            {alertViolations.length > 0 && (
              <>
                <Heading level={6}>Violations ({alertViolations.length})</Heading>
                <DataTable
                  data={alertViolations}
                  columns={[
                    { id: "rule", header: "Rule", accessor: "rule" },
                    { id: "host", header: "Host", accessor: "host" },
                    { id: "actual", header: "Actual Value (%)", accessor: "actual", columnType: "number" as const, thresholds: resourceThresholds("actual") },
                  ]}
                  sortable resizable
                >
                  <DataTable.Pagination defaultPageSize={15} />
                </DataTable>
              </>
            )}
            {alertRules.length > 0 && alertViolations.length === 0 && (
              <InsightBox color={GREEN}>
                <strong>✓ All clear.</strong> No hosts are currently violating your alert rules.
              </InsightBox>
            )}
          </Flex>
        </Tab>
      </Tabs>
      </Flex>
    </Flex>
  );
};
