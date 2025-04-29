const path = require("path");
const webpack = require("webpack");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyPlugin = require("copy-webpack-plugin");
const FaviconsWebpackPlugin = require("favicons-webpack-plugin");

module.exports = (env, argv) => {
  return {
    entry: "./src/index.js",
    output: {
      filename: "main.js",
      path: path.resolve(__dirname, "dist"),
    },
    devtool: "eval-cheap-source-map",
    devServer: {
      compress: true,
      port: 3001,
      proxy: [
        {
          context: ["/socket.io"],
          target: "http://localhost:3002",
          ws: true,
        },
      ],
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cross-Origin-Embedder-Policy": "require-corp",
        "Cross-Origin-Opener-Policy": "same-origin",
      },
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: "ts-loader",
          exclude: /node_modules/,
        },
        {
          test: /\.css$/,
          use: ["style-loader", "css-loader"],
        },
        {
          test: /\.(png|otf)$/,
          type: "asset/resource",
        },
      ],
    },
    plugins: [
      new webpack.DefinePlugin({ DEV_MODE: argv.mode == "development" }),
      new FaviconsWebpackPlugin("./public/favicon.png"),
      new HtmlWebpackPlugin({
        template: "./public/index.html",
        filename: "index.html",
        path: path.resolve(__dirname, "dist"),
      }),
      new webpack.ProvidePlugin({
        $: "jquery",
        jQuery: "jquery",
      }),
      new CopyPlugin({
        patterns: [
          { from: "./public/robots.txt", to: "robots.txt" },
          { from: "./src/workers", to: "./src/workers" },
          { from: "./assets/textures", to: "./textures" },
          { from: "./assets/images", to: "./images" },
          { from: "./assets/audio", to: "./assets/audio" },
        ],
      }),
    ],
    resolve: {
      extensions: [".ts", ".js", ".json"],
    },
  };
};
