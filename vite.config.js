const { defineConfig, loadEnv } = require("vite");
const react = require("@vitejs/plugin-react");

module.exports = defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react()],
    server: {
      host: "0.0.0.0",
      port: 3000,
      strictPort: true,
    },
    preview: {
      host: "0.0.0.0",
      port: 3000,
      strictPort: true,
    },
    publicDir: "public",
    build: {
      outDir: "build",
      emptyOutDir: true,
    },
    define: {
      "process.env.REACT_APP_API_URL": JSON.stringify(env.REACT_APP_API_URL),
      "process.env.REACT_APP_WS_PATH": JSON.stringify(env.REACT_APP_WS_PATH),
      "process.env.REACT_APP_MAX_AVATAR_SIZE": JSON.stringify(env.REACT_APP_MAX_AVATAR_SIZE),
    },
  };
});
