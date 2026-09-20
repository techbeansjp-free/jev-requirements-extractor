import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiPort = env.API_PORT || "3821";
  return {
    plugins: [react()],
    server: {
      port: Number(env.WEB_PORT || 5273),
      proxy: { "/api": { target: `http://localhost:${apiPort}`, changeOrigin: true } },
      // CDK の合成結果を拾うとフルリロードが走るので監視から外す
      watch: { ignored: ["**/infra/**"] },
    },
    build: { outDir: "dist" },
  };
});
