const events = girder.events;
const { registerPluginNamespace } = girder.pluginUtils;
const { exposePluginConfig } = girder.utilities.PluginUtils;

import ActiveLearningView from './views/body/ActiveLearningView';
import './views/itemAndFolderList';
import './views/HeaderView';
import './views/HeaderImageView';
import * as WSISuperpixelGuidedLabeling from './index';

const pluginName = 'wsi_superpixel_guided_labeling';
const configRoute = `plugins/${pluginName}/config`;

registerPluginNamespace(pluginName, WSISuperpixelGuidedLabeling);
exposePluginConfig(pluginName, configRoute);

// g:appload.before runs after all plugin static files have been loaded
events.on('g:appload.before', () => {
    const router = girder.plugins.histomicsui.router;
    router.route('active-learning', 'active-learning', function () {
        events.trigger('g:navigateTo', ActiveLearningView, {});
    });
});
