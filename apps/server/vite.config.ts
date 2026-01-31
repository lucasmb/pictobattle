import { defineConfig } from 'vite';
import { builtinModules } from 'module';
import { fileURLToPath } from 'url';

export default defineConfig({
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
    ssr: {
        // Bundle ALL npm dependencies into the output (required for distroless images)
        noExternal: true,
    },
    build: {
        ssr: true,
        lib: {
            entry: 'src/index.ts',
            formats: ['es'],
            fileName: 'index',
        },
        rollupOptions: {
            // Only exclude Node.js built-in modules
            external: [
                ...builtinModules,
                ...builtinModules.map((m: string) => `node:${m}`),
            ],
            output: {
                entryFileNames: '[name].js',
                inlineDynamicImports: true,
            },
        },
        outDir: 'dist',
        emptyOutDir: true,
        minify: true,
    },
});