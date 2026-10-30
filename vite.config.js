import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 构建产物：dist/index.html 单文件（图片以 base64 内联），双击即可离线打开，
// 方便直接发给小朋友玩；开发时用 npm run dev 走标准 ESM 模块。
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: {
    target: 'es2020',
    assetsInlineLimit: 8 * 1024 * 1024,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 99999,
  },
  server: { host: '127.0.0.1', port: 5173, open: false },
});
