/**
 * @file OpenTelemetry distributed tracing initialization and lifecycle management.
 * @module observability/instrumentation
 */

import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { env } from '#src/config/env.js';

let sdk: NodeSDK | null = null;

if (env.OTEL_TRACING_ENABLED) {
  const exporter = new OTLPTraceExporter({
    url: `${env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`,
  });

  sdk = new NodeSDK({
    serviceName: env.OTEL_SERVICE_NAME,
    traceExporter: exporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  sdk.start();
}

/**
 * Shuts down OpenTelemetry SDK and flushes pending spans.
 *
 * @returns Resolves when exporter finishes flushing.
 */
export async function shutdownTracing(): Promise<void> {
  if (sdk) {
    await sdk.shutdown();
  }
}
