const { VueLoaderPlugin } = require('vue-loader');

module.exports = function (config) {
    config.module.rules.push({
        resource: {
            test: /\.vue$/
        },
        use: [
            require.resolve('vue-loader')
        ]
    });
    config.module.rules.push({
        resource: {
            test: /\.s(c|a)ss$/
        },
        use: [
            require.resolve('vue-style-loader'),
            require.resolve('css-loader'),
            {
                loader: 'sass-loader',
                options: {
                    implementation: 'sass',
                    sassOptions: {
                        indentedSyntax: true
                    }
                }
            }
        ]
    });
    config.resolve = {
        alias: {
            vue: process.env.NODE_ENV === 'production' ? 'vue/dist/vue.min.js' : 'vue/dist/vue.js'
        }
    };
    config.plugins.push(new VueLoaderPlugin());
    return config;
};
