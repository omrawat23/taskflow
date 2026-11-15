// OpenTelemetry SDK, started once, before any other module is imported (`node --import`).
// Traces: every HTTP request, MongoDB query and outbound fetch is a span.
// Metrics: http.server.request.duration (auto) + event-loop delay (below).
// Logs: pino instrumentation stamps trace_id/span_id on every line for correlation.
// Disabled unless OTEL_EXPORTER_OTLP_ENDPOINT is set, so local runs need no collector.
import { register } from 'node:module'
import { monitorEventLoopDelay } from 'node:perf_hooks'
import { metrics } from '@opentelemetry/api'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { z } from 'zod'

const OtelEnv = z.object({
  OTEL_EXPORTER_OTLP_ENDPOINT: z.url().optional(),
  OTEL_SERVICE_NAME: z.string().default('taskflow-api'),
})
const env = OtelEnv.parse({
  OTEL_EXPORTER_OTLP_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || undefined,
  OTEL_SERVICE_NAME: process.env.OTEL_SERVICE_NAME || undefined,
})

if (env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  // ESM: install the loader hook so express/mongodb/http get instrumented on import.
  register('@opentelemetry/instrumentation/hook.mjs', import.meta.url)

  const sdk = new NodeSDK({
    serviceName: env.OTEL_SERVICE_NAME,
    traceExporter: new OTLPTraceExporter(),
    metricReaders: [new PeriodicExportingMetricReader({ exporter: new OTLPMetricExporter() })],
    instrumentations: [
      getNodeAutoInstrumentations({ '@opentelemetry/instrumentation-fs': { enabled: false } }),
    ],
  })
  sdk.start()

  const loopDelay = monitorEventLoopDelay({ resolution: 20 })
  loopDelay.enable()
  metrics
    .getMeter('taskflow-api')
    .createObservableGauge('nodejs.eventloop.delay.p99', { unit: 'ms' })
    .addCallback((result) => {
      result.observe(loopDelay.percentile(99) / 1e6)
      loopDelay.reset()
    })

  const flush = () => {
    sdk.shutdown().catch(() => {})
  }
  process.once('SIGTERM', flush)
  process.once('SIGINT', flush)
}
