import { defineConfig } from 'vite';
import { builtinModules } from 'module';

export default defineConfig({
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
    resolve: {
        alias: {
            '@pictobattle/shared': '../../packages/shared',
        },
    },
});
