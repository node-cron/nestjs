import commonjs from "@rollup/plugin-commonjs";
import resolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import { rmSync } from "fs";
import { builtinModules } from "module";
import dts from "rollup-plugin-dts";

// Wipes dist once before the first build so stale artifacts don't linger.
const cleanDist = () => ({
  name: "clean-dist",
  buildStart() {
    rmSync("dist", { recursive: true, force: true });
  },
});

// Everything that is a peer dependency (or a Node built-in) stays external: we
// never bundle Nest, node-cron, rxjs or reflect-metadata into our artifacts.
const external = [
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
  /^@nestjs\//,
  "node-cron",
  /^rxjs($|\/)/,
  "reflect-metadata",
];

const input = "src/index.ts";

const basePlugins = () => [
  resolve(),
  commonjs(),
  typescript({
    tsconfig: "./tsconfig.json",
    sourceMap: true,
    declaration: false,
    exclude: ["**/*.test.ts"],
    noEmitOnError: process.env.NODE_ENV !== "development",
  }),
];

export default [
  // ESM build
  {
    input,
    output: {
      dir: "dist",
      format: "esm",
      preserveModules: true,
      preserveModulesRoot: "src",
      entryFileNames: "[name].js",
      sourcemap: true,
    },
    external,
    plugins: [cleanDist(), ...basePlugins()],
  },
  // CJS build
  {
    input,
    output: {
      dir: "dist",
      format: "cjs",
      preserveModules: true,
      preserveModulesRoot: "src",
      entryFileNames: "[name].cjs",
      sourcemap: true,
      exports: "named",
    },
    external,
    plugins: [...basePlugins()],
  },
  // Type declarations: one bundled .d.ts for the public entry.
  {
    input: "src/index.ts",
    output: {
      file: "dist/index.d.ts",
      format: "es",
    },
    external,
    plugins: [dts()],
  },
];
