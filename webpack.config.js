const path = require('path');
const webpack = require('webpack');

module.exports = {
  target: 'webworker',
  entry: './src/extension.ts',
  output: {
    path: path.resolve(__dirname, 'dist/web'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2',
    devtoolModuleFilenameTemplate: '../../[resource-path]'
  },
  devtool: 'source-map',
  externals: {
    vscode: 'commonjs vscode'
  },
  resolve: {
    extensions: ['.ts', '.js'],
    fallback: {
      path: require.resolve('path-browserify'),
      assert: false,
      buffer: false,
      crypto: false,
      http: false,
      https: false,
      os: false,
      stream: false,
      util: false
    }
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      }
    ]
  },
  plugins: [
    new webpack.ProvidePlugin({
      process: 'process/browser'
    })
  ]
};


