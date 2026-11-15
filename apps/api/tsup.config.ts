import { defineConfig } from 'tsup'

// Dependencies stay external so OpenTelemetry can instrument express/mongodb/http at load time.
// The workspace contracts package ships as TypeScript source, so it is bundled in.
export default defineConfig({
  entry: ['src/server.ts', 'src/worker.ts', 'src/common/otel.ts', 'src/migrations/run.ts'],
  format: ['esm'],
  target: 'node24',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  noExternal: ['@taskflow/contracts'],
})
