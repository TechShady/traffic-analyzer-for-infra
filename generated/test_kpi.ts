/**
/* Automatically generated code for test_kpi.dql
*/
import { queryExecutionClient, QueryStartResponse } from '@dynatrace-sdk/client-query';

export function getQueryString(){
  return `timeseries restarts = sum(dt.kubernetes.container.restarts), by: {k8s.cluster.name}
| fieldsAdd total = arraySum(restarts)
| summarize total_restarts = sum(total)`;
}

export async function runQuery(): Promise<QueryStartResponse> {
  return await queryExecutionClient.queryExecute({body: { query: getQueryString(), requestTimeoutMilliseconds: 30000 }});
}