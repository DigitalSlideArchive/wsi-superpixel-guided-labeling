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
    config.resolve = {
        alias: {
            vue: process.env.NODE_ENV === 'production' ? 'vue/dist/vue.min.js' : 'vue/dist/vue.js'
        }
    };
    config.plugins.push(new VueLoaderPlugin());
    return config;
};
