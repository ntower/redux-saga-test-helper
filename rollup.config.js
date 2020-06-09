import babel from "@rollup/plugin-babel";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import { uglify } from "rollup-plugin-uglify";

const extensions = [".js", ".ts"];

export default {
  input: "src/index.ts",
  output: {
    file: "dist/index.min.js",
    format: "cjs",
  },
  plugins: [
    resolve({
      jsnext: true,
      main: true,
      browser: true,
      extensions,
    }),
    commonjs(),
    babel({
      extensions,
      exclude: "node_modules/**",
    }),
    uglify(),
  ],
};
