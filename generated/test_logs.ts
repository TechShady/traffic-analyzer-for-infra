/**
/* Automatically generated code for test_logs.dql
*/
import { queryExecutionClient, QueryStartResponse } from '@dynatrace-sdk/client-query';

export function getQueryString(){
  return `fetch logs
| filter k8s.namespace.name != "kube-system" and isNotNull(k8s.namespace.name)
| filter loglevel == "ERROR"
| summarize error_count = count(), by: {k8s.cluster.name, k8s.namespace.name}
| sort error_count desc
| limit 10`;
}

export async function runQuery(): Promise<QueryStartResponse> {
  return await queryExecutionClient.queryExecute({body: { query: getQueryString(), requestTimeoutMilliseconds: 30000 }});
}