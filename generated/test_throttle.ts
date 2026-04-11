/**
/* Automatically generated code for test_throttle.dql
*/
import { queryExecutionClient, QueryStartResponse } from '@dynatrace-sdk/client-query';

export function getQueryString(){
  return `timeseries {
  throttled = avg(dt.kubernetes.container.cpu_throttled),
  limit_cpu = avg(dt.kubernetes.container.limits_cpu),
  usage = avg(dt.kubernetes.container.cpu_usage)
}, by: {k8s.pod.name, k8s.namespace.name, k8s.cluster.name}
| fieldsAdd throttle_pct = if(arrayAvg(limit_cpu) > 0, (arrayAvg(throttled) / arrayAvg(limit_cpu)) * 100, else: 0)
| filter throttle_pct > 25
| sort throttle_pct desc
| fields k8s.cluster.name, k8s.namespace.name, k8s.pod.name, throttle_pct
| limit 10`;
}

export async function runQuery(): Promise<QueryStartResponse> {
  return await queryExecutionClient.queryExecute({body: { query: getQueryString(), requestTimeoutMilliseconds: 30000 }});
}