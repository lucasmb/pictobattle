import { defineConfig } from 'vite';
import { builtinModules } from 'module';
import { fileURLToPath } from 'url';

export default defineConfig({
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
    build: {
        ssr: true,
        lib: {
            entry: 'src/index.ts',
            formats: ['es'],
            fileName: 'index',
        },
        rollupOptions: {
            external: [
                ...builtinModules,
                ...builtinModules.map((m: string) => `node:${m}`),
                'fsevents',
            ],
            output: {
                entryFileNames: '[name].js',
            },
        },
        outDir: 'dist',
        emptyOutDir: true,
        minify: true,

    },
});
