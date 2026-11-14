import path from 'node:path';
import { fileURLToPath } from 'node:url';
import CopyWebpackPlugin from 'copy-webpack-plugin';
import webpack from 'webpack';
import { createHash } from 'node:crypto';

const projectDirectory = path.dirname(fileURLToPath(import.meta.url));

class OfflineManifestPlugin {
  apply(compiler) {
    compiler.hooks.thisCompilation.tap('OfflineManifestPlugin', (compilation) => {
      compilation.hooks.processAssets.tap(
        { name: 'OfflineManifestPlugin', stage: webpack.Compilation.PROCESS_ASSETS_STAGE_SUMMARIZE },
        () => {
          const names = compilation.getAssets().map(({ name }) => name)
            .filter((name) => name === 'index.html' || name === 'main.js'
              || /^(css|templates|images|vendor)\//.test(name)).sort();
          const hash = createHash('sha256');
          for (const name of names) {
            hash.update(name).update(compilation.getAsset(name).source.buffer());
          }
          const worker = compilation.getAsset('service-worker.js');
          hash.update(worker.source.buffer());
          const manifest = JSON.stringify(names.map((name) => `/${name}`));
          const source = worker.source.source().toString()
            .replaceAll('\\"__OFFLINE_ASSETS__\\"', JSON.stringify(manifest).slice(1, -1))
            .replaceAll('"__OFFLINE_ASSETS__"', manifest)
            .replace('__OFFLINE_VERSION__', hash.digest('hex').slice(0, 16));
          compilation.updateAsset('service-worker.js', new webpack.sources.RawSource(source));
        },
      );
    });
  }
}

export default {
  entry: { main: [
    './public/css/main.css',
    './public/css/cart.css',
    './public/css/checkout.css',
    './public/css/product.css',
    './public/js/main.js',
  ], 'service-worker': './public/js/service-worker.ts' },
  module: {
    rules: [
      {
        test: /\.css$/,
        type: 'asset/resource',
        generator: { filename: 'css/[name][ext]' },
        use: ['postcss-loader'],
      },
      {
        test: /\.[jt]s$/,
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
              '@babel/preset-typescript',
            ],
          },
        },
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
    extensionAlias: {
      '.js': ['.ts', '.js'],
    },
  },
  output: {
    path: path.resolve(projectDirectory, 'dist'),
    filename: '[name].js',
    clean: true,
    assetModuleFilename: 'templates/[name][ext]',
  },
  plugins: [
    new webpack.DefinePlugin({
      OFFLINE_ASSETS: JSON.stringify('__OFFLINE_ASSETS__'),
      OFFLINE_VERSION: JSON.stringify('__OFFLINE_VERSION__'),
    }),
    new OfflineManifestPlugin(),
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
        { from: 'public/images', to: 'images' },
        { from: 'public/vendor', to: 'vendor' },
        { from: 'public/js/templates', to: 'templates', globOptions: { ignore: ['**/templates.ts'] } },
      ],
    }),
  ],
};
