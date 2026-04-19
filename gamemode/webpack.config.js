const path = require('path')

/** @type {import('webpack').Configuration} */
module.exports = {
  entry: './src/index.ts',
  target: 'node',
  mode: 'production',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: 'ts-loader',
          options: {
            configFile: path.resolve(__dirname, 'tsconfig.json'),
          },
        },
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  output: {
    filename: 'gamemode.js',
    path: path.resolve(__dirname, '..'),
    library: {
      type: 'commonjs2',
    },
  },
  optimization: {
    minimize: false,
  },
}
