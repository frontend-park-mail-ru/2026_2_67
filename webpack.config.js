import path from 'node:path';
import { fileURLToPath } from 'node:url';
import CopyWebpackPlugin from 'copy-webpack-plugin';

const projectDirectory = path.dirname(fileURLToPath(import.meta.url));

export default {
  entry: './public/js/main.js',
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              ['@babel/preset-env', {
                targets: {
                  chrome: '109',
                  edge: '109',
                  firefox: '115',
                  safari: '16.4',
                },
                modules: false,
              }],
            ],
          },
        },
      },
    ],
  },
  output: {
    path: path.resolve(projectDirectory, 'dist'),
    filename: 'main.js',
    clean: true,
    assetModuleFilename: 'templates/[name][ext]',
  },
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        {
          from: 'public/index.html',
          to: 'index.html',
          transform(content) {
            return content.toString().replace(
              '<script type="module" src="/js/main.js"></script>',
              '<script defer src="/main.js"></script>',
            );
          },
        },
        { from: 'public/css', to: 'css' },
        { from: 'public/images', to: 'images' },
        { from: 'public/vendor', to: 'vendor' },
      ],
    }),
  ],
};
