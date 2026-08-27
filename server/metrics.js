// Prometheus metrics exporter (pure: takes state as argument)

function promMetrics(state) {
  const { startTime, cacheHits, responseCache, models } = state;
  const now = Date.now();
  const lines = [];
  lines.push("# TYPE modelhub_uptime_seconds gauge");
  lines.push(`modelhub_uptime_seconds ${Math.round((now - startTime) / 1000)}`);
  lines.push("# TYPE modelhub_cache_hits_total counter");
  lines.push(`modelhub_cache_hits_total ${cacheHits}`);
  lines.push("# TYPE modelhub_cache_entries gauge");
  lines.push(`modelhub_cache_entries ${responseCache.size}`);
  lines.push("# TYPE modelhub_models gauge");
  lines.push(`modelhub_models{state="enabled"} ${models.filter(m => m.enabled).length}`);
  lines.push(`modelhub_models{state="healthy"} ${models.filter(m => m.enabled && (!m.failUntil || m.failUntil <= now)).length}`);
  lines.push("# TYPE modelhub_requests_total counter");
  for (const m of models) {
    if (!m.requests && !m.lifetimeFails) continue;
    lines.push(`modelhub_requests_total{model="${m.id}",status="ok"} ${m.requests || 0}`);
    lines.push(`modelhub_requests_total{model="${m.id}",status="fail"} ${m.lifetimeFails || 0}`);
  }
  lines.push("# TYPE modelhub_tokens_total counter");
  for (const m of models) {
    if (!m.tokens) continue;
    lines.push(`modelhub_tokens_total{model="${m.id}"} ${m.tokens}`);
  }
  lines.push("# TYPE modelhub_cost_dollars_total counter");
  for (const m of models) {
    if (!m.cost) continue;
    lines.push(`modelhub_cost_dollars_total{model="${m.id}"} ${(m.cost || 0).toFixed(6)}`);
  }
  lines.push("# TYPE modelhub_upstream_latency_ms gauge");
  for (const m of models) {
    if (!m.lastLatencyMs) continue;
    lines.push(`modelhub_upstream_latency_ms{model="${m.id}"} ${m.lastLatencyMs}`);
    if (m.avgTTFTMs) lines.push(`modelhub_ttft_ms{model="${m.id}"} ${m.avgTTFTMs}`);
  }
  return lines.join("\n") + "\n";
}

module.exports = { promMetrics };
