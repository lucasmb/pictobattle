import { defineConfig } from 'vite';
import { builtinModules } from 'module';
import { fileURLToPath } from 'url';

export default defineConfig({
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
    // Bundle most dependencies but externalize socket.io and ws
    ssr: {
        noExternal: /.*/,
        external: ['socket.io', 'ws', 'engine.io', 'bufferutil', 'utf-8-validate'],
    },
    build: {
        ssr: true,
        lib: {
            entry: 'src/index.ts',
            formats: ['es'],
            fileName: 'index',
        },
        rollupOptions: {
            // Exclude Node.js built-in modules and socket.io packages (need real module for ws constructor)
            external: [
                ...builtinModules,
                ...builtinModules.map((m: string) => `node:${m}`),
                'socket.io',
                'engine.io',
                'ws',
                'bufferutil',
                'utf-8-validate',
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