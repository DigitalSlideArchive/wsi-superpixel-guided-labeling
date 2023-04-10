import router from '@girder/histomicsui/router';
import { registerPluginNamespace } from '@girder/core/pluginUtils';
import { exposePluginConfig } from '@girder/core/utilities/PluginUtils';
import girderEvents from '@girder/core/events';

import ActiveLearningView from './views/body/ActiveLearningView';
import './views/itemList';
import * as WSISuperpixelGuidedLabeling from './index';

const pluginName = 'wsi_superpixel_guided_labeling';
const configRoute = `plugins/${pluginName}/config`;

registerPluginNamespace(pluginName, WSISuperpixelGuidedLabeling);
exposePluginConfig(pluginName, configRoute);

router.route('active-learning', 'active-learning', function () {
    girderEvents.trigger('g:navigateTo', ActiveLearningView, {});
});
